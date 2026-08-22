import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  assertComponentLockMatches,
  loadAssemblyManifest,
  serializePackageIntegrity,
  validateAssemblyManifest,
  validatePackageIntegrity,
} from '../lib/index.js'

const manifestPath = fileURLToPath(new URL('../../../manifests/assembly.json', import.meta.url))
const componentLockPath = fileURLToPath(new URL('../../../manifests/components.json', import.meta.url))

async function sourceManifest() {
  return JSON.parse(await readFile(manifestPath, 'utf8'))
}

test('the assembly source lock matches all five accepted component-lock entries', async () => {
  const manifest = await loadAssemblyManifest(manifestPath)
  const componentLock = JSON.parse(await readFile(componentLockPath, 'utf8'))
  assertComponentLockMatches(manifest, componentLock)
  assert.deepEqual(manifest.components.map((component) => component.name), [
    'deepseek-harness',
    'deepseek-openai-codex',
    'deepseek-rlm',
    'deepseek-honcho',
    'deepseek-dovetail',
  ])
  assert.equal(manifest.components.find((component) => component.name === 'deepseek-openai-codex')
    ?.compatibility.nestedPins['pi-ai'], '0.84.2')
  assert.equal(manifest.components.find((component) => component.name === 'deepseek-honcho')
    ?.compatibility.nestedPins['honcho-sdk'], '2.3.0')
  assert.equal(manifest.components.find((component) => component.name === 'deepseek-dovetail')
    ?.compatibility.nestedPins['dovetail-source'], '69f89e3322847fb11665980c16598494a9eacca0')
  assert.deepEqual(manifest.profileLock, {
    path: 'profile-lock.yaml',
    sha256: '82dbbea0be76dbdd72bbe975b9e7bfb2841c650c76e304813fa6ac22706b9352',
    packageManager: { name: 'pnpm', version: '11.19.0' },
  })
  assert.ok(Object.isFrozen(manifest))
  assert.ok(Object.isFrozen(manifest.components[0]))
})

test('unknown versions and unknown fields fail explicitly', async () => {
  const unsupported = await sourceManifest()
  unsupported.schemaVersion = 2
  assert.throws(() => validateAssemblyManifest(unsupported), { code: 'UNSUPPORTED_ASSEMBLY_SCHEMA' })

  const extended = await sourceManifest()
  extended.hostPath = 'C:\\developer\\checkout'
  assert.throws(() => validateAssemblyManifest(extended), { code: 'INVALID_ASSEMBLY_MANIFEST' })
})

test('invalid revisions, credential URLs, duplicate roles, and path traversal fail closed', async () => {
  for (const mutate of [
    (manifest) => { manifest.components[0].revision = 'main' },
    (manifest) => { manifest.components[0].repository = 'https://token@github.com/OpenCnid/deepseek-harness' },
    (manifest) => { manifest.components[1].role = manifest.components[0].role },
    (manifest) => { manifest.components[0].lockfiles[0].path = '../outside.lock' },
    (manifest) => { manifest.workRoot.paths.packages = 'sources' },
    (manifest) => { manifest.profileLock.path = '../profile-lock.yaml' },
    (manifest) => { manifest.profileLock.packageManager.version = 'latest' },
  ]) {
    const candidate = await sourceManifest()
    mutate(candidate)
    assert.throws(() => validateAssemblyManifest(candidate), { code: 'INVALID_ASSEMBLY_MANIFEST' })
  }
})

test('profile credential references are identifiers, never values, and match the configuration policy', async () => {
  const manifest = await sourceManifest()
  assert.deepEqual(
    manifest.components.find((component) => component.name === 'deepseek-openai-codex')
      .profileContribution.credentialReferences,
    ['OPENAI_CODEX_OAUTH'],
  )
  assert.deepEqual(
    manifest.components.find((component) => component.name === 'deepseek-harness')
      .profileContribution.credentialReferences,
    ['DEEPSEEK_API_KEY'],
  )

  for (const mutate of [
    (candidate) => { candidate.components[0].profileContribution.credentialReferences = ['token-value'] },
    (candidate) => { candidate.components[1].profileContribution.credentialReferences = [] },
  ]) {
    const candidate = await sourceManifest()
    mutate(candidate)
    assert.throws(() => validateAssemblyManifest(candidate), { code: 'INVALID_ASSEMBLY_MANIFEST' })
  }
})

test('the integrity schema requires sorted SHA-256 and byte-size entries', () => {
  const input = {
    $schema: './package-integrity.schema.json',
    schemaVersion: 1,
    assemblyId: 'recursus-m1-source-lock-v1',
    algorithm: 'sha256',
    packages: [
      {
        component: 'deepseek-dovetail',
        path: 'deepseek-dovetail-0.1.0.tgz',
        sha256: 'a'.repeat(64),
        bytes: 42,
      },
    ],
  }
  assert.deepEqual(validatePackageIntegrity(input), input)
  assert.equal(serializePackageIntegrity(input), `${JSON.stringify(input, null, 2)}\n`)

  const reversed = structuredClone(input)
  reversed.packages.unshift({
    component: 'deepseek-dovetail',
    path: 'z-last.tgz',
    sha256: 'b'.repeat(64),
    bytes: 1,
  })
  assert.throws(() => validatePackageIntegrity(reversed), { code: 'NONDETERMINISTIC_PACKAGE_INTEGRITY' })

  const absolute = structuredClone(input)
  absolute.packages[0].path = 'C:\\developer\\package.tgz'
  assert.throws(() => validatePackageIntegrity(absolute))
})
