import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const requiredFiles = [
  'README.md',
  'GAMEPLAN.md',
  'SPEC.md',
  'NEXT_SESSION_PROMPT.md',
  'AGENTS.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'docs/ARCHITECTURE.md',
  'docs/ASSEMBLY.md',
  'evaluations/milestone-1-slice-1.json',
  'evaluations/milestone-1-package-report-blocked-99f6f02.json',
  'evaluations/milestone-1-package-report.json',
  'manifests/components.json',
  'manifests/assembly.json',
  'manifests/assembly.schema.json',
  'manifests/package-integrity.json',
  'manifests/package-integrity.schema.json',
  'packages/assembly/package.json',
  'packages/assembly/README.md',
]

const contents = new Map(
  await Promise.all(
    requiredFiles.map(async (path) => [path, await readFile(resolve(root, path), 'utf8')]),
  ),
)

const manifest = JSON.parse(contents.get('manifests/components.json'))
assert.equal(manifest.schemaVersion, 1)
assert.equal(manifest.runtime, 'recursus')
assert.equal(manifest.components.length, 5)

const expectedComponents = new Set([
  'deepseek-harness',
  'deepseek-openai-codex',
  'deepseek-rlm',
  'deepseek-honcho',
  'deepseek-dovetail',
])
const names = new Set()
const roles = new Set()
for (const component of manifest.components) {
  assert.match(component.name, /^[a-z0-9-]+$/u)
  assert.match(component.role, /^[a-z0-9-]+$/u)
  assert.match(component.revision, /^[0-9a-f]{40}$/u)
  assert.match(component.repository, /^https:\/\/github\.com\/OpenCnid\//u)
  assert.equal(typeof component.license, 'string')
  assert.ok(component.license.length > 0)
  assert.equal(names.has(component.name), false)
  assert.equal(roles.has(component.role), false)
  names.add(component.name)
  roles.add(component.role)
}
assert.deepEqual(names, expectedComponents)

const assembly = JSON.parse(contents.get('manifests/assembly.json'))
assert.equal(assembly.$schema, './assembly.schema.json')
assert.equal(assembly.schemaVersion, 1)
assert.equal(assembly.runtime, 'recursus')
assert.equal(assembly.baseline, 'd8425e54102d3d144f2b1f6f125c0581cee952ed')
assert.equal(assembly.workRoot.operatorConfigured, true)
assert.deepEqual(assembly.workRoot.paths, {
  sources: 'sources',
  caches: 'caches',
  packages: 'packages',
})
assert.equal(assembly.integrityOutput.deterministic, true)
assert.equal('generatedAt' in assembly, false)
assert.equal(assembly.components.length, manifest.components.length)
const assemblyByName = new Map(assembly.components.map((component) => [component.name, component]))
for (const locked of manifest.components) {
  const component = assemblyByName.get(locked.name)
  assert.ok(component, `assembly lock is missing ${locked.name}`)
  for (const key of ['role', 'repository', 'revision', 'version']) {
    assert.equal(component[key], locked[key], `${locked.name} ${key} differs from the accepted component lock`)
  }
  assert.equal(component.license.declared, locked.license)
  assert.match(component.toolchain.packageManager.version, /^\d+\.\d+\.\d+$/u)
  assert.ok(component.lockfiles.length > 0)
  for (const lockfile of component.lockfiles) {
    assert.match(lockfile.sha256, /^[0-9a-f]{64}$/u)
    assert.doesNotMatch(lockfile.path, /^(?:[A-Za-z]:|\/)|(?:^|\/)\.\.(?:\/|$)|\\/u)
  }
  for (const phase of ['restoreDependencies', 'verifySource', 'build', 'pack', 'inspectPackage']) {
    assert.ok(component.entrypoints[phase].length > 0, `${locked.name} has no ${phase} entry point`)
  }
  assert.ok(component.pack.selectors.length > 0)
  assert.match(component.compatibility.dshRevision, /^[0-9a-f]{40}$/u)
}
assert.equal(assemblyByName.get('deepseek-openai-codex').compatibility.nestedPins['pi-ai'], '0.84.2')
assert.equal(assemblyByName.get('deepseek-honcho').compatibility.nestedPins['honcho-sdk'], '2.3.0')
assert.equal(
  assemblyByName.get('deepseek-rlm').compatibility.nestedPins['rlm-compute-boundary'],
  '79b6b28e16c7305e8e791f2d8c9d2935e75ade60',
)
assert.equal(
  assemblyByName.get('deepseek-dovetail').compatibility.nestedPins['dovetail-source'],
  '69f89e3322847fb11665980c16598494a9eacca0',
)

const assemblySchema = JSON.parse(contents.get('manifests/assembly.schema.json'))
assert.equal(assemblySchema.$schema, 'https://json-schema.org/draft/2020-12/schema')
assert.equal(assemblySchema.additionalProperties, false)
const integritySchema = JSON.parse(contents.get('manifests/package-integrity.schema.json'))
assert.equal(integritySchema.properties.algorithm.const, 'sha256')
assert.deepEqual(integritySchema.properties.packages.items.required, ['component', 'path', 'sha256', 'bytes'])

const expectedPackageCounts = {
  'deepseek-dovetail': 1,
  'deepseek-harness': 231,
  'deepseek-honcho': 6,
  'deepseek-openai-codex': 1,
  'deepseek-rlm': 5,
}
const compareCodeUnits = (left, right) => (left < right ? -1 : left > right ? 1 : 0)
const integrity = JSON.parse(contents.get('manifests/package-integrity.json'))
assert.equal(integrity.$schema, './package-integrity.schema.json')
assert.equal(integrity.schemaVersion, 1)
assert.equal(integrity.assemblyId, assembly.assemblyId)
assert.equal(integrity.algorithm, 'sha256')
assert.equal(integrity.packages.length, 244)

const integrityKeys = integrity.packages.map((entry) => `${entry.component}\0${entry.path}`)
assert.deepEqual(integrityKeys, [...integrityKeys].sort(compareCodeUnits))
assert.equal(new Set(integrityKeys).size, integrityKeys.length)

const integrityByPath = new Map()
const actualPackageCounts = {}
for (const entry of integrity.packages) {
  assert.ok(expectedComponents.has(entry.component), `unknown integrity component ${entry.component}`)
  assert.match(entry.path, /^[a-z0-9][A-Za-z0-9+._@/-]*\.tgz$/u)
  assert.doesNotMatch(entry.path, /^(?:[A-Za-z]:|\/)|(?:^|\/)\.\.(?:\/|$)|\\/u)
  assert.ok(entry.path.startsWith(`${entry.component}/`))
  assert.match(entry.sha256, /^[0-9a-f]{64}$/u)
  assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes > 0)
  integrityByPath.set(entry.path, entry)
  actualPackageCounts[entry.component] = (actualPackageCounts[entry.component] ?? 0) + 1
}
assert.deepEqual(actualPackageCounts, expectedPackageCounts)

