import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  acquireGitComponent,
  acquisitionEvidenceJson,
  verifyGitRevision,
} from '../lib/index.js'

const execFileAsync = promisify(execFile)
const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const testWorkParent = path.join(repositoryRoot, 'artifacts', 'test-work')

async function workRoot(prefix) {
  await mkdir(testWorkParent, { recursive: true })
  return mkdtemp(path.join(testWorkParent, prefix))
}

function syntheticComponent(revision) {
  return {
    name: 'synthetic-component',
    repository: 'https://github.com/OpenCnid/synthetic-component',
    revision,
    acquisition: { method: 'git', readOnly: true, revisionKind: 'commit' },
  }
}

async function git(cwd, ...args) {
  return (await execFileAsync('git', args, { cwd, encoding: 'utf8' })).stdout.trim()
}

test('an exact clean existing checkout is reused and emits no absolute path', async (context) => {
  const root = await workRoot('git-reuse-')
  context.after(() => rm(root, { recursive: true, force: true }))
  const checkout = path.join(root, 'sources', 'synthetic-component')
  await mkdir(checkout, { recursive: true })
  await git(checkout, 'init', '--quiet')
  await git(checkout, 'config', 'user.email', 'synthetic@example.invalid')
  await git(checkout, 'config', 'user.name', 'Synthetic Test')
  await git(checkout, 'remote', 'add', 'origin', 'https://github.com/OpenCnid/synthetic-component')
  await writeFile(path.join(checkout, 'fixture.txt'), 'synthetic\n')
  await git(checkout, 'add', 'fixture.txt')
  await git(checkout, 'commit', '--quiet', '-m', 'synthetic fixture')
  const revision = await git(checkout, 'rev-parse', 'HEAD')

  const result = await acquireGitComponent({ component: syntheticComponent(revision), workRoot: root })
  assert.equal(result.evidence.reused, true)
  assert.equal(result.evidence.revision, revision)
  assert.equal(result.evidence.relativeSourcePath, 'sources/synthetic-component')
  const publicEvidence = JSON.stringify(acquisitionEvidenceJson(result.evidence))
  assert.equal(publicEvidence.includes(root), false)
  assert.equal(await readFile(path.join(result.sourceDirectory, 'fixture.txt'), 'utf8'), 'synthetic\n')

  await writeFile(path.join(checkout, 'untracked.txt'), 'dirty\n')
  await assert.rejects(
    () => verifyGitRevision({ component: syntheticComponent(revision), workRoot: root }),
    { code: 'COMPONENT_CHECKOUT_DIRTY' },
  )
})

test('wrong origins and revisions fail closed', async (context) => {
  const root = await workRoot('git-mismatch-')
  context.after(() => rm(root, { recursive: true, force: true }))
  const checkout = path.join(root, 'sources', 'synthetic-component')
  await mkdir(checkout, { recursive: true })
  await git(checkout, 'init', '--quiet')
  await git(checkout, 'config', 'user.email', 'synthetic@example.invalid')
  await git(checkout, 'config', 'user.name', 'Synthetic Test')
  await git(checkout, 'remote', 'add', 'origin', 'https://github.com/OpenCnid/wrong-origin')
  await writeFile(path.join(checkout, 'fixture.txt'), 'synthetic\n')
  await git(checkout, 'add', 'fixture.txt')
  await git(checkout, 'commit', '--quiet', '-m', 'synthetic fixture')
  const revision = await git(checkout, 'rev-parse', 'HEAD')
  await assert.rejects(
    () => verifyGitRevision({ component: syntheticComponent(revision), workRoot: root }),
    { code: 'COMPONENT_ORIGIN_MISMATCH' },
  )
  await git(checkout, 'remote', 'set-url', 'origin', 'https://github.com/OpenCnid/synthetic-component')
  await assert.rejects(
    () => verifyGitRevision({ component: syntheticComponent('f'.repeat(40)), workRoot: root }),
    { code: 'COMPONENT_REVISION_MISMATCH' },
  )
})

test('new acquisition uses the exact revision and cleans a failed partial checkout', async (context) => {
  const root = await workRoot('git-new-')
  context.after(() => rm(root, { recursive: true, force: true }))
  const expected = 'a'.repeat(40)
  const component = syntheticComponent(expected)
  const calls = []
  const runGit = async (args, cwd) => {
    calls.push(args)
    if (args[0] === 'init') await mkdir(path.join(cwd, component.name), { recursive: true })
    if (args[0] === 'remote' && args[1] === 'get-url') return { stdout: `${component.repository}\n`, stderr: '' }
    if (args[0] === 'status') return { stdout: '', stderr: '' }
    if (args[0] === 'rev-parse') return { stdout: `${expected}\n`, stderr: '' }
    return { stdout: '', stderr: '' }
  }
  const acquired = await acquireGitComponent({ component, workRoot: root, runGit })
  assert.equal(acquired.evidence.reused, false)
  assert.ok(calls.some((args) => args.join(' ').includes(`fetch --quiet --no-tags --depth=1 origin ${expected}`)))
  assert.ok(calls.some((args) => args.at(-1) === expected && args.includes('--detach')))

  const failedRoot = await workRoot('git-failed-')
  context.after(() => rm(failedRoot, { recursive: true, force: true }))
  const failingGit = async (args, cwd) => {
    if (args[0] === 'init') await mkdir(path.join(cwd, component.name), { recursive: true })
    if (args[0] === 'fetch') throw new Error('synthetic fetch failure')
    return { stdout: '', stderr: '' }
  }
  await assert.rejects(() => acquireGitComponent({ component, workRoot: failedRoot, runGit: failingGit }))
  await assert.rejects(() => readFile(path.join(failedRoot, 'sources', component.name, 'anything')))
  assert.equal(await import('node:fs/promises').then(({ access }) => access(path.join(failedRoot, 'sources', component.name)).then(
    () => true,
    () => false,
  )), false)
})

test('relative work roots and symlinked managed source directories are rejected', async (context) => {
  await assert.rejects(
    () => acquireGitComponent({ component: syntheticComponent('a'.repeat(40)), workRoot: 'relative-work' }),
    { code: 'WORK_ROOT_NOT_ABSOLUTE' },
  )

  const root = await workRoot('git-symlink-')
  context.after(() => rm(root, { recursive: true, force: true }))
  const outside = await workRoot('git-symlink-outside-')
  context.after(() => rm(outside, { recursive: true, force: true }))
  try {
    await import('node:fs/promises').then(({ symlink }) => symlink(outside, path.join(root, 'sources'), 'junction'))
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) return
    throw error
  }
  await assert.rejects(
    () => acquireGitComponent({ component: syntheticComponent('a'.repeat(40)), workRoot: root }),
    { code: 'UNSAFE_WORK_ROOT' },
  )
})
