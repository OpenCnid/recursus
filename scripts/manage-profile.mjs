import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  AssemblyError,
  buildLockedDistribution,
  installRecursusProfile,
  loadAssemblyManifest,
  removeRecursusProfile,
  updateRecursusProfile,
  validatePackageIntegrity,
  verifyRecursusProfile,
} from '../packages/assembly/lib/index.js'

const root = path.resolve(import.meta.dirname, '..')

function parseArguments(values) {
  const [operation, ...rest] = values
  if (!['build', 'install', 'update', 'verify', 'remove'].includes(operation)) {
    throw new Error('usage: pnpm profile <build|install|update|verify|remove> --work-root <absolute> [--dsh-home <absolute> --name <profile>]')
  }
  const options = new Map()
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index]
    const value = rest[index + 1]
    if (!['--work-root', '--dsh-home', '--name', '--pnpm-module'].includes(key) || value === undefined) {
      throw new Error('profile command options must be explicit key/value pairs')
    }
    if (options.has(key)) throw new Error(`profile command repeats ${key}`)
    options.set(key, value)
  }
  const workRoot = options.get('--work-root') ?? process.env.RECURSUS_WORK_ROOT
  if (workRoot === undefined || !path.isAbsolute(workRoot)) throw new Error('--work-root must be an absolute path')
  if (operation === 'build') return { operation, workRoot }
  const dshHome = options.get('--dsh-home') ?? process.env.DSH_HOME
  const profileName = options.get('--name')
  const pnpmModule = options.get('--pnpm-module') ?? process.env.RECURSUS_PNPM_MODULE ?? process.env.npm_execpath
  if (dshHome === undefined || !path.isAbsolute(dshHome)) throw new Error('--dsh-home must be an absolute path')
  if (profileName === undefined) throw new Error('--name is required')
  if (pnpmModule === undefined || !path.isAbsolute(pnpmModule)) {
    throw new Error('an absolute exact pnpm module is required through --pnpm-module, RECURSUS_PNPM_MODULE, or npm_execpath')
  }
  return { operation, workRoot, dshHome, profileName, pnpmModule }
}

async function loadInputs() {
  const manifest = await loadAssemblyManifest(path.join(root, 'manifests', 'assembly.json'))
  const integrity = validatePackageIntegrity(JSON.parse(
    await readFile(path.join(root, 'manifests', 'package-integrity.json'), 'utf8'),
  ))
  const profileLockContents = await readFile(path.join(root, 'manifests', manifest.profileLock.path), 'utf8')
  return { manifest, integrity, profileLockContents }
}

async function main() {
  const command = parseArguments(process.argv.slice(2))
  const { manifest, integrity, profileLockContents } = await loadInputs()
  const distribution = await buildLockedDistribution({
    manifest,
    integrity,
    profileLockContents,
    workRoot: command.workRoot,
  })
  if (command.operation === 'build') {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      operation: 'build',
      assemblyId: distribution.manifest.assemblyId,
      packageCount: distribution.manifest.packages.length,
      manifestSha256: distribution.manifestSha256,
      status: distribution.reused ? 'unchanged' : 'built',
    }, null, 2)}\n`)
    return
  }
  const options = {
    distributionDirectory: distribution.directory,
    dshHome: command.dshHome,
    profileName: command.profileName,
    workRoot: command.workRoot,
    packageManager: {
      executable: process.execPath,
      argumentPrefix: [command.pnpmModule],
      version: '11.19.0',
    },
  }
  const lifecycle = {
    install: installRecursusProfile,
    update: updateRecursusProfile,
    verify: verifyRecursusProfile,
    remove: removeRecursusProfile,
  }
  const result = await lifecycle[command.operation](options)
  process.stdout.write(`${JSON.stringify(result.evidence, null, 2)}\n`)
}

try {
  await main()
} catch (error) {
  const failure = error instanceof AssemblyError
    ? { code: error.code, message: error.message }
    : { code: 'PROFILE_COMMAND_FAILED', message: 'profile command failed before bounded evidence was available' }
  process.stderr.write(`${JSON.stringify({ schemaVersion: 1, status: 'failed', ...failure }, null, 2)}\n`)
  process.exitCode = 1
}
