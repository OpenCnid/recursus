import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  currentHarnessRevision,
  verifyEvidenceTransition,
} from './verify-evidence-transition.mjs'

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
  'evaluations/milestone-1-predecessor-evidence-identity.json',
  'evaluations/milestone-1-profile-lifecycle-report.json',
  'evaluations/milestone-1-assembled-smoke-disabled-report.json',
  'evaluations/milestone-1-assembled-smoke-report.json',
  'manifests/components.json',
  'manifests/assembly.json',
  'manifests/assembly.schema.json',
  'manifests/package-integrity.json',
  'manifests/package-integrity.schema.json',
  'manifests/profile-lock.yaml',
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
const currentComponentRevisions = Object.fromEntries(
  manifest.components.map((component) => [component.name, component.revision]),
)

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
assert.equal(assembly.profileLock.path, 'profile-lock.yaml')
assert.equal(assembly.profileLock.packageManager.name, 'pnpm')
assert.equal(assembly.profileLock.packageManager.version, '11.19.0')
assert.equal(
  assembly.profileLock.sha256,
  createHash('sha256').update(contents.get('manifests/profile-lock.yaml')).digest('hex'),
)
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
  assert.equal(
    component.compatibility.dshRevision,
    currentHarnessRevision,
    `${locked.name} compatibility must target the current Harness source lock`,
  )
}
assert.deepEqual(assemblyByName.get('deepseek-harness').profileContribution.credentialReferences, ['DEEPSEEK_API_KEY'])
assert.deepEqual(assemblyByName.get('deepseek-openai-codex').profileContribution.credentialReferences, ['OPENAI_CODEX_OAUTH'])
assert.deepEqual(assemblyByName.get('deepseek-honcho').profileContribution.credentialReferences, ['HONCHO_API_KEY'])
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
const historicalEvidence = verifyEvidenceTransition({
  identity: JSON.parse(contents.get('evaluations/milestone-1-predecessor-evidence-identity.json')),
  currentComponentsContents: contents.get('manifests/components.json'),
  currentAssemblyContents: contents.get('manifests/assembly.json'),
  currentComponentRevisions,
  profileLockContents: contents.get('manifests/profile-lock.yaml'),
  evidenceContents: contents,
})
const { identity: evidenceIdentity, integrity, packageReport, profileReport, smokeReports } = historicalEvidence
const predecessorSourceLock = evidenceIdentity.sourceLocks.predecessor
const predecessorComponentRevisions = predecessorSourceLock.componentRevisions
const predecessorComponents = Object.entries(predecessorComponentRevisions).map(([name, revision]) => ({ name, revision }))
assert.equal(integrity.$schema, './package-integrity.schema.json')
assert.equal(integrity.schemaVersion, 1)
assert.equal(integrity.assemblyId, predecessorSourceLock.assemblyId)
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

