import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  currentHarnessRevision,
  predecessorHarnessRevision,
  sha256,
  verifyEvidenceTransition,
} from './verify-evidence-transition.mjs'

const root = resolve(import.meta.dirname, '..')
const identityPath = 'evaluations/milestone-1-predecessor-evidence-identity.json'
const evidencePaths = [
  'manifests/package-integrity.json',
  'evaluations/milestone-1-package-report.json',
  'evaluations/milestone-1-profile-lifecycle-report.json',
  'evaluations/milestone-1-assembled-smoke-disabled-report.json',
  'evaluations/milestone-1-assembled-smoke-report.json',
]

async function fixture() {
  const [identityContents, currentComponentsContents, currentAssemblyContents, profileLockContents, ...evidence] = await Promise.all([
    readFile(resolve(root, identityPath), 'utf8'),
    readFile(resolve(root, 'manifests/components.json'), 'utf8'),
    readFile(resolve(root, 'manifests/assembly.json'), 'utf8'),
    readFile(resolve(root, 'manifests/profile-lock.yaml'), 'utf8'),
    ...evidencePaths.map((path) => readFile(resolve(root, path), 'utf8')),
  ])
  const currentComponents = JSON.parse(currentComponentsContents)
  return {
    identity: JSON.parse(identityContents),
    currentComponentsContents,
    currentAssemblyContents,
    currentComponentRevisions: Object.fromEntries(
      currentComponents.components.map((component) => [component.name, component.revision]),
    ),
    profileLockContents,
    evidenceContents: new Map(evidencePaths.map((path, index) => [path, evidence[index]])),
  }
}

function rewriteEvidenceJson(input, artifactName, update) {
  const artifact = input.identity.artifacts[artifactName]
  const document = JSON.parse(input.evidenceContents.get(artifact.path))
  update(document)
  const contents = `${JSON.stringify(document, null, 2)}\n`
  input.evidenceContents.set(artifact.path, contents)
  artifact.sha256 = sha256(contents)
}

test('accepts the explicitly identified predecessor bundle beside the distinct current source lock', async () => {
  const input = await fixture()
  const result = verifyEvidenceTransition(input)
  assert.equal(result.identity.sourceLocks.predecessor.componentRevisions['deepseek-harness'], predecessorHarnessRevision)
  assert.equal(result.identity.sourceLocks.current.componentRevisions['deepseek-harness'], currentHarnessRevision)
})

test('rejects a mixed current-pin smoke report inside the predecessor bundle', async () => {
  const input = await fixture()
  rewriteEvidenceJson(input, 'defaultSmokeReport', (report) => {
    report.componentRevisions['deepseek-harness'] = currentHarnessRevision
  })
  assert.throws(
    () => verifyEvidenceTransition(input),
    /historical smoke report component revisions are invalid/u,
  )
})

test('rejects a package report with a mixed nested lifecycle revision', async () => {
  const input = await fixture()
  rewriteEvidenceJson(input, 'packageReport', (report) => {
    report.lifecycle.find((item) => item.component === 'deepseek-harness').revision = currentHarnessRevision
  })
  assert.throws(() => verifyEvidenceTransition(input), /deepseek-harness lifecycle revision is invalid/u)
})

test('rejects stale integrity bytes even when the report set is otherwise unchanged', async () => {
  const input = await fixture()
  const integrityPath = input.identity.artifacts.packageIntegrity.path
  const integrity = JSON.parse(input.evidenceContents.get(integrityPath))
  integrity.packages[0].bytes += 1
  input.evidenceContents.set(integrityPath, `${JSON.stringify(integrity, null, 2)}\n`)
  assert.throws(() => verifyEvidenceTransition(input), /package-integrity\.json SHA-256 differs/u)
})

test('rejects a stale profile report that points at different integrity bytes', async () => {
  const input = await fixture()
  rewriteEvidenceJson(input, 'profileReport', (report) => {
    report.inputs.packageIntegritySha256 = '0'.repeat(64)
  })
  assert.throws(
    () => verifyEvidenceTransition(input),
    /historical profile report package-integrity SHA-256 is invalid/u,
  )
})

test('rejects falsely relabeling the predecessor source lock as the current source lock', async () => {
  const input = await fixture()
  input.identity.sourceLocks.predecessor = structuredClone(input.identity.sourceLocks.current)
  assert.throws(
    () => verifyEvidenceTransition(input),
    /predecessor source lock must retain the accepted Harness revision|cannot be relabeled as current evidence/u,
  )
})

test('rejects current source-lock drift independently of the historical evidence', async () => {
  const input = await fixture()
  input.currentComponentRevisions['deepseek-harness'] = predecessorHarnessRevision
  assert.throws(
    () => verifyEvidenceTransition(input),
    /checked-in current component lock differs from its identity/u,
  )
})
