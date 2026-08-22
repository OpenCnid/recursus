import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import { inspectNpmPackage } from '../lib/index.js'

function tarHeader(name, size, type = '0') {
  const header = Buffer.alloc(512)
  header.write(name, 0, 100, 'utf8')
  header.write('0000644\0', 100, 8, 'ascii')
  header.write('0000000\0', 108, 8, 'ascii')
  header.write('0000000\0', 116, 8, 'ascii')
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii')
  header.write('00000000000\0', 136, 12, 'ascii')
  header.fill(32, 148, 156)
  header.write(type, 156, 1, 'ascii')
  header.write('ustar\0', 257, 6, 'ascii')
  header.write('00', 263, 2, 'ascii')
  let checksum = 0
  for (const byte of header) checksum += byte
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  return header
}

function npmArchive(entries) {
  const blocks = []
  for (const entry of entries) {
    const contents = Buffer.from(entry.contents ?? '', 'utf8')
    blocks.push(tarHeader(entry.path, contents.length, entry.type ?? '0'), contents)
    const padding = (512 - (contents.length % 512)) % 512
    if (padding > 0) blocks.push(Buffer.alloc(padding))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks), { mtime: 0 })
}

async function writeArchive(entries) {
  const directory = await mkdtemp(path.join(tmpdir(), 'recursus-package-'))
  const archivePath = path.join(directory, 'fixture.tgz')
  const archive = npmArchive(entries)
  await writeFile(archivePath, archive)
  return { archivePath, archive }
}

const metadata = JSON.stringify({ name: '@example/runtime', version: '1.2.3', files: ['lib'] })

test('package inspection reports deterministic hashes and declared notices', async () => {
  const { archivePath, archive } = await writeArchive([
    { path: 'package/package.json', contents: metadata },
    { path: 'package/LICENSE', contents: 'MIT fixture\n' },
    { path: 'package/lib/index.js', contents: 'export const value = 1\n' },
  ])
  const inspected = await inspectNpmPackage({ archivePath, expectedNoticeBasenames: ['LICENSE'] })
  assert.equal(inspected.packageName, '@example/runtime')
  assert.equal(inspected.packageVersion, '1.2.3')
  assert.equal(inspected.archiveSha256, createHash('sha256').update(archive).digest('hex'))
  assert.equal(inspected.entries.length, 3)
  assert.deepEqual(inspected.notices, ['package/LICENSE'])
  assert.match(inspected.contentsSha256, /^[0-9a-f]{64}$/)
})

test('package inspection rejects boundary escapes and source-control metadata', async () => {
  for (const entryPath of ['../outside', 'other/package.json', 'package/.git/config']) {
    const { archivePath } = await writeArchive([{ path: entryPath, contents: metadata }])
    if (entryPath === 'package/.git/config') {
      await assert.rejects(inspectNpmPackage({ archivePath }), { code: 'UNEXPECTED_PACKAGE_FILE' })
    } else {
      await assert.rejects(inspectNpmPackage({ archivePath }))
    }
  }
})

test('package inspection rejects credentials, developer paths, and missing notices', async () => {
  for (const [contents, code] of [
    ['const token = "sk-examplecredential123456789"', 'PACKAGE_CONTAINS_CREDENTIAL'],
    ['const source = "C:\\Users\\developer\\repo\\index.ts"', 'PACKAGE_CONTAINS_DEVELOPER_PATH'],
  ]) {
    const { archivePath } = await writeArchive([
      { path: 'package/package.json', contents: metadata },
      { path: 'package/LICENSE', contents: 'MIT' },
      { path: 'package/lib/index.js', contents },
    ])
    await assert.rejects(inspectNpmPackage({ archivePath }), { code })
  }
  const { archivePath } = await writeArchive([{ path: 'package/package.json', contents: metadata }])
  await assert.rejects(inspectNpmPackage({ archivePath }), { code: 'PACKAGE_NOTICE_MISSING' })
})

test('package inspection rejects the exact configured work root outside a user home', async () => {
  const forbiddenRoot = path.join(path.parse(process.cwd()).root, 'recursus-private-work-root')
  const { archivePath } = await writeArchive([
    { path: 'package/package.json', contents: metadata },
    { path: 'package/LICENSE', contents: 'MIT' },
    { path: 'package/lib/index.js', contents: `// virtual module: ${forbiddenRoot}\n` },
  ])
  await assert.rejects(
    inspectNpmPackage({ archivePath, forbiddenAbsolutePaths: [forbiddenRoot] }),
    { code: 'PACKAGE_CONTAINS_DEVELOPER_PATH' },
  )
})

test('package inspection allows deterministic generic examples that resemble sensitive values', async () => {
  for (const example of ['C:\\Users\\me\\.dsh', '/home/user/.dsh', '/home/u/.dsh', 'ask-question-toolview']) {
    const { archivePath } = await writeArchive([
      { path: 'package/package.json', contents: JSON.stringify({ name: '@fixture/example-path', version: '1.0.0' }) },
      { path: 'package/LICENSE', contents: 'MIT\n' },
      { path: 'package/README.md', contents: `${example}\n` },
    ])
    const inspected = await inspectNpmPackage({ archivePath })
    assert.equal(inspected.packageName, '@fixture/example-path')
  }
})

test('package inspection rejects links, generated residue, and corrupt headers', async () => {
  for (const entry of [
    { path: 'package/link', contents: 'target', type: '2' },
    { path: 'package/cache.tsbuildinfo', contents: '{}' },
  ]) {
    const { archivePath } = await writeArchive([entry])
    await assert.rejects(inspectNpmPackage({ archivePath }))
  }
  const archive = npmArchive([{ path: 'package/package.json', contents: metadata }])
  archive[0] ^= 0xff
  const directory = await mkdtemp(path.join(tmpdir(), 'recursus-package-corrupt-'))
  const archivePath = path.join(directory, 'fixture.tgz')
  await writeFile(archivePath, archive)
  await assert.rejects(inspectNpmPackage({ archivePath }), { code: 'INVALID_PACKAGE_ARCHIVE' })
})