const packageReport = JSON.parse(contents.get('evaluations/milestone-1-package-report.json'))
assert.equal(packageReport.schemaVersion, 1)
assert.equal(packageReport.assemblyId, assembly.assemblyId)
assert.equal(packageReport.platform, 'windows-x64')
assert.deepEqual(
  packageReport.componentRevisions,
  Object.fromEntries(manifest.components.map((component) => [component.name, component.revision])),
)
assert.equal(packageReport.lifecycle.length, manifest.components.length)
const lifecycleByName = new Map(packageReport.lifecycle.map((component) => [component.component, component]))
assert.equal(lifecycleByName.size, manifest.components.length)
const expectedPhases = [
  'inspect',
  'acquire',
  'verifyRevision',
  'restoreDependencies',
  'verifySource',
  'build',
  'pack',
  'inspectPackage',
]
let reportedPackages = 0
for (const component of manifest.components) {
  const lifecycle = lifecycleByName.get(component.name)
  assert.ok(lifecycle, `package report is missing ${component.name}`)
  assert.equal(lifecycle.revision, component.revision)
  assert.deepEqual(lifecycle.phases, expectedPhases)
  assert.equal(typeof lifecycle.recoveredAfterLaterComponentFailure, 'boolean')
  assert.equal(lifecycle.packages.length, expectedPackageCounts[component.name])
  reportedPackages += lifecycle.packages.length
  for (const inspected of lifecycle.packages) {
    const path = `${component.name}/${inspected.relativePath}`
    const accepted = integrityByPath.get(path)
    assert.ok(accepted, `package report contains unaccepted archive ${path}`)
    assert.equal(inspected.sha256, accepted.sha256)
    assert.equal(inspected.bytes, accepted.bytes)
    assert.match(inspected.contentsSha256, /^[0-9a-f]{64}$/u)
    assert.ok(Number.isSafeInteger(inspected.entryCount) && inspected.entryCount > 0)
    assert.ok(inspected.notices.length > 0)
  }
}
assert.equal(reportedPackages, integrity.packages.length)
assert.deepEqual(packageReport.security, {
  credentialsFound: false,
  developerAbsolutePathsFound: false,
  sourceControlMetadataFound: false,
  entriesOutsidePackageBoundaryFound: false,
})

