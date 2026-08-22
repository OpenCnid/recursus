import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import {
  buildLockedDistribution,
  installRecursusProfile,
  removeRecursusProfile,
  resolveRecursusProfilePath,
  updateRecursusProfile,
  verifyRecursusProfile,
} from '../lib/index.js'

function tarHeader(name, size) {
  const header = Buffer.alloc(512)
  header.write(name, 0, 100, 'utf8')
  header.write('0000644\0', 100, 8, 'ascii')
  header.write('0000000\0', 108, 8, 'ascii')
  header.write('0000000\0', 116, 8, 'ascii')
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii')
  header.write('00000000000\0', 136, 12, 'ascii')
  header.fill(32, 148, 156)
  header.write('0', 156, 1, 'ascii')
  header.write('ustar\0', 257, 6, 'ascii')
  header.write('00', 263, 2, 'ascii')
  let checksum = 0
  for (const byte of header) checksum += byte
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  return header
}

function fixtureArchive(name, version) {
  const blocks = []
  for (const [entryName, value] of [
    ['package/package.json', JSON.stringify({ name, version })],
    ['package/LICENSE', 'MIT\n'],
    ['package/lib/index.js', 'export {}\n'],
  ]) {
    const contents = Buffer.from(value)
    blocks.push(tarHeader(entryName, contents.length), contents)
    const padding = (512 - (contents.length % 512)) % 512
    if (padding > 0) blocks.push(Buffer.alloc(padding))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks), { mtime: 0 })
}

