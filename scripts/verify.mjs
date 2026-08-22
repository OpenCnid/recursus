import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const requiredFiles = [
  'README.md',
  'GAMEPLAN.md',
  'SPEC.md',
  'AGENTS.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'docs/ARCHITECTURE.md',
  'manifests/components.json',
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

const license = contents.get('LICENSE')
assert.match(license, /^MIT License/u)
assert.match(license, /Copyright \(c\) 2026 OpenCnid contributors/u)

const notices = contents.get('THIRD_PARTY_NOTICES.md')
for (const name of expectedComponents) assert.ok(notices.includes(name), `missing notice for ${name}`)

const readme = contents.get('README.md')
assert.ok(readme.includes('DeepSeek Harness remains the control plane'))
assert.ok(readme.includes('Standing on the shoulders of giants'))
assert.ok(readme.includes('not an official DeepSeek, OpenAI, Honcho, or Prime product'))

const combined = [...contents.values()].join('\n')
assert.equal(/\b(?:TODO|FIXME)\b/u.test(combined), false)

console.log(`recursus foundation verified: ${manifest.components.length} pinned components, MIT boundary, and required docs`)
