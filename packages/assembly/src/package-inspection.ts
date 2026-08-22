import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { AssemblyError } from './errors.js'
import { assertPortableRelativePath } from './paths.js'

const TAR_BLOCK_BYTES = 512
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024
const MAX_EXPANDED_BYTES = 512 * 1024 * 1024
const MAX_ENTRY_BYTES = 128 * 1024 * 1024
const SHA256 = /^[0-9a-f]{64}$/u

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

const CREDENTIAL_PATTERNS = [
  /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/u,
  /(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{20,}/u,
  /(?<![A-Za-z0-9])hch_[A-Za-z0-9_-]{12,}/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /Authorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/-]+/iu,
] as const

const DEVELOPER_PATH_PATTERNS = [
  /[A-Za-z]:\\(?:Users|Documents and Settings)\\(?!(?:me|u|user|username|example)(?:\\|\b))[^\\\s"']+/iu,
  /\/(?:Users|home)\/(?!(?:me|u|user|username|example)(?:\/|\b))[A-Za-z0-9._-]+\/(?:[^\s"']+)/iu,
] as const

const FORBIDDEN_ARCHIVE_PATHS = [
  /(?:^|\/)\.git(?:\/|$)/u,
  /(?:^|\/)\.svn(?:\/|$)/u,
  /(?:^|\/)\.hg(?:\/|$)/u,
  /(?:^|\/)node_modules(?:\/|$)/u,
  /(?:^|\/)coverage(?:\/|$)/u,
  /(?:^|\/)test-results?(?:\/|$)/u,
  /(?:^|\/)\.env(?:\.|$)/u,
  /(?:^|\/)(?:\.npmrc|\.yarnrc|\.pnpmfile\.cjs|\.DS_Store|Thumbs\.db)$/u,
  /(?:^|\/)[^/]+\.tsbuildinfo$/u,
] as const

interface TarEntry {
  readonly path: string
  readonly type: 'file' | 'directory'
  readonly contents: Buffer
}

export interface InspectedPackageEntry {
  readonly path: string
  readonly bytes: number
  readonly sha256: string
}

export interface InspectedPackage {
  readonly packageName: string
  readonly packageVersion: string
  readonly archiveSha256: string
  readonly archiveBytes: number
  readonly contentsSha256: string
  readonly entries: readonly InspectedPackageEntry[]
  readonly notices: readonly string[]
}

export interface PackageInspectionOptions {
  readonly archivePath: string
  readonly expectedNoticeBasenames?: readonly string[]
  readonly allowMissingNotice?: boolean
  /** Exact operator-owned roots whose machine-specific values must never ship. */
  readonly forbiddenAbsolutePaths?: readonly string[]
}

function readString(buffer: Buffer, offset: number, length: number): string {
  const end = buffer.indexOf(0, offset)
  const boundedEnd = end >= offset && end < offset + length ? end : offset + length
  return buffer.subarray(offset, boundedEnd).toString('utf8')
}

function readOctal(buffer: Buffer, offset: number, length: number, label: string): number {
  const value = readString(buffer, offset, length).trim().replace(/^0+/u, '')
  if (value === '') return 0
  if (!/^[0-7]+$/u.test(value)) throw new AssemblyError('INVALID_PACKAGE_ARCHIVE', `${label} is not octal`)
  const parsed = Number.parseInt(value, 8)
  if (!Number.isSafeInteger(parsed)) throw new AssemblyError('INVALID_PACKAGE_ARCHIVE', `${label} exceeds safe size`)
  return parsed
}

function assertHeaderChecksum(header: Buffer): void {
  const expected = readOctal(header, 148, 8, 'tar checksum')
  let actual = 0
  for (let index = 0; index < TAR_BLOCK_BYTES; index += 1) {
    actual += index >= 148 && index < 156 ? 32 : (header[index] ?? 0)
  }
  if (actual !== expected) throw new AssemblyError('INVALID_PACKAGE_ARCHIVE', 'tar header checksum mismatch')
}

function parsePaxPath(contents: Buffer): string | undefined {
  let offset = 0
  let result: string | undefined
  while (offset < contents.length) {
    const separator = contents.indexOf(32, offset)
    if (separator < 0) throw new AssemblyError('INVALID_PACKAGE_ARCHIVE', 'PAX record has no length delimiter')
    const lengthText = contents.subarray(offset, separator).toString('ascii')
    if (!/^[1-9][0-9]*$/u.test(lengthText)) throw new AssemblyError('INVALID_PACKAGE_ARCHIVE', 'PAX length is invalid')
    const length = Number.parseInt(lengthText, 10)
    const end = offset + length
    if (!Number.isSafeInteger(length) || end > contents.length || contents[end - 1] !== 10) {
      throw new AssemblyError('INVALID_PACKAGE_ARCHIVE', 'PAX record exceeds its entry')
    }
    const record = contents.subarray(separator + 1, end - 1).toString('utf8')
    const equals = record.indexOf('=')
    if (equals < 1) throw new AssemblyError('INVALID_PACKAGE_ARCHIVE', 'PAX record has no key')
    if (record.slice(0, equals) === 'path') result = record.slice(equals + 1)
    offset = end
  }
  return result
}

function assertArchivePath(value: string): string {
  if (value.endsWith('/')) value = value.slice(0, -1)
  assertPortableRelativePath(value, 'package archive entry')
  if (value === 'package' || !value.startsWith('package/')) {
    throw new AssemblyError('PACKAGE_BOUNDARY_ESCAPE', 'npm package entries must remain beneath package/')
  }
  if (FORBIDDEN_ARCHIVE_PATHS.some((pattern) => pattern.test(value))) {
    throw new AssemblyError('UNEXPECTED_PACKAGE_FILE', 'package contains forbidden generated or metadata content')
  }
  return value
}

function parseTar(expanded: Buffer): readonly TarEntry[] {
  const entries: TarEntry[] = []
  const names = new Set<string>()
  let offset = 0
  let pendingPath: string | undefined
  while (offset + TAR_BLOCK_BYTES <= expanded.length) {
    const header = expanded.subarray(offset, offset + TAR_BLOCK_BYTES)
    if (header.every((byte) => byte === 0)) break
    assertHeaderChecksum(header)
    const prefix = readString(header, 345, 155)
    const name = readString(header, 0, 100)
    const rawPath = pendingPath ?? (prefix === '' ? name : `${prefix}/${name}`)
    pendingPath = undefined
    const size = readOctal(header, 124, 12, 'tar entry size')
    if (size > MAX_ENTRY_BYTES) throw new AssemblyError('PACKAGE_ENTRY_TOO_LARGE', 'package entry exceeds inspection limit')
    const contentStart = offset + TAR_BLOCK_BYTES
    const contentEnd = contentStart + size
    if (contentEnd > expanded.length) throw new AssemblyError('INVALID_PACKAGE_ARCHIVE', 'tar entry is truncated')
    const typeFlag = String.fromCharCode(header[156] ?? 0)
    const contents = expanded.subarray(contentStart, contentEnd)
    if (typeFlag === 'x' || typeFlag === 'g') {
      pendingPath = parsePaxPath(contents) ?? pendingPath
    } else if (typeFlag === 'L') {
      pendingPath = contents.subarray(0, Math.max(0, contents.length - 1)).toString('utf8')
    } else if (typeFlag === '\0' || typeFlag === '0' || typeFlag === '5') {
      const archivePath = assertArchivePath(rawPath)
      if (names.has(archivePath)) throw new AssemblyError('DUPLICATE_PACKAGE_ENTRY', 'package contains duplicate paths')
      names.add(archivePath)
      entries.push({ path: archivePath, type: typeFlag === '5' ? 'directory' : 'file', contents })
    } else {
      throw new AssemblyError('UNSUPPORTED_PACKAGE_ENTRY', 'package contains links or unsupported tar entry types')
    }
    offset = contentStart + Math.ceil(size / TAR_BLOCK_BYTES) * TAR_BLOCK_BYTES
  }
  if (entries.length === 0) throw new AssemblyError('EMPTY_PACKAGE_ARCHIVE', 'package archive contains no entries')
  return entries
}

function forbiddenPathVariants(values: readonly string[]): readonly string[] {
  const variants = new Set<string>()
  for (const value of values) {
    if (!path.isAbsolute(value)) {
      throw new AssemblyError('INVALID_FORBIDDEN_PATH', 'package inspection forbidden paths must be absolute')
    }
    const resolved = path.resolve(value)
    for (const variant of [resolved, resolved.replaceAll('\\', '/'), resolved.replaceAll('/', '\\')]) {
      variants.add(variant)
      variants.add(variant.replaceAll('\\', '\\\\'))
    }
  }
  return Object.freeze([...variants].filter((value) => value.length > 0))
}

function scanText(contents: Buffer, forbiddenPaths: readonly string[]): void {
  const text = contents.toString('utf8')
  if (CREDENTIAL_PATTERNS.some((pattern) => pattern.test(text))) {
    throw new AssemblyError('PACKAGE_CONTAINS_CREDENTIAL', 'package contains credential-like content')
  }
  if (
    DEVELOPER_PATH_PATTERNS.some((pattern) => pattern.test(text)) ||
    forbiddenPaths.some((forbiddenPath) => text.includes(forbiddenPath))
  ) {
    throw new AssemblyError('PACKAGE_CONTAINS_DEVELOPER_PATH', 'package contains a developer absolute path')
  }
}

function basenameUpper(value: string): string {
  return path.posix.basename(value).toUpperCase()
}

/** Inspect one npm tarball without extracting it to the host filesystem. */
export async function inspectNpmPackage(options: PackageInspectionOptions): Promise<InspectedPackage> {
  const archive = await readFile(options.archivePath)
  if (archive.byteLength === 0 || archive.byteLength > MAX_ARCHIVE_BYTES) {
    throw new AssemblyError('PACKAGE_ARCHIVE_SIZE', 'package archive is empty or exceeds the inspection limit')
  }
  let expanded: Buffer
  try {
    expanded = gunzipSync(archive, { maxOutputLength: MAX_EXPANDED_BYTES })
  } catch (error) {
    throw new AssemblyError('INVALID_PACKAGE_ARCHIVE', 'package is not a bounded gzip tar archive', { cause: error })
  }
  const tarEntries = parseTar(expanded)
  const files = tarEntries.filter((entry) => entry.type === 'file')
  const forbiddenPaths = forbiddenPathVariants(options.forbiddenAbsolutePaths ?? [])
  for (const entry of files) scanText(entry.contents, forbiddenPaths)

  const packageJsonEntry = files.find((entry) => entry.path === 'package/package.json')
  if (packageJsonEntry === undefined) throw new AssemblyError('PACKAGE_METADATA_MISSING', 'package/package.json is required')
  let packageJson: unknown
  try {
    packageJson = JSON.parse(packageJsonEntry.contents.toString('utf8'))
  } catch (error) {
    throw new AssemblyError('PACKAGE_METADATA_INVALID', 'package/package.json is invalid JSON', { cause: error })
  }
  if (packageJson === null || typeof packageJson !== 'object' || Array.isArray(packageJson)) {
    throw new AssemblyError('PACKAGE_METADATA_INVALID', 'package metadata must be an object')
  }
  const metadata = packageJson as Record<string, unknown>
  if (typeof metadata.name !== 'string' || metadata.name.length === 0 || typeof metadata.version !== 'string' || metadata.version.length === 0) {
    throw new AssemblyError('PACKAGE_METADATA_INVALID', 'package name and version are required')
  }

  const expectedNoticeBasenames = (options.expectedNoticeBasenames ?? ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md'])
    .map((value) => value.toUpperCase())
  const notices = files
    .map((entry) => entry.path)
    .filter((entryPath) => expectedNoticeBasenames.includes(basenameUpper(entryPath)))
    .sort(compareCodeUnits)
  if (notices.length === 0 && options.allowMissingNotice !== true) {
    throw new AssemblyError('PACKAGE_NOTICE_MISSING', 'package contains none of its declared license or notice files')
  }

  const entries = files
    .map((entry): InspectedPackageEntry => ({
      path: entry.path,
      bytes: entry.contents.byteLength,
      sha256: createHash('sha256').update(entry.contents).digest('hex'),
    }))
    .sort((left, right) => compareCodeUnits(left.path, right.path))
  const contentsHash = createHash('sha256')
  for (const entry of entries) contentsHash.update(`${entry.path}\0${String(entry.bytes)}\0${entry.sha256}\n`)
  const archiveSha256 = createHash('sha256').update(archive).digest('hex')
  if (!SHA256.test(archiveSha256)) throw new AssemblyError('PACKAGE_HASH_FAILED', 'package SHA-256 could not be generated')
  return Object.freeze({
    packageName: metadata.name,
    packageVersion: metadata.version,
    archiveSha256,
    archiveBytes: archive.byteLength,
    contentsSha256: contentsHash.digest('hex'),
    entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
    notices: Object.freeze(notices),
  })
}
