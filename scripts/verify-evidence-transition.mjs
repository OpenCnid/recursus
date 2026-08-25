import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const REVISION = /^[0-9a-f]{40}$/u
const SHA256 = /^[0-9a-f]{64}$/u

const COMPONENT_NAMES = Object.freeze([
  'deepseek-dovetail',
  'deepseek-harness',
  'deepseek-honcho',
  'deepseek-openai-codex',
  'deepseek-rlm',
])

const ARTIFACT_PATHS = Object.freeze({
  defaultSmokeReport: 'evaluations/milestone-1-assembled-smoke-disabled-report.json',
  liveSmokeReport: 'evaluations/milestone-1-assembled-smoke-report.json',
  packageIntegrity: 'manifests/package-integrity.json',
  packageReport: 'evaluations/milestone-1-package-report.json',
  profileReport: 'evaluations/milestone-1-profile-lifecycle-report.json',
})

export const predecessorHarnessRevision = '29c8342b37d76e5dd4ca8daff4beb7743b8e22a0'
export const currentHarnessRevision = 'e52c224fe00954fb7e8cda19eb2411dceef15989'

export function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

function record(value, label) {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  return value
}

function exactKeys(value, keys, label) {
  assert.deepEqual(Object.keys(record(value, label)).sort(), [...keys].sort(), `${label} has unexpected fields`)
}

function revisionMap(value, label) {
  exactKeys(value, COMPONENT_NAMES, label)
  for (const name of COMPONENT_NAMES) assert.match(value[name], REVISION, `${label}.${name} must be an immutable revision`)
  return value
}

function sourceLock(value, label) {
  exactKeys(
    value,
    ['assemblyId', 'assemblyManifestSha256', 'componentRevisions', 'componentsManifestSha256', 'profileLockSha256'],
    label,
  )
  assert.equal(value.assemblyId, 'recursus-m1-source-lock-v1', `${label}.assemblyId is invalid`)
  assert.match(value.assemblyManifestSha256, SHA256, `${label}.assemblyManifestSha256 is invalid`)
  assert.match(value.componentsManifestSha256, SHA256, `${label}.componentsManifestSha256 is invalid`)
  assert.match(value.profileLockSha256, SHA256, `${label}.profileLockSha256 is invalid`)
  revisionMap(value.componentRevisions, `${label}.componentRevisions`)
  return value
}

function artifact(value, expectedPath, label) {
  exactKeys(value, ['path', 'sha256'], label)
  assert.equal(value.path, expectedPath, `${label}.path is invalid`)
  assert.match(value.sha256, SHA256, `${label}.sha256 is invalid`)
  return value
}

function parseEvidence(contents, path) {
  const encoded = contents.get(path)
  assert.equal(typeof encoded, 'string', `historical evidence is missing ${path}`)
  return JSON.parse(encoded)
}

/**
 * Bind the accepted predecessor package/profile evidence to its immutable
 * source-lock identity while proving that the checked-in current lock is the
 * distinct reviewed successor. The returned reports still receive their full
 * structural and content checks in verify.mjs.
 */
