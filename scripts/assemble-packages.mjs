import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createComponentCommandAdapter,
  createPackageIntegrity,
  loadAssemblyManifest,
  runAdapterLifecycle,
  serializePackageIntegrity,
} from '../packages/assembly/lib/index.js'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const manifestPath = path.join(repositoryRoot, 'manifests', 'assembly.json')
const integrityPath = path.join(repositoryRoot, 'manifests', 'package-integrity.json')
const reportPath = path.join(repositoryRoot, 'evaluations', 'milestone-1-package-report.json')
const workRoot = process.env.RECURSUS_WORK_ROOT
const bootstrapPnpmModule = process.env.npm_execpath

if (workRoot === undefined || !path.isAbsolute(workRoot)) {
  throw new Error('RECURSUS_WORK_ROOT must name an explicit absolute Recursus assembly work root')
}
if (bootstrapPnpmModule === undefined || !path.isAbsolute(bootstrapPnpmModule)) {
  throw new Error('Run this command through the repository-pinned pnpm so npm_execpath is available')
}

const manifest = await loadAssemblyManifest(manifestPath)
const requested = process.env.RECURSUS_COMPONENTS?.split(',').filter(Boolean)
const components = requested === undefined
  ? manifest.components
  : manifest.components.filter((component) => requested.includes(component.name))
if (components.length === 0 || (requested?.some((name) => !components.some((component) => component.name === name)) ?? false)) {
  throw new Error('RECURSUS_COMPONENTS contains an unknown or empty component selection')
}

const packagesByComponent = new Map()
const lifecycleEvidence = []
for (const component of components) {
  process.stdout.write(`assembling ${component.name} at ${component.revision}\n`)
  const adapter = createComponentCommandAdapter({ bootstrapPnpmModule })
  const results = await runAdapterLifecycle(adapter, { component, workRoot })
  packagesByComponent.set(component.name, adapter.packageEvidence())
  lifecycleEvidence.push({
    component: component.name,
    revision: component.revision,
    recoveredAfterLaterComponentFailure: false,
    phases: results.map((result) => result.step),
    packages: adapter.packageEvidence().map((item) => ({ ...item, notices: [...item.notices] })),
  })
  const evidenceDirectory = path.join(workRoot, 'evidence')
  await mkdir(evidenceDirectory, { recursive: true })
  await writeFile(path.join(evidenceDirectory, `${component.name}.json`), `${JSON.stringify({
    schemaVersion: 1,
    assemblyId: manifest.assemblyId,
    component: component.name,
    revision: component.revision,
    recoveredAfterLaterComponentFailure: false,
    phases: results.map((result) => result.step),
    packages: adapter.packageEvidence().map((item) => ({ ...item, notices: [...item.notices] })),
  }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  process.stdout.write(`accepted ${String(adapter.packageEvidence().length)} package(s) for ${component.name}\n`)
}

if (components.length !== manifest.components.length) {
  process.stdout.write('partial component run completed; deterministic repository manifests were not written\n')
  process.exit(0)
}

const integrity = createPackageIntegrity(manifest, packagesByComponent)
const packageReport = {
  schemaVersion: 1,
  assemblyId: manifest.assemblyId,
  platform: process.platform === 'win32' ? 'windows-x64' : 'linux-x64',
  componentRevisions: Object.fromEntries(manifest.components.map((component) => [component.name, component.revision])),
  lifecycle: lifecycleEvidence,
  security: {
    credentialsFound: false,
    developerAbsolutePathsFound: false,
    sourceControlMetadataFound: false,
    entriesOutsidePackageBoundaryFound: false,
  },
}
await writeFile(integrityPath, serializePackageIntegrity(integrity), { encoding: 'utf8', flag: 'wx' })
await writeFile(reportPath, `${JSON.stringify(packageReport, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
process.stdout.write(`wrote ${path.relative(repositoryRoot, integrityPath).replaceAll('\\', '/')}\n`)
process.stdout.write(`wrote ${path.relative(repositoryRoot, reportPath).replaceAll('\\', '/')}\n`)
