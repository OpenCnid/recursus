import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import {
  buildLockedDistribution,
  installRecursusProfile,
  loadAssemblyManifest,
  removeRecursusProfile,
  updateRecursusProfile,
  validatePackageIntegrity,
  verifyRecursusProfile,
} from '../lib/index.js'

const execFileAsync = promisify(execFile)
const enabled = process.env.RECURSUS_RUN_PROFILE_INTEGRATION === '1'
const workRoot = process.env.RECURSUS_INTEGRATION_WORK_ROOT
const pnpmModule = process.env.RECURSUS_PROFILE_PNPM_MODULE
const manifestPath = fileURLToPath(new URL('../../../manifests/assembly.json', import.meta.url))
const integrityPath = fileURLToPath(new URL('../../../manifests/package-integrity.json', import.meta.url))
const profileLockPath = fileURLToPath(new URL('../../../manifests/profile-lock.yaml', import.meta.url))

function environmentWithoutCredentials() {
  const environment = { ...process.env }
  for (const key of Object.keys(environment)) {
    if (/(?:TOKEN|SECRET|PASSWORD|API_KEY|AUTHORIZATION|CREDENTIAL|COOKIE)/iu.test(key)) delete environment[key]
  }
  return environment
}

test('the real accepted distribution installs, composes, verifies, and removes one isolated profile', {
  skip: !enabled,
  timeout: 300_000,
}, async () => {
  assert.ok(workRoot !== undefined && path.isAbsolute(workRoot), 'RECURSUS_INTEGRATION_WORK_ROOT must be absolute')
  assert.ok(pnpmModule !== undefined && path.isAbsolute(pnpmModule), 'RECURSUS_PROFILE_PNPM_MODULE must be absolute')
  const manifest = await loadAssemblyManifest(manifestPath)
  const integrity = validatePackageIntegrity(JSON.parse(await readFile(integrityPath, 'utf8')))
  const profileLockContents = await readFile(profileLockPath, 'utf8')
  const distribution = await buildLockedDistribution({ manifest, integrity, profileLockContents, workRoot })
  const evaluationRoot = await mkdtemp(path.join(workRoot, 'profile-integration-'))
  const dshHome = path.join(evaluationRoot, 'dsh-home')
  const profileName = 'recursus-pinned-test'
  const preserved = new Map([
    [path.join(dshHome, 'settings.yaml'), 'host settings\n'],
    [path.join(dshHome, '.credentials.yaml'), 'HOST_REF: host-owned-placeholder\n'],
    [path.join(dshHome, 'profiles', 'unrelated', 'keep.txt'), 'unrelated profile\n'],
    [path.join(evaluationRoot, 'repository', 'keep.txt'), 'repository\n'],
    [path.join(evaluationRoot, 'memory', 'keep.txt'), 'memory\n'],
    [path.join(evaluationRoot, 'artifacts', 'keep.txt'), 'artifact\n'],
  ])
  try {
    for (const [filename, contents] of preserved) {
      await mkdir(path.dirname(filename), { recursive: true })
      await writeFile(filename, contents)
    }
    const options = {
      distributionDirectory: distribution.directory,
      dshHome,
      profileName,
      workRoot,
      packageManager: {
        executable: process.execPath,
        argumentPrefix: [pnpmModule],
        version: '11.19.0',
      },
    }
    const installed = await installRecursusProfile(options)
    assert.equal(installed.evidence.status, 'installed')
    assert.equal(installed.evidence.packageCount, 244)
    assert.deepEqual(installed.evidence.credentialReferences, [
      'DEEPSEEK_API_KEY',
      'HONCHO_API_KEY',
      'OPENAI_CODEX_OAUTH',
    ])
    assert.equal((await installRecursusProfile(options)).evidence.status, 'unchanged')
    assert.equal((await updateRecursusProfile(options)).evidence.status, 'unchanged')
    assert.equal((await verifyRecursusProfile(options)).evidence.status, 'verified')

    const dshBin = path.join(installed.profileDirectory, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    const { stdout } = await execFileAsync(process.execPath, [
      dshBin,
      '--profile',
      profileName,
      '--dump-default-config',
    ], {
      cwd: evaluationRoot,
      env: { ...environmentWithoutCredentials(), DSH_HOME: dshHome },
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    })
    assert.match(stdout, /# == deepseek-openai-codex/u)
    assert.match(stdout, /credentialRef: OPENAI_CODEX_OAUTH/u)
    assert.match(stdout, /# == @deepseek-rlm\/dsh-rlm-bundle/u)
    assert.match(stdout, /# == deepseek-dovetail/u)
    assert.doesNotMatch(stdout, /@deepseek-honcho|HONCHO_API_KEY/u)
    const disabledHoncho = JSON.parse(await readFile(path.join(
      installed.profileDirectory,
      'node_modules',
      '@deepseek-honcho',
      'dsh-honcho-bundle',
      'package.json',
    ), 'utf8'))
    assert.equal(disabledHoncho.name, '@deepseek-honcho/dsh-honcho-bundle')

    const lifecycleCacheMarker = path.join(workRoot, 'caches', 'profile-lifecycle', profileName, 'removal-preserves.txt')
    await mkdir(path.dirname(lifecycleCacheMarker), { recursive: true })
    await writeFile(lifecycleCacheMarker, 'cache survives profile removal\n')
    assert.equal((await removeRecursusProfile(options)).evidence.status, 'removed')
    await assert.rejects(readFile(path.join(installed.profileDirectory, 'package.json')), { code: 'ENOENT' })
    assert.equal(await readFile(lifecycleCacheMarker, 'utf8'), 'cache survives profile removal\n')
    for (const [filename, contents] of preserved) assert.equal(await readFile(filename, 'utf8'), contents)
  } finally {
    await rm(evaluationRoot, { recursive: true, force: true })
  }
})
