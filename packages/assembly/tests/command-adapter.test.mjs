import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { gzipSync } from 'node:zlib'
import { createComponentCommandAdapter, runAdapterLifecycle } from '../lib/index.js'

const execFileAsync = promisify(execFile)

function tarHeader(name, size) {
  const header = Buffer.alloc(512)
  header.write(name, 0, 100, 'utf8')
  header.write('0000644\0', 100, 8, 'ascii')
  header.write('0000000\0', 108, 8, 'ascii')
  header.write('0000000\0', 116, 8, 'ascii')
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii')
  header.write('00000000000\0', 136, 12, 'ascii')
  header.fill(32, 148, 156)
  header.write('0', 156, 1, 'ascii')
  header.write('ustar\0', 257, 6, 'ascii')
  header.write('00', 263, 2, 'ascii')
  let checksum = 0
  for (const byte of header) checksum += byte
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  return header
}

function fixtureArchive() {
  const blocks = []
  for (const [name, value] of [
    ['package/package.json', JSON.stringify({ name: '@fixture/runtime', version: '1.0.0' })],
    ['package/LICENSE', 'MIT\n'],
    ['package/lib/index.js', 'export {}\n'],
  ]) {
    const contents = Buffer.from(value)
    blocks.push(tarHeader(name, contents.length), contents)
    const padding = (512 - (contents.length % 512)) % 512
    if (padding > 0) blocks.push(Buffer.alloc(padding))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks), { mtime: 0 })
}

async function fixtureContext() {
  const workRoot = await mkdtemp(path.join(tmpdir(), 'recursus-command-adapter-'))
  const sourceDirectory = path.join(workRoot, 'sources', 'fixture-component')
  await mkdir(sourceDirectory, { recursive: true })
  await execFileAsync('git', ['init', '--quiet'], { cwd: sourceDirectory })
  await execFileAsync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: sourceDirectory })
  await execFileAsync('git', ['config', 'user.name', 'Recursus fixture'], { cwd: sourceDirectory })
  await writeFile(path.join(sourceDirectory, 'README.md'), 'fixture\n')
  await execFileAsync('git', ['add', 'README.md'], { cwd: sourceDirectory })
  await execFileAsync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: sourceDirectory })
  await execFileAsync('git', ['remote', 'add', 'origin', 'https://github.com/OpenCnid/fixture-component'], { cwd: sourceDirectory })
  const revision = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: sourceDirectory })).stdout.trim()
  const command = (argumentsList) => ({ executable: 'pnpm', arguments: argumentsList, cwd: 'source' })
  return {
    workRoot,
    component: {
      name: 'fixture-component',
      role: 'fixture',
      repository: 'https://github.com/OpenCnid/fixture-component',
      revision,
      version: '1.0.0',
      license: {
        declared: 'MIT',
        status: 'permissive',
        noticeFiles: ['LICENSE'],
        redistribution: 'allowed-with-notices',
      },
      acquisition: { method: 'git', readOnly: true, revisionKind: 'commit' },
      toolchain: { node: '>=24', packageManager: { name: 'pnpm', version: '11.19.0' }, additional: [] },
      lockfiles: [],
      entrypoints: {
        restoreDependencies: [command(['install', '--frozen-lockfile'])],
        verifySource: [command(['run', 'verify'])],
        build: [command(['run', 'build'])],
        pack: [command(['pack', '--pack-destination', '{packageOutput}'])],
        inspectPackage: [command(['run', 'inspect-package'])],
      },
      pack: {
        outputRoot: '{packageOutput}',
        selectors: [{ glob: 'fixture.tgz', format: 'npm-tarball', purpose: 'runtime' }],
        allowedMetadata: ['publish-order.txt'],
      },
      profileContribution: { kind: 'cordis-plugin', packages: ['@fixture/runtime'], configPolicy: 'package-defaults' },
      platforms: { supported: ['windows-x64', 'linux-x64'], constraints: [] },
      compatibility: { dshRevision: '0'.repeat(40), nestedPins: {}, constraints: [] },
    },
  }
}

test('the concrete adapter uses the exact package manager and inspects only declared output', async () => {
  const context = await fixtureContext()
  const invocations = []
  const runProcess = async (invocation) => {
    invocations.push(invocation)
    if (invocation.arguments.at(-1) === '--version') {
      return { exitCode: 0, stdoutBytes: 8, stderrBytes: 0, stdoutTail: '11.19.0\n', stderrTail: '' }
    }
    const destinationIndex = invocation.arguments.indexOf('--pack-destination')
    if (destinationIndex >= 0) {
      await writeFile(path.join(invocation.arguments[destinationIndex + 1], 'fixture.tgz'), fixtureArchive())
      await writeFile(path.join(invocation.arguments[destinationIndex + 1], 'publish-order.txt'), 'fixture.tgz\n')
    }
    return { exitCode: 0, stdoutBytes: 0, stderrBytes: 0, stdoutTail: '', stderrTail: '' }
  }
  const adapter = createComponentCommandAdapter({
    bootstrapPnpmModule: path.join(context.workRoot, 'pnpm.mjs'),
    packageManagerExecutable: path.join(context.workRoot, 'pnpm.exe'),
    runProcess,
  })
  const results = await runAdapterLifecycle(adapter, context)
  assert.equal(results.length, 8)
  assert.ok(invocations.every((invocation) => invocation.executable === path.join(context.workRoot, 'pnpm.exe')))
  assert.ok(invocations.every((invocation) => invocation.arguments.some((argument) => argument.startsWith('--config.store-dir='))))
  assert.deepEqual(adapter.packageEvidence().map((item) => [item.relativePath, item.packageName]), [
    ['fixture.tgz', '@fixture/runtime'],
  ])
  assert.equal(JSON.stringify(results).includes(context.workRoot), false)
})

test('component command failures expose no captured command output', async () => {
  const context = await fixtureContext()
  let calls = 0
  const adapter = createComponentCommandAdapter({
    bootstrapPnpmModule: path.join(context.workRoot, 'pnpm.mjs'),
    packageManagerExecutable: path.join(context.workRoot, 'pnpm.exe'),
    runProcess: async () => {
      calls += 1
      if (calls === 1) return { exitCode: 0, stdoutBytes: 8, stderrBytes: 0, stdoutTail: '11.19.0\n', stderrTail: '' }
      return { exitCode: 7, stdoutBytes: 0, stderrBytes: 40, stdoutTail: '', stderrTail: 'sk-examplecredential123456789' }
    },
  })
  await assert.rejects(runAdapterLifecycle(adapter, context), (error) => {
    assert.equal(error.code, 'COMPONENT_COMMAND_FAILED')
    assert.equal(error.message.includes('sk-example'), false)
    return true
  })
})
