import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  AssemblyError,
  loadAssemblyManifest,
  resolveRecursusProfilePath,
  runAssembledSmoke,
} from '../packages/assembly/lib/index.js'

const repositoryRoot = path.resolve(import.meta.dirname, '..')

function parseArguments(values) {
  const options = new Map()
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index]
    if (key === '--live-codex' || key === '--live-honcho') {
      if (options.has(key)) throw new Error(`smoke command repeats ${key}`)
      options.set(key, true)
      continue
    }
    const value = values[index + 1]
    if (!['--work-root', '--dsh-home', '--name', '--codex-auth-file', '--output'].includes(key) || value === undefined) {
      throw new Error('smoke options must be explicit supported flags or key/value pairs')
    }
    if (options.has(key)) throw new Error(`smoke command repeats ${key}`)
    options.set(key, value)
    index += 1
  }
  const workRoot = options.get('--work-root') ?? process.env.RECURSUS_WORK_ROOT
  const dshHome = options.get('--dsh-home') ?? process.env.DSH_HOME
  const profileName = options.get('--name')
  const output = options.get('--output') ?? 'evaluations/milestone-1-assembled-smoke-report.json'
  const liveCodex = options.has('--live-codex')
  const liveHoncho = options.has('--live-honcho')
  const codexAuthFile = options.get('--codex-auth-file')
  if (typeof workRoot !== 'string' || !path.isAbsolute(workRoot)) throw new Error('--work-root must be absolute')
  if (typeof dshHome !== 'string' || !path.isAbsolute(dshHome)) throw new Error('--dsh-home must be absolute')
  if (typeof profileName !== 'string' || profileName.length === 0) throw new Error('--name is required')
  if (typeof output !== 'string' || path.isAbsolute(output) || output.includes('..')) throw new Error('--output must be repository-relative')
  if (liveCodex && (typeof codexAuthFile !== 'string' || !path.isAbsolute(codexAuthFile))) {
    throw new Error('--live-codex requires an absolute --codex-auth-file')
  }
  return { workRoot, dshHome, profileName, output, liveCodex, liveHoncho, codexAuthFile }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const manifest = await loadAssemblyManifest(path.join(repositoryRoot, 'manifests', 'assembly.json'))
  const profileDirectory = resolveRecursusProfilePath(path, options.dshHome, options.profileName)
  const report = await runAssembledSmoke({
    manifest,
    profileDirectory,
    workRoot: options.workRoot,
    liveCodex: options.liveCodex,
    liveHoncho: options.liveHoncho,
    codexAuthFile: options.codexAuthFile,
  })
  const outputPath = path.resolve(repositoryRoot, options.output)
  const relative = path.relative(repositoryRoot, outputPath)
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('--output escapes the repository')
  }
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  const accepted = JSON.parse(await readFile(outputPath, 'utf8'))
  process.stdout.write(`${JSON.stringify({
    schemaVersion: accepted.schemaVersion,
    assemblyId: accepted.assemblyId,
    platform: accepted.platform,
    output: options.output.replaceAll('\\', '/'),
    status: 'passed',
  }, null, 2)}\n`)
}

try {
  await main()
} catch (error) {
  const failure = error instanceof AssemblyError
    ? { code: error.code, message: error.message }
    : { code: 'ASSEMBLED_SMOKE_COMMAND_FAILED', message: 'assembled smoke command failed before bounded evidence was available' }
  process.stderr.write(`${JSON.stringify({ schemaVersion: 1, status: 'failed', ...failure }, null, 2)}\n`)
  process.exitCode = 1
}
