import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createPackageIntegrity,
  inspectComponentPackageDirectory,
  loadAssemblyManifest,
  serializePackageIntegrity,
} from '../packages/assembly/lib/index.js'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const workRoot = process.env.RECURSUS_WORK_ROOT
if (workRoot === undefined || !path.isAbsolute(workRoot)) {
  throw new Error('RECURSUS_WORK_ROOT must name an explicit absolute Recursus assembly work root')
}

const manifest = await loadAssemblyManifest(path.join(repositoryRoot, 'manifests', 'assembly.json'))
const evidenceDirectory = path.join(workRoot, 'evidence')
await mkdir(evidenceDirectory, { recursive: true })

const recoverName = process.env.RECURSUS_RECOVER_ACCEPTED_COMPONENT
if (recoverName !== undefined) {
  const component = manifest.components.find((candidate) => candidate.name === recoverName)
  if (component === undefined) throw new Error('RECURSUS_RECOVER_ACCEPTED_COMPONENT is unknown')
  const packages = await inspectComponentPackageDirectory(
    component,
    path.join(workRoot, 'packages', component.name),
    [workRoot],
  )
  await writeFile(path.join(evidenceDirectory, `${component.name}.json`), `${JSON.stringify({
    schemaVersion: 1,
    assemblyId: manifest.assemblyId,
    component: component.name,
    revision: component.revision,
    recoveredAfterLaterComponentFailure: true,
    phases: ['inspect', 'acquire', 'verifyRevision', 'restoreDependencies', 'verifySource', 'build', 'pack', 'inspectPackage'],
    packages: packages.map((item) => ({ ...item, notices: [...item.notices] })),
  }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  process.stdout.write(`recovered and re-inspected ${String(packages.length)} accepted package(s) for ${component.name}\n`)
  process.exit(0)
}

const packagesByComponent = new Map()
const lifecycle = []
for (const component of manifest.components) {
  const checkpointPath = path.join(evidenceDirectory, `${component.name}.json`)
  const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'))
  if (
    checkpoint.schemaVersion !== 1 || checkpoint.assemblyId !== manifest.assemblyId ||
    checkpoint.component !== component.name || checkpoint.revision !== component.revision ||
    !Array.isArray(checkpoint.phases) || checkpoint.phases.join('\0') !==
      ['inspect', 'acquire', 'verifyRevision', 'restoreDependencies', 'verifySource', 'build', 'pack', 'inspectPackage'].join('\0') ||
    !Array.isArray(checkpoint.packages)
  ) {
    throw new Error(`invalid assembly checkpoint for ${component.name}`)
  }
  const inspected = await inspectComponentPackageDirectory(
    component,
    path.join(workRoot, 'packages', component.name),
    [workRoot],
  )
  const checkpointPackages = checkpoint.packages.map((item) => ({ ...item, notices: [...item.notices] }))
  if (JSON.stringify(checkpointPackages) !== JSON.stringify(inspected.map((item) => ({ ...item, notices: [...item.notices] })))) {
    throw new Error(`package bytes differ from checkpoint for ${component.name}`)
  }
  packagesByComponent.set(component.name, inspected)
  lifecycle.push(checkpoint)
}

const integrity = createPackageIntegrity(manifest, packagesByComponent)
const packageReport = {
  schemaVersion: 1,
  assemblyId: manifest.assemblyId,
  platform: process.platform === 'win32' ? 'windows-x64' : 'linux-x64',
  componentRevisions: Object.fromEntries(manifest.components.map((component) => [component.name, component.revision])),
  lifecycle,
  security: {
    credentialsFound: false,
    developerAbsolutePathsFound: false,
    sourceControlMetadataFound: false,
    entriesOutsidePackageBoundaryFound: false,
  },
}
await writeFile(
  path.join(repositoryRoot, 'manifests', 'package-integrity.json'),
  serializePackageIntegrity(integrity),
  { encoding: 'utf8', flag: 'wx' },
)
await writeFile(
  path.join(repositoryRoot, 'evaluations', 'milestone-1-package-report.json'),
  `${JSON.stringify(packageReport, null, 2)}\n`,
  { encoding: 'utf8', flag: 'wx' },
)
process.stdout.write(`finalized ${String(integrity.packages.length)} accepted package(s)\n`)