function digest(value) {
  return import('node:crypto').then(({ createHash }) => createHash('sha256').update(value).digest('hex'))
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'recursus-profile-'))
  const workRoot = path.join(root, 'work')
  const dshHome = path.join(root, 'dsh-home')
  const packageManagerExecutable = path.join(root, 'pnpm-fixture.exe')
  await mkdir(path.join(workRoot, 'packages', 'deepseek-harness'), { recursive: true })
  await mkdir(path.join(workRoot, 'packages', 'fixture-provider'), { recursive: true })
  await mkdir(dshHome, { recursive: true })
  await writeFile(packageManagerExecutable, '')
  const archiveSpecs = [
    ['deepseek-harness', 'dsh.tgz', '@deepseek-ai/dsh', '0.1.0'],
    ['deepseek-harness', 'base.tgz', '@deepseek-ai/dsh-base', '0.1.0'],
    ['fixture-provider', 'provider.tgz', '@fixture/provider', '2.0.0'],
  ]
  const versions = new Map()
  const packages = []
  for (const [component, filename, name, version] of archiveSpecs) {
    const archive = fixtureArchive(name, version)
    await writeFile(path.join(workRoot, 'packages', component, filename), archive)
    versions.set(name, version)
    packages.push({
      component,
      path: `${component}/${filename}`,
      sha256: await digest(archive),
      bytes: archive.byteLength,
    })
  }
  packages.sort((left, right) => `${left.component}\0${left.path}`.localeCompare(`${right.component}\0${right.path}`))
  const component = (name, revision, profileContribution) => ({
    name,
    revision,
    license: {
      noticeFiles: ['LICENSE'],
      redistribution: 'allowed-with-notices',
    },
    profileContribution,
  })
  const manifest = {
    assemblyId: 'fixture-assembly-v1',
    workRoot: { paths: { packages: 'packages' } },
    components: [
      component('deepseek-harness', '1'.repeat(40), {
        kind: 'profile-foundation',
        packages: ['@deepseek-ai/dsh-base'],
        credentialReferences: [],
      }),
      component('fixture-provider', '2'.repeat(40), {
        kind: 'bundle-patch',
        packages: ['@fixture/provider'],
        credentialReferences: ['FIXTURE_OAUTH'],
      }),
    ],
  }
  const integrity = {
    $schema: './package-integrity.schema.json',
    schemaVersion: 1,
    assemblyId: manifest.assemblyId,
    algorithm: 'sha256',
    packages,
  }
  const profileLockContents = "lockfileVersion: '9.0'\n"
  manifest.profileLock = {
    path: 'profile-lock.yaml',
    sha256: await digest(profileLockContents),
    packageManager: { name: 'pnpm', version: '11.19.0' },
  }
  const invocations = []
  const runProcess = async (invocation) => {
    invocations.push(invocation)
    assert.equal(invocation.environment.FIXTURE_ACCESS_TOKEN, undefined)
    assert.equal(invocation.environment.FIXTURE_PASSWORD, undefined)
    if (invocation.arguments.at(-1) === '--version') {
      return { exitCode: 0, stdoutBytes: 8, stderrBytes: 0, stdoutTail: '11.19.0\n', stderrTail: '' }
    }
    const profile = JSON.parse(await readFile(path.join(invocation.cwd, 'package.json'), 'utf8'))
    for (const name of Object.keys(profile.dependencies)) {
      const packageDirectory = path.join(invocation.cwd, 'node_modules', ...name.split('/'))
      await mkdir(packageDirectory, { recursive: true })
      await writeFile(path.join(packageDirectory, 'package.json'), `${JSON.stringify({ name, version: versions.get(name) }, null, 2)}\n`)
    }
    await writeFile(path.join(invocation.cwd, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n")
    return { exitCode: 0, stdoutBytes: 0, stderrBytes: 0, stdoutTail: '', stderrTail: '' }
  }
  return {
    root,
    workRoot,
    dshHome,
    manifest,
    integrity,
    profileLockContents,
    versions,
    invocations,
    runProcess,
    packageManager: { executable: packageManagerExecutable, version: '11.19.0' },
  }
}

test('locked distribution build is deterministic, idempotent, and contains accepted bytes only', async () => {
  const context = await fixture()
  const first = await buildLockedDistribution(context)
  const firstContents = await readFile(path.join(first.directory, 'recursus-distribution.json'), 'utf8')
  assert.equal(first.reused, false)
  assert.equal(first.manifest.packages.length, 3)
  assert.deepEqual(first.manifest.bundles, ['@deepseek-ai/dsh-base', '@fixture/provider'])
  assert.deepEqual(first.manifest.credentialReferences, ['FIXTURE_OAUTH'])
  assert.equal(firstContents.includes(context.root), false)
  assert.equal(firstContents.includes(context.root.replaceAll('\\', '/')), false)

  const second = await buildLockedDistribution(context)
  assert.equal(second.reused, true)
  assert.equal(second.manifestSha256, first.manifestSha256)
  assert.equal(await readFile(path.join(second.directory, 'recursus-distribution.json'), 'utf8'), firstContents)

  const changedManifest = structuredClone(context.manifest)
  changedManifest.components[0].profileContribution.credentialReferences = ['CHANGED_CREDENTIAL_REF']
  const changed = await buildLockedDistribution({ ...context, manifest: changedManifest })
  assert.equal(changed.reused, false)
  assert.notEqual(changed.directory, first.directory)
  await assert.rejects(
    buildLockedDistribution({ ...context, profileLockContents: `${context.profileLockContents}changed\n` }),
    { code: 'PROFILE_LOCK_MISMATCH' },
  )
})

test('install, update, verify, and removal are idempotent and preserve every unrelated root', async () => {
  const context = await fixture()
  const distribution = await buildLockedDistribution(context)
  const unrelated = new Map([
    [path.join(context.dshHome, 'settings.yaml'), 'settings\n'],
    [path.join(context.dshHome, '.credentials.yaml'), 'host-owned\n'],
    [path.join(context.dshHome, 'profiles', 'unrelated', 'state.txt'), 'unrelated profile\n'],
    [path.join(context.root, 'repositories', 'repo.txt'), 'repository\n'],
    [path.join(context.root, 'memory', 'memory.txt'), 'memory\n'],
    [path.join(context.root, 'artifacts', 'artifact.txt'), 'artifact\n'],
    [path.join(context.workRoot, 'caches', 'other-component', 'cache.txt'), 'cache\n'],
  ])
  for (const [filename, contents] of unrelated) {
    await mkdir(path.dirname(filename), { recursive: true })
    await writeFile(filename, contents)
  }
  const priorToken = process.env.FIXTURE_ACCESS_TOKEN
  const priorPassword = process.env.FIXTURE_PASSWORD
  process.env.FIXTURE_ACCESS_TOKEN = 'sk-fixturecredential123456789'
  process.env.FIXTURE_PASSWORD = 'do-not-copy'
  try {
    const options = {
      distributionDirectory: distribution.directory,
      dshHome: context.dshHome,
      profileName: 'recursus-test',
      workRoot: context.workRoot,
      packageManager: context.packageManager,
      runProcess: context.runProcess,
    }
    const installed = await installRecursusProfile(options)
    assert.equal(installed.evidence.status, 'installed')
    assert.equal(installed.evidence.packageCount, 3)
    assert.deepEqual(installed.evidence.credentialReferences, ['FIXTURE_OAUTH'])
    assert.equal(JSON.stringify(installed.evidence).includes(context.root), false)
    assert.equal(context.invocations.length, 2)
    assert.equal(context.invocations[1].arguments.includes('--frozen-lockfile'), true)

    const unchanged = await installRecursusProfile(options)
    assert.equal(unchanged.evidence.status, 'unchanged')
    assert.equal(context.invocations.length, 2)

    const profileManifestPath = path.join(installed.profileDirectory, 'package.json')
    const profileManifest = await readFile(profileManifestPath, 'utf8')
    assert.equal(profileManifest.includes('sk-fixturecredential'), false)
    assert.equal(profileManifest.includes('do-not-copy'), false)
    assert.equal(profileManifest.includes('FIXTURE_OAUTH'), true)
    const driftedManifest = `${profileManifest.trimEnd()} \n`
    await writeFile(profileManifestPath, driftedManifest)

    const failingRunner = async (invocation) => invocation.arguments.at(-1) === '--version'
      ? { exitCode: 0, stdoutBytes: 8, stderrBytes: 0, stdoutTail: '11.19.0\n', stderrTail: '' }
      : { exitCode: 1, stdoutBytes: 0, stderrBytes: 0, stdoutTail: '', stderrTail: '' }
    await assert.rejects(updateRecursusProfile({ ...options, runProcess: failingRunner }), { code: 'PROFILE_INSTALL_FAILED' })
    assert.equal(await readFile(profileManifestPath, 'utf8'), driftedManifest)

    const updated = await updateRecursusProfile(options)
    assert.equal(updated.evidence.status, 'updated')
    assert.equal(context.invocations.length, 4)
    const updateUnchanged = await updateRecursusProfile(options)
    assert.equal(updateUnchanged.evidence.status, 'unchanged')
    assert.equal(context.invocations.length, 4)
    await rm(path.join(updated.profileDirectory, 'node_modules', '@fixture', 'provider'), { recursive: true })
    assert.equal((await updateRecursusProfile(options)).evidence.status, 'updated')
    assert.equal(context.invocations.length, 6)
    assert.equal((await verifyRecursusProfile(options)).evidence.status, 'verified')

    const removed = await removeRecursusProfile(options)
    assert.equal(removed.evidence.status, 'removed')
    await assert.rejects(readFile(path.join(removed.profileDirectory, 'package.json')), { code: 'ENOENT' })
    for (const [filename, contents] of unrelated) assert.equal(await readFile(filename, 'utf8'), contents)
  } finally {
    if (priorToken === undefined) delete process.env.FIXTURE_ACCESS_TOKEN
    else process.env.FIXTURE_ACCESS_TOKEN = priorToken
    if (priorPassword === undefined) delete process.env.FIXTURE_PASSWORD
    else process.env.FIXTURE_PASSWORD = priorPassword
  }
})

test('profile name, ownership, lock, and symlink boundaries fail closed', async () => {
  const context = await fixture()
  const distribution = await buildLockedDistribution(context)
  const base = {
    distributionDirectory: distribution.directory,
    dshHome: context.dshHome,
    workRoot: context.workRoot,
    packageManager: context.packageManager,
    runProcess: context.runProcess,
  }
  for (const profileName of ['', '..', 'node_modules', '../escape', 'UPPER', 'con', 'trailing.']) {
    await assert.rejects(installRecursusProfile({ ...base, profileName }), { code: 'INVALID_PROFILE_NAME' })
  }

  const unowned = path.join(context.dshHome, 'profiles', 'unowned')
  await mkdir(unowned, { recursive: true })
  await writeFile(path.join(unowned, 'keep.txt'), 'keep\n')
  await assert.rejects(removeRecursusProfile({ ...base, profileName: 'unowned' }), { code: 'PROFILE_NOT_RECURSUS_OWNED' })
  assert.equal(await readFile(path.join(unowned, 'keep.txt'), 'utf8'), 'keep\n')

  const outside = path.join(context.root, 'outside')
  await mkdir(outside)
  const linked = path.join(context.dshHome, 'profiles', 'linked')
  await symlink(outside, linked, process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(removeRecursusProfile({ ...base, profileName: 'linked' }), { code: 'PROFILE_NOT_INSTALLED' })
  await writeFile(path.join(outside, 'survives.txt'), 'outside\n')
  assert.equal(await readFile(path.join(outside, 'survives.txt'), 'utf8'), 'outside\n')
})

test('update and removal accept a valid profile owned by a prior locked distribution', async () => {
  const context = await fixture()
  const firstDistribution = await buildLockedDistribution(context)
  const priorOptions = {
    distributionDirectory: firstDistribution.directory,
    dshHome: context.dshHome,
    profileName: 'recursus-upgrade',
    workRoot: context.workRoot,
    packageManager: context.packageManager,
    runProcess: context.runProcess,
  }
  await installRecursusProfile(priorOptions)

  const changedManifest = structuredClone(context.manifest)
  changedManifest.components[0].profileContribution.credentialReferences = ['CHANGED_CREDENTIAL_REF']
  const nextDistribution = await buildLockedDistribution({ ...context, manifest: changedManifest })
  const nextOptions = { ...priorOptions, distributionDirectory: nextDistribution.directory }
  await assert.rejects(installRecursusProfile(nextOptions), { code: 'PROFILE_DISTRIBUTION_MISMATCH' })
  const updated = await updateRecursusProfile(nextOptions)
  assert.equal(updated.evidence.status, 'updated')
  assert.deepEqual(updated.evidence.credentialReferences, ['CHANGED_CREDENTIAL_REF', 'FIXTURE_OAUTH'])
  assert.equal((await verifyRecursusProfile(nextOptions)).evidence.status, 'verified')

  const oldRemovalOptions = { ...priorOptions, profileName: 'recursus-remove-old' }
  await installRecursusProfile(oldRemovalOptions)
  const currentRemovalOptions = { ...nextOptions, profileName: 'recursus-remove-old' }
  const removed = await removeRecursusProfile(currentRemovalOptions)
  assert.equal(removed.evidence.status, 'removed')
  assert.deepEqual(removed.evidence.credentialReferences, ['FIXTURE_OAUTH'])
})

test('profile containment uses native Windows and POSIX path rules', () => {
  assert.equal(
    resolveRecursusProfilePath(path.win32, 'C:\\dsh-home', 'recursus-dev'),
    'C:\\dsh-home\\profiles\\recursus-dev',
  )
  assert.equal(
    resolveRecursusProfilePath(path.posix, '/opt/dsh-home', 'recursus-dev'),
    '/opt/dsh-home/profiles/recursus-dev',
  )
  assert.throws(() => resolveRecursusProfilePath(path.win32, 'relative', 'recursus'), { code: 'DSH_HOME_NOT_ABSOLUTE' })
  assert.throws(() => resolveRecursusProfilePath(path.posix, '/opt/dsh', '../outside'), { code: 'INVALID_PROFILE_NAME' })
})
