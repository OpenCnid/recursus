import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { acquireGitComponent, loadAssemblyManifest } from '../lib/index.js'

const enabled = process.env.RECURSUS_RUN_PINNED_INTEGRATION === '1'
const workRoot = process.env.RECURSUS_INTEGRATION_WORK_ROOT

test('acquires and verifies the exact public Codex adapter pin', { skip: !enabled }, async () => {
  assert.ok(workRoot !== undefined && path.isAbsolute(workRoot), 'RECURSUS_INTEGRATION_WORK_ROOT must be absolute')
  const manifest = await loadAssemblyManifest(
    fileURLToPath(new URL('../../../manifests/assembly.json', import.meta.url)),
  )
  const component = manifest.components.find((entry) => entry.name === 'deepseek-openai-codex')
  assert.ok(component)
  const result = await acquireGitComponent({ component, workRoot })
  assert.equal(result.evidence.revision, '5232102d0cc8bd55d5bf27b6eb203efbf6ada8a9')
  assert.equal(result.evidence.repository, 'https://github.com/OpenCnid/deepseek-openai-codex')
  assert.equal(result.evidence.relativeSourcePath, 'sources/deepseek-openai-codex')
  assert.equal(JSON.stringify(result.evidence).includes(workRoot), false)
  const packageManifest = JSON.parse(await readFile(path.join(result.sourceDirectory, 'package.json'), 'utf8'))
  assert.equal(packageManifest.packageManager, 'pnpm@11.19.0')
  assert.equal(packageManifest.dependencies['@earendil-works/pi-ai'], '0.84.2')
  const lockBytes = await readFile(path.join(result.sourceDirectory, 'pnpm-lock.yaml'))
  const lockDigest = createHash('sha256').update(lockBytes).digest('hex')
  assert.equal(lockDigest, component.lockfiles.find((lockfile) => lockfile.path === 'pnpm-lock.yaml')?.sha256)
  const reused = await acquireGitComponent({ component, workRoot })
  assert.equal(reused.evidence.reused, true)
  assert.equal(reused.sourceDirectory, result.sourceDirectory)
})