export function verifyEvidenceTransition(options) {
  const identity = record(options.identity, 'evidence transition identity')
  exactKeys(
    identity,
    ['acceptance', 'artifacts', 'changedComponents', 'kind', 'profileDistributionManifestSha256', 'schemaVersion', 'sourceLocks'],
    'evidence transition identity',
  )
  assert.equal(identity.schemaVersion, 1)
  assert.equal(identity.kind, 'historical-predecessor-evidence')

  exactKeys(identity.sourceLocks, ['current', 'predecessor'], 'evidence transition source locks')
  const predecessor = sourceLock(identity.sourceLocks.predecessor, 'predecessor source lock')
  const current = sourceLock(identity.sourceLocks.current, 'current source lock')
  assert.equal(
    predecessor.componentRevisions['deepseek-harness'],
    predecessorHarnessRevision,
    'predecessor source lock must retain the accepted Harness revision',
  )
  assert.equal(
    current.componentRevisions['deepseek-harness'],
    currentHarnessRevision,
    'current source lock must retain the reviewed Harness revision',
  )
  assert.notDeepEqual(
    predecessor.componentRevisions,
    current.componentRevisions,
    'historical predecessor evidence cannot be relabeled as current evidence',
  )
  const changedComponents = COMPONENT_NAMES.filter(
    (name) => predecessor.componentRevisions[name] !== current.componentRevisions[name],
  )
  assert.deepEqual(identity.changedComponents, changedComponents, 'source-lock transition component set is invalid')
  assert.deepEqual(changedComponents, ['deepseek-harness'], 'the bounded transition must change only DeepSeek Harness')

  const currentComponentRevisions = revisionMap(options.currentComponentRevisions, 'checked-in current component revisions')
  assert.deepEqual(currentComponentRevisions, current.componentRevisions, 'checked-in current component lock differs from its identity')
  assert.equal(sha256(options.currentComponentsContents), current.componentsManifestSha256, 'current components manifest SHA-256 differs from its identity')
  assert.equal(sha256(options.currentAssemblyContents), current.assemblyManifestSha256, 'current assembly manifest SHA-256 differs from its identity')
  assert.equal(sha256(options.profileLockContents), current.profileLockSha256, 'current profile lock SHA-256 differs from its identity')

  exactKeys(identity.acceptance, ['currentPinLinuxComplete', 'currentPinWindowsComplete', 'milestone', 'status'], 'transition acceptance')
  assert.deepEqual(identity.acceptance, {
    milestone: 1,
    status: 'incomplete',
    currentPinWindowsComplete: false,
    currentPinLinuxComplete: false,
  })
  assert.match(identity.profileDistributionManifestSha256, SHA256)

  exactKeys(identity.artifacts, Object.keys(ARTIFACT_PATHS), 'historical evidence artifacts')
  for (const [name, path] of Object.entries(ARTIFACT_PATHS)) {
    const lockedArtifact = artifact(identity.artifacts[name], path, `historical evidence artifacts.${name}`)
    const contents = options.evidenceContents.get(path)
    assert.equal(typeof contents, 'string', `historical evidence is missing ${path}`)
    assert.equal(sha256(contents), lockedArtifact.sha256, `${path} SHA-256 differs from the historical evidence identity`)
  }

  const integrity = parseEvidence(options.evidenceContents, ARTIFACT_PATHS.packageIntegrity)
  const packageReport = parseEvidence(options.evidenceContents, ARTIFACT_PATHS.packageReport)
  const profileReport = parseEvidence(options.evidenceContents, ARTIFACT_PATHS.profileReport)
  const smokeReports = [
    parseEvidence(options.evidenceContents, ARTIFACT_PATHS.defaultSmokeReport),
    parseEvidence(options.evidenceContents, ARTIFACT_PATHS.liveSmokeReport),
  ]

  assert.equal(integrity.assemblyId, predecessor.assemblyId, 'historical integrity assembly identity is invalid')
  assert.equal(packageReport.assemblyId, predecessor.assemblyId, 'historical package report assembly identity is invalid')
  assert.equal(packageReport.platform, 'windows-x64', 'historical package report platform is invalid')
  assert.deepEqual(packageReport.componentRevisions, predecessor.componentRevisions, 'historical package report component revisions are invalid')
  const lifecycleByName = new Map(packageReport.lifecycle.map((item) => [item.component, item]))
  assert.equal(lifecycleByName.size, COMPONENT_NAMES.length, 'historical package report lifecycle identities are invalid')
  for (const name of COMPONENT_NAMES) {
    const lifecycle = lifecycleByName.get(name)
    assert.ok(lifecycle, `historical package report is missing ${name}`)
    assert.equal(lifecycle.schemaVersion, 1, `${name} lifecycle schema is invalid`)
    assert.equal(lifecycle.assemblyId, predecessor.assemblyId, `${name} lifecycle assembly identity is invalid`)
    assert.equal(lifecycle.revision, predecessor.componentRevisions[name], `${name} lifecycle revision is invalid`)
  }

  assert.equal(profileReport.assemblyId, predecessor.assemblyId, 'historical profile report assembly identity is invalid')
  assert.equal(profileReport.platform, 'windows-x64', 'historical profile report platform is invalid')
  assert.deepEqual(profileReport.componentRevisions, predecessor.componentRevisions, 'historical profile report component revisions are invalid')
  assert.equal(profileReport.inputs.assemblyManifestSha256, predecessor.assemblyManifestSha256, 'historical profile report source-lock SHA-256 is invalid')
  assert.equal(profileReport.inputs.packageIntegritySha256, identity.artifacts.packageIntegrity.sha256, 'historical profile report package-integrity SHA-256 is invalid')
  assert.equal(profileReport.inputs.profileLockSha256, predecessor.profileLockSha256, 'historical profile report profile-lock SHA-256 is invalid')
  assert.equal(profileReport.inputs.acceptedPackages, integrity.packages.length, 'historical profile report package count is invalid')
  assert.equal(profileReport.distribution.manifestSha256, identity.profileDistributionManifestSha256, 'historical profile distribution identity is invalid')
  assert.equal(profileReport.compositionSmoke.defaultReport, ARTIFACT_PATHS.defaultSmokeReport, 'historical default smoke path is invalid')
  assert.equal(profileReport.compositionSmoke.liveReport, ARTIFACT_PATHS.liveSmokeReport, 'historical live smoke path is invalid')

  for (const smoke of smokeReports) {
    assert.equal(smoke.assemblyId, predecessor.assemblyId, 'historical smoke report assembly identity is invalid')
    assert.equal(smoke.platform, 'windows-x64', 'historical smoke report platform is invalid')
    assert.deepEqual(smoke.componentRevisions, predecessor.componentRevisions, 'historical smoke report component revisions are invalid')
  }

  return { identity, integrity, packageReport, profileReport, smokeReports }
}
