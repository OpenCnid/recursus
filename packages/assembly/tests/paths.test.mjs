import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import {
  assertPortableRelativePath,
  resolveContainedPath,
} from '../lib/index.js'

test('portable manifest paths reject traversal and platform-specific absolute forms', () => {
  for (const candidate of ['', '.', '..', '../escape', 'safe/../escape', '/absolute', 'C:/absolute', 'safe\\escape']) {
    assert.throws(() => assertPortableRelativePath(candidate))
  }
  assert.equal(assertPortableRelativePath('packages/component/*.tgz'), 'packages/component/*.tgz')
})

test('Windows containment compares parsed components and rejects prefix collisions', () => {
  assert.equal(
    resolveContainedPath(path.win32, 'C:\\recursus-work', 'sources', 'component'),
    'C:\\recursus-work\\sources\\component',
  )
  assert.throws(() => resolveContainedPath(path.win32, 'C:\\recursus-work', '..', 'recursus-work-other'))
  assert.throws(() => resolveContainedPath(path.win32, 'C:\\recursus-work', 'C:\\outside'))
  assert.throws(() => resolveContainedPath(path.win32, 'recursus-work', 'sources'))
})

test('POSIX containment compares parsed components and rejects traversal', () => {
  assert.equal(
    resolveContainedPath(path.posix, '/var/lib/recursus', 'sources', 'component'),
    '/var/lib/recursus/sources/component',
  )
  assert.throws(() => resolveContainedPath(path.posix, '/var/lib/recursus', '..', 'recursus-other'))
  assert.throws(() => resolveContainedPath(path.posix, '/var/lib/recursus', '/outside'))
  assert.throws(() => resolveContainedPath(path.posix, 'var/lib/recursus', 'sources'))
})