assert.equal(packageReport.schemaVersion, 1)
assert.equal(packageReport.assemblyId, predecessorSourceLock.assemblyId)
assert.equal(packageReport.platform, 'windows-x64')
assert.deepEqual(packageReport.componentRevisions, predecessorComponentRevisions)
assert.equal(packageReport.lifecycle.length, predecessorComponents.length)
const lifecycleByName = new Map(packageReport.lifecycle.map((component) => [component.component, component]))
assert.equal(lifecycleByName.size, predecessorComponents.length)
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
const reportedPackageKeys = []
for (const component of predecessorComponents) {
  const lifecycle = lifecycleByName.get(component.name)
  assert.ok(lifecycle, `package report is missing ${component.name}`)
  assert.equal(lifecycle.schemaVersion, 1)
  assert.equal(lifecycle.assemblyId, predecessorSourceLock.assemblyId)
  assert.equal(lifecycle.revision, component.revision)
  assert.deepEqual(lifecycle.phases, expectedPhases)
  assert.equal(typeof lifecycle.recoveredAfterLaterComponentFailure, 'boolean')
  assert.equal(lifecycle.packages.length, expectedPackageCounts[component.name])
  reportedPackages += lifecycle.packages.length
  for (const inspected of lifecycle.packages) {
    const path = `${component.name}/${inspected.relativePath}`
    reportedPackageKeys.push(path)
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
assert.equal(new Set(reportedPackageKeys).size, reportedPackageKeys.length)
assert.deepEqual([...reportedPackageKeys].sort(compareCodeUnits), [...integrityByPath.keys()].sort(compareCodeUnits))
assert.deepEqual(packageReport.security, {
  credentialsFound: false,
  developerAbsolutePathsFound: false,
  sourceControlMetadataFound: false,
  entriesOutsidePackageBoundaryFound: false,
})
assert.deepEqual(
  {
    acceptedPackages: packageReport.licenseAndNotice.acceptedPackages,
    packagesWithNotice: packageReport.licenseAndNotice.packagesWithNotice,
    everyAcceptedPackageCarriesNotice:
      packageReport.licenseAndNotice.everyAcceptedPackageCarriesNotice,
    redistributionRestrictionsPreserved:
      packageReport.licenseAndNotice.redistributionRestrictionsPreserved,
  },
  {
    acceptedPackages: 244,
    packagesWithNotice: 244,
    everyAcceptedPackageCarriesNotice: true,
    redistributionRestrictionsPreserved: true,
  },
)
assert.equal(packageReport.licenseAndNotice.components.length, predecessorComponents.length)
assert.ok(
  packageReport.licenseAndNotice.components.every(
    (component) => component.packageArchivesCommitted === false,
  ),
)

assert.equal(profileReport.schemaVersion, 1)
assert.equal(profileReport.assemblyId, predecessorSourceLock.assemblyId)
assert.equal(profileReport.platform, 'windows-x64')
assert.equal(profileReport.status, 'spec-20.4-passed')
assert.deepEqual(profileReport.componentRevisions, packageReport.componentRevisions)
assert.equal(profileReport.inputs.acceptedPackages, integrity.packages.length)
assert.equal(
  profileReport.inputs.assemblyManifestSha256,
  predecessorSourceLock.assemblyManifestSha256,
)
assert.equal(
  profileReport.inputs.packageIntegritySha256,
  createHash('sha256').update(contents.get('manifests/package-integrity.json')).digest('hex'),
)
assert.equal(profileReport.inputs.profileLockSha256, predecessorSourceLock.profileLockSha256)
assert.equal(profileReport.distribution.manifestSha256, evidenceIdentity.profileDistributionManifestSha256)
assert.equal(profileReport.distribution.packagesReinspected, integrity.packages.length)
assert.equal(profileReport.profileLifecycle.realPinnedIntegrationPassed, 1)
assert.equal(profileReport.profileLifecycle.installedPackagesVerified, integrity.packages.length)
assert.deepEqual(profileReport.credentials.references, [
  'DEEPSEEK_API_KEY',
  'HONCHO_API_KEY',
  'OPENAI_CODEX_OAUTH',
])
assert.equal(profileReport.credentials.valuesSerialized, false)
assert.equal(profileReport.compositionSmoke.optInLiveProviderCallsPassed, true)
assert.equal(profileReport.compositionSmoke.startupPassedWithHonchoDisabled, true)
assert.equal(profileReport.harnessWebReplay.playwrightChromiumInstalled, true)
assert.equal(profileReport.harnessWebReplay.browserLaunched, true)
assert.ok(profileReport.criteria.some((criterion) => criterion.spec === '20.4' && criterion.status === 'passed-windows'))
assert.ok(profileReport.criteria.some((criterion) => criterion.spec === '20.5' && criterion.status === 'passed-windows'))
assert.ok(profileReport.criteria.some((criterion) => criterion.spec === '20.6' && criterion.status === 'incomplete'))

for (const smoke of smokeReports) {
  assert.equal(smoke.schemaVersion, 1)
  assert.equal(smoke.assemblyId, predecessorSourceLock.assemblyId)
  assert.deepEqual(smoke.componentRevisions, packageReport.componentRevisions)
  assert.equal(smoke.checks.toolApproval.status, 'passed')
  assert.deepEqual(smoke.checks.toolApproval.auditEvents, [
    'approval/asked',
    'approval/decided',
    'tool/call',
    'tool/result',
  ])
  assert.match(smoke.checks.toolApproval.toolResultSha256, /^[0-9a-f]{64}$/u)
  assert.deepEqual(
    {
      status: smoke.checks.rlm.status,
      result: smoke.checks.rlm.result,
      generation: smoke.checks.rlm.generation,
      persistent: smoke.checks.rlm.persistent,
    },
    { status: 'passed', result: '42', generation: 1, persistent: true },
  )
  assert.equal(smoke.checks.honchoDisabled.status, 'passed')
  assert.equal(smoke.checks.honchoDisabled.startupPassed, true)
  assert.equal(smoke.checks.artifact.status, 'passed')
  assert.equal(smoke.checks.artifact.exactResolution, true)
  assert.match(smoke.checks.artifact.sha256, /^[0-9a-f]{64}$/u)
  assert.deepEqual(
    {
      status: smoke.checks.dovetail.status,
      provider: smoke.checks.dovetail.provider,
      discovered: smoke.checks.dovetail.discovered,
      invoked: smoke.checks.dovetail.invoked,
    },
    { status: 'passed', provider: 'dovetail', discovered: true, invoked: true },
  )
}
const [defaultWindowsSmoke, liveWindowsSmoke] = smokeReports
assert.equal(defaultWindowsSmoke.platform, 'windows-x64')
assert.equal(defaultWindowsSmoke.checks.codexProvider.status, 'not-run')
assert.equal(defaultWindowsSmoke.checks.honchoLive.status, 'not-run')
assert.equal(liveWindowsSmoke.platform, 'windows-x64')
assert.deepEqual(liveWindowsSmoke.checks.codexProvider, {
  status: 'passed',
  mode: 'live',
  bounded: true,
})
assert.deepEqual(liveWindowsSmoke.checks.honchoLive, {
  status: 'passed',
  mode: 'live',
  sanitizedRoundTrip: true,
  cleanupVerified: true,
})

const blockedPackageReport = JSON.parse(
  contents.get('evaluations/milestone-1-package-report-blocked-99f6f02.json'),
)
assert.equal(blockedPackageReport.schemaVersion, 1)
assert.equal(blockedPackageReport.assemblyId, 'recursus-m1-source-lock-v1')
assert.equal(blockedPackageReport.platform, 'windows-x64')
assert.deepEqual(blockedPackageReport.componentRevisions, {
  ...predecessorComponentRevisions,
  'deepseek-harness': '99f6f02fecdb7dff40c3fbc9470f5907c29f74ca',
})
assert.notDeepEqual(blockedPackageReport.componentRevisions, predecessorComponentRevisions)
assert.notDeepEqual(blockedPackageReport.componentRevisions, currentComponentRevisions)
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
assert.ok(readme.includes('Linux package, profile, smoke, and §20.6 evidence must be regenerated'))

const assemblyDocumentation = contents.get('docs/ASSEMBLY.md')
assert.ok(assemblyDocumentation.includes('Milestone 1 is not complete'))
assert.ok(assemblyDocumentation.includes('current Windows and Linux profile evidence remains pending'))

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
assert.ok(nextSessionPrompt.includes('The first unmet criterion remains §20.6'))
for (const component of manifest.components) {
  assert.ok(
    nextSessionPrompt.includes(component.revision),
    `next-session prompt is missing the ${component.name} revision`,
  )
}

const combined = [...contents.values()].join('\n')
assert.equal(/\b(?:TODO|FIXME)\b/u.test(combined), false)

console.log(
  `recursus verified: ${manifest.components.length} current component pins; historical predecessor integrity covers ${integrity.packages.length} inspected packages`,
)