const blockedPackageReport = JSON.parse(
  contents.get('evaluations/milestone-1-package-report-blocked-99f6f02.json'),
)
assert.equal(blockedPackageReport.schemaVersion, 1)
assert.equal(blockedPackageReport.assemblyId, assembly.assemblyId)
assert.equal(blockedPackageReport.platform, 'windows-x64')
assert.equal(blockedPackageReport.status, 'blocked-component-owned-package-path-leak')
assert.equal(blockedPackageReport.observedRun.producedPackages, 244)
assert.equal(blockedPackageReport.observedRun.passedExactWorkRootScan.packages, 13)
assert.equal(blockedPackageReport.blocker.component, 'deepseek-harness')
assert.equal(blockedPackageReport.blocker.code, 'PACKAGE_CONTAINS_DEVELOPER_PATH')
assert.equal(blockedPackageReport.blocker.affectedPackages, 29)
assert.equal(blockedPackageReport.blocker.packagePaths.length, 29)
assert.equal(new Set(blockedPackageReport.blocker.packagePaths).size, 29)
assert.deepEqual(blockedPackageReport.blocker.packagePaths, [...blockedPackageReport.blocker.packagePaths].sort())
assert.equal(blockedPackageReport.integrity.status, 'not-generated')
assert.equal(blockedPackageReport.integrity.acceptedPackages, 0)
assert.deepEqual(blockedPackageReport.security, {
  credentialsFound: false,
  developerAbsolutePathsFound: true,
  sourceControlMetadataFound: false,
  entriesOutsidePackageBoundaryFound: false,
})

const sliceEvidence = JSON.parse(contents.get('evaluations/milestone-1-slice-1.json'))
assert.equal(sliceEvidence.schemaVersion, 1)
assert.equal(sliceEvidence.milestone, 1)
assert.equal(sliceEvidence.slice, 'assembly-schema-contract-acquisition')
assert.equal(sliceEvidence.checks.deterministicTests.passed, 15)
assert.equal(sliceEvidence.checks.publicPinIntegration.passed, 1)
assert.equal(sliceEvidence.checks.publicPinIntegration.credentialUse, false)
assert.equal(sliceEvidence.packageIntegrity.acceptedPackages, 0)
assert.ok(sliceEvidence.criteria.some((criterion) => criterion.spec === '20.6' && criterion.status === 'incomplete'))

const license = contents.get('LICENSE')
assert.match(license, /^MIT License/u)
assert.match(license, /Copyright \(c\) 2026 OpenCnid contributors/u)

const notices = contents.get('THIRD_PARTY_NOTICES.md')
for (const name of expectedComponents) assert.ok(notices.includes(name), `missing notice for ${name}`)

const readme = contents.get('README.md')
assert.ok(readme.includes('DeepSeek Harness remains the control plane'))
assert.ok(readme.includes('Standing on the shoulders of giants'))
assert.ok(readme.includes('not an official DeepSeek, OpenAI, Honcho, or Prime product'))

const spec = contents.get('SPEC.md')
for (let milestone = 0; milestone <= 9; milestone += 1) {
  assert.ok(spec.includes(`Milestone ${milestone}`), `SPEC.md is missing Milestone ${milestone}`)
}
assert.ok(spec.includes('Current implementation milestone: Milestone 1'))
assert.ok(spec.includes('A provider double is appropriate'))

const nextSessionPrompt = contents.get('NEXT_SESSION_PROMPT.md')
assert.ok(nextSessionPrompt.includes('Treat `SPEC.md` as normative'))
assert.ok(nextSessionPrompt.includes('Milestone 0 is complete'))
assert.ok(nextSessionPrompt.includes('Continue Milestone 1'))
for (const component of manifest.components) {
  assert.ok(
    nextSessionPrompt.includes(component.revision),
    `next-session prompt is missing the ${component.name} revision`,
  )
}

const combined = [...contents.values()].join('\n')
assert.equal(/\b(?:TODO|FIXME)\b/u.test(combined), false)

console.log(
  `recursus verified: ${manifest.components.length} accepted component pins; deterministic integrity covers ${integrity.packages.length} inspected packages`,
)
