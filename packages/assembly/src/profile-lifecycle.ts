import { createHash, randomUUID } from 'node:crypto'
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import path, { type PlatformPath } from 'node:path'
import { AssemblyError } from './errors.js'
import { validatePackageIntegrity, type PackageIntegrityV1 } from './integrity.js'
import { inspectNpmPackage } from './package-inspection.js'
import { assertPortableRelativePath, resolveContainedPath, resolveHostContainedPath } from './paths.js'
import { defaultProcessRunner, type ProcessRunner } from './command-adapter.js'
import type { AssemblyManifestV1 } from './types.js'

const DISTRIBUTION_FILENAME = 'recursus-distribution.json'
const PROFILE_MARKER_FILENAME = '.recursus-profile.json'
const PROFILE_PACKAGE_MANAGER_VERSION = '11.19.0'
const PROFILE_NAME = /^[a-z0-9][a-z0-9.-]{0,63}$/u
const NPM_PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u
const SHA256 = /^[0-9a-f]{64}$/u
const CREDENTIAL_ENVIRONMENT_NAME = /(?:TOKEN|SECRET|PASSWORD|API_KEY|AUTHORIZATION|CREDENTIAL|COOKIE)/iu
const CREDENTIAL_TEXT = [
  /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/u,
  /(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{20,}/u,
  /(?<![A-Za-z0-9])hch_[A-Za-z0-9_-]{12,}/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /Authorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/-]+/iu,
] as const
const DEVELOPER_PATH_TEXT = [
  /[A-Za-z]:\\(?:Users|Documents and Settings)\\(?!(?:me|u|user|username|example)(?:\\|\b))[^\\\s"']+/iu,
  /\/(?:Users|home)\/(?!(?:me|u|user|username|example)(?:\/|\b))[A-Za-z0-9._-]+\/(?:[^\s"']+)/iu,
] as const

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function sha256(contents: Buffer | string): string {
  return createHash('sha256').update(contents).digest('hex')
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function portableJoin(...parts: readonly string[]): string {
  return parts.join('/')
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target)
    return true
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
}

async function assertRealDirectory(directory: string, code: string, label: string): Promise<string> {
  let info
  try {
    info = await lstat(directory)
  } catch (error) {
    if (isMissing(error)) throw new AssemblyError(code, `${label} does not exist`)
    throw error
  }
  if (!info.isDirectory() || info.isSymbolicLink()) throw new AssemblyError(code, `${label} must be a real directory`)
  return await realpath(directory)
}

function assertContainedRealPath(root: string, target: string, label: string): void {
  const relative = path.relative(root, target)
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new AssemblyError('PROFILE_BOUNDARY_ESCAPE', `${label} escapes the isolated profile`)
  }
}

function assertProfileName(profileName: string): string {
  if (
    !PROFILE_NAME.test(profileName) || profileName === '.' || profileName === '..' ||
    profileName === 'node_modules' || profileName.endsWith('.') ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(profileName)
  ) {
    throw new AssemblyError('INVALID_PROFILE_NAME', 'profile name must be an explicit lowercase DSH profile name')
  }
  return profileName
}

/** Resolve a named DSH profile with either POSIX or Windows path semantics. */
export function resolveRecursusProfilePath(pathApi: PlatformPath, dshHome: string, profileName: string): string {
  if (!pathApi.isAbsolute(dshHome)) throw new AssemblyError('DSH_HOME_NOT_ABSOLUTE', 'DSH home must be absolute')
  return resolveContainedPath(pathApi, pathApi.resolve(dshHome), 'profiles', assertProfileName(profileName))
}

export interface LockedDistributionPackageV1 {
  readonly component: string
  readonly path: string
  readonly packageName: string
  readonly packageVersion: string
  readonly sha256: string
  readonly bytes: number
}

export interface LockedDistributionComponentV1 {
  readonly name: string
  readonly revision: string
  readonly packages: readonly string[]
}

export interface LockedDistributionV1 {
  readonly schemaVersion: 1
  readonly assemblyId: string
  readonly dshRevision: string
  readonly packageManager: { readonly name: 'pnpm'; readonly version: '11.19.0' }
  readonly profileLockSha256: string
  readonly bundles: readonly string[]
  readonly installedPlugins: readonly string[]
  readonly credentialReferences: readonly string[]
  readonly components: readonly LockedDistributionComponentV1[]
  readonly packages: readonly LockedDistributionPackageV1[]
}

export interface ProfilePackageManager {
  readonly executable: string
  readonly argumentPrefix?: readonly string[]
  readonly version: '11.19.0'
}

export interface BuildLockedDistributionOptions {
  readonly manifest: AssemblyManifestV1
  readonly integrity: PackageIntegrityV1
  readonly profileLockContents: string
  readonly workRoot: string
}

export interface LockedDistributionResult {
  readonly directory: string
  readonly manifest: LockedDistributionV1
  readonly manifestSha256: string
  readonly reused: boolean
}

function validateLockedDistribution(value: unknown): LockedDistributionV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AssemblyError('INVALID_LOCKED_DISTRIBUTION', 'locked distribution manifest must be an object')
  }
  const document = value as Record<string, unknown>
  const expectedKeys = [
    'schemaVersion',
    'assemblyId',
    'dshRevision',
    'packageManager',
    'profileLockSha256',
    'bundles',
    'installedPlugins',
    'credentialReferences',
    'components',
    'packages',
  ]
  if (Object.keys(document).sort().join('\0') !== expectedKeys.sort().join('\0')) {
    throw new AssemblyError('INVALID_LOCKED_DISTRIBUTION', 'locked distribution fields differ from schema version 1')
  }
  if (
    document.schemaVersion !== 1 ||
    typeof document.assemblyId !== 'string' ||
    !PROFILE_NAME.test(document.assemblyId) ||
    typeof document.dshRevision !== 'string' ||
    !/^[0-9a-f]{40}$/u.test(document.dshRevision) ||
    typeof document.profileLockSha256 !== 'string' ||
    !SHA256.test(document.profileLockSha256)
  ) {
    throw new AssemblyError('INVALID_LOCKED_DISTRIBUTION', 'locked distribution header is invalid')
  }
  const packageManager = document.packageManager as Record<string, unknown> | null
  if (
    packageManager === null ||
    typeof packageManager !== 'object' ||
    Array.isArray(packageManager) ||
    Object.keys(packageManager).sort().join('\0') !== ['name', 'version'].join('\0') ||
    packageManager.name !== 'pnpm' ||
    packageManager.version !== PROFILE_PACKAGE_MANAGER_VERSION
  ) {
    throw new AssemblyError('INVALID_LOCKED_DISTRIBUTION', 'locked distribution package manager is invalid')
  }
  function strings(field: string, credentialIdentifiers = false): readonly string[] {
    const input = document[field]
    if (!Array.isArray(input) || input.some((item) => typeof item !== 'string')) {
      throw new AssemblyError('INVALID_LOCKED_DISTRIBUTION', `${field} must be a string array`)
    }
    const items = input as string[]
    if (
      new Set(items).size !== items.length ||
      items.some((item) => credentialIdentifiers ? !/^[A-Z][A-Z0-9_]*$/u.test(item) : !NPM_PACKAGE_NAME.test(item))
    ) {
      throw new AssemblyError('INVALID_LOCKED_DISTRIBUTION', `${field} contains invalid or duplicate entries`)
    }
    return Object.freeze([...items])
  }
  const bundles = strings('bundles')
  const installedPlugins = strings('installedPlugins')
  const credentialReferences = strings('credentialReferences', true)
  if (!Array.isArray(document.components) || !Array.isArray(document.packages)) {
    throw new AssemblyError('INVALID_LOCKED_DISTRIBUTION', 'locked distribution components and packages must be arrays')
  }
  let previousComponent = ''
  const components = document.components.map((value, index): LockedDistributionComponentV1 => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new AssemblyError('INVALID_LOCKED_DISTRIBUTION', `components[${String(index)}] must be an object`)
    }
    const item = value as Record<string, unknown>
    if (Object.keys(item).sort().join('\0') !== ['name', 'packages', 'revision'].join('\0')) {
      throw new AssemblyError('INVALID_LOCKED_DISTRIBUTION', `components[${String(index)}] fields are invalid`)
    }
    if (
      typeof item.name !== 'string' || !PROFILE_NAME.test(item.name) || item.name <= previousComponent ||
      typeof item.revision !== 'string' || !/^[0-9a-f]{40}$/u.test(item.revision) ||
      !Array.isArray(item.packages) || item.packages.length === 0 ||
      item.packages.some((name) => typeof name !== 'string' || !NPM_PACKAGE_NAME.test(name)) ||
      new Set(item.packages).size !== item.packages.length ||
      (item.packages as string[]).some((name, itemIndex, names) => itemIndex > 0 && name <= (names[itemIndex - 1] ?? ''))
    ) {
      throw new AssemblyError('INVALID_LOCKED_DISTRIBUTION', `components[${String(index)}] is invalid or unsorted`)
    }
    previousComponent = item.name
    return Object.freeze({
      name: item.name,
      revision: item.revision,
      packages: Object.freeze([...(item.packages as string[])]),
    })
  })
  let previousPackage = ''
  const names = new Set<string>()
  const packages = document.packages.map((value, index): LockedDistributionPackageV1 => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new AssemblyError('INVALID_LOCKED_DISTRIBUTION', `packages[${String(index)}] must be an object`)
    }
    const item = value as Record<string, unknown>
    if (Object.keys(item).sort().join('\0') !== ['bytes', 'component', 'packageName', 'packageVersion', 'path', 'sha256'].join('\0')) {
      throw new AssemblyError('INVALID_LOCKED_DISTRIBUTION', `packages[${String(index)}] fields are invalid`)
    }
    if (
      typeof item.component !== 'string' || !PROFILE_NAME.test(item.component) ||
      typeof item.path !== 'string' ||
      typeof item.packageName !== 'string' || !NPM_PACKAGE_NAME.test(item.packageName) || names.has(item.packageName) ||
      typeof item.packageVersion !== 'string' || item.packageVersion.length === 0 ||
      typeof item.sha256 !== 'string' || !SHA256.test(item.sha256) ||
      !Number.isSafeInteger(item.bytes) || (item.bytes as number) < 1
    ) {
      throw new AssemblyError('INVALID_LOCKED_DISTRIBUTION', `packages[${String(index)}] is invalid`)
    }
    assertPortableRelativePath(item.path, `packages[${String(index)}].path`)
    const orderKey = `${item.component}\0${item.path}`
    if (orderKey <= previousPackage) {
      throw new AssemblyError('INVALID_LOCKED_DISTRIBUTION', 'locked distribution packages must be unique and sorted')
    }
    previousPackage = orderKey
    names.add(item.packageName)
    return Object.freeze({
      component: item.component,
      path: item.path,
      packageName: item.packageName,
      packageVersion: item.packageVersion,
      sha256: item.sha256,
      bytes: item.bytes as number,
    })
  })
  const packageNames = new Set(packages.map((item) => item.packageName))
  for (const name of [...bundles, ...installedPlugins]) {
    if (!packageNames.has(name)) throw new AssemblyError('INVALID_LOCKED_DISTRIBUTION', `profile package ${name} is absent`)
  }
  return Object.freeze({
    schemaVersion: 1,
    assemblyId: document.assemblyId,
    dshRevision: document.dshRevision,
    packageManager: Object.freeze({ name: 'pnpm', version: PROFILE_PACKAGE_MANAGER_VERSION }),
    profileLockSha256: document.profileLockSha256,
    bundles,
    installedPlugins,
    credentialReferences,
    components: Object.freeze(components),
    packages: Object.freeze(packages),
  })
}

async function verifyDistributionDirectory(directory: string): Promise<LockedDistributionResult> {
  const realDirectory = await assertRealDirectory(directory, 'INVALID_LOCKED_DISTRIBUTION', 'distribution directory')
  const manifestPath = resolveHostContainedPath(realDirectory, DISTRIBUTION_FILENAME)
  const manifestContents = await readFile(manifestPath, 'utf8')
  let value: unknown
  try {
    value = JSON.parse(manifestContents)
  } catch (error) {
    throw new AssemblyError('INVALID_LOCKED_DISTRIBUTION', 'distribution manifest is not JSON', { cause: error })
  }
  const manifest = validateLockedDistribution(value)
  if (manifestContents !== json(manifest)) {
    throw new AssemblyError('INVALID_LOCKED_DISTRIBUTION', 'distribution manifest is not deterministic JSON')
  }
  const lockfilePath = resolveHostContainedPath(realDirectory, 'pnpm-lock.yaml')
  const lockfileInfo = await lstat(lockfilePath)
  if (!lockfileInfo.isFile() || lockfileInfo.isSymbolicLink()) {
    throw new AssemblyError('LOCKED_DISTRIBUTION_MISMATCH', 'distribution profile lockfile must be a real file')
  }
  const lockfile = await readFile(lockfilePath, 'utf8')
  if (sha256(lockfile) !== manifest.profileLockSha256) {
    throw new AssemblyError('LOCKED_DISTRIBUTION_MISMATCH', 'distribution profile lockfile hash differs from its manifest')
  }
  assertSafeGeneratedText(lockfile, [realDirectory], 'distribution profile lockfile')
  for (const item of manifest.packages) {
    const archive = resolveHostContainedPath(realDirectory, 'archives', ...item.path.split('/'))
    const archiveInfo = await lstat(archive)
    if (!archiveInfo.isFile() || archiveInfo.isSymbolicLink()) {
      throw new AssemblyError('LOCKED_DISTRIBUTION_MISMATCH', 'distribution archive must be a real file')
    }
    const inspected = await inspectNpmPackage({ archivePath: archive, allowMissingNotice: true })
    if (
      inspected.packageName !== item.packageName ||
      inspected.packageVersion !== item.packageVersion ||
      inspected.archiveSha256 !== item.sha256 ||
      inspected.archiveBytes !== item.bytes
    ) {
      throw new AssemblyError('LOCKED_DISTRIBUTION_MISMATCH', 'distribution archive differs from its accepted identity')
    }
  }
  return Object.freeze({
    directory: realDirectory,
    manifest,
    manifestSha256: sha256(manifestContents),
    reused: true,
  })
}

function assertDistributionMatchesInputs(
  distribution: LockedDistributionV1,
  manifest: AssemblyManifestV1,
  integrity: PackageIntegrityV1,
): void {
  const bundles = manifest.components.flatMap((component) =>
    component.profileContribution.kind === 'cordis-plugin' ? [] : component.profileContribution.packages,
  )
  const installedPlugins = manifest.components.flatMap((component) =>
    component.profileContribution.kind === 'cordis-plugin' ? component.profileContribution.packages : [],
  )
  const credentialReferences = [...new Set(manifest.components.flatMap(
    (component) => component.profileContribution.credentialReferences,
  ))].sort(compareCodeUnits)
  const components = manifest.components
    .map((component) => ({ name: component.name, revision: component.revision }))
    .sort((left, right) => compareCodeUnits(left.name, right.name))
  const distributedComponents = distribution.components.map((component) => ({
    name: component.name,
    revision: component.revision,
  }))
  const acceptedPackages = integrity.packages.map((item) => ({
    component: item.component,
    path: item.path,
    sha256: item.sha256,
    bytes: item.bytes,
  }))
  const distributedPackages = distribution.packages.map((item) => ({
    component: item.component,
    path: item.path,
    sha256: item.sha256,
    bytes: item.bytes,
  }))
  if (
    distribution.assemblyId !== manifest.assemblyId ||
    distribution.profileLockSha256 !== manifest.profileLock.sha256 ||
    JSON.stringify(distribution.bundles) !== JSON.stringify(bundles) ||
    JSON.stringify(distribution.installedPlugins) !== JSON.stringify(installedPlugins) ||
    JSON.stringify(distribution.credentialReferences) !== JSON.stringify(credentialReferences) ||
    JSON.stringify(distributedComponents) !== JSON.stringify(components) ||
    JSON.stringify(distributedPackages) !== JSON.stringify(acceptedPackages)
  ) {
    throw new AssemblyError('LOCKED_DISTRIBUTION_INPUT_MISMATCH', 'existing distribution differs from current locked inputs')
  }
}

/** Re-inspect accepted archives and copy their exact bytes into a deterministic locked distribution. */
export async function buildLockedDistribution(options: BuildLockedDistributionOptions): Promise<LockedDistributionResult> {
  const integrity = validatePackageIntegrity(options.integrity)
  if (integrity.assemblyId !== options.manifest.assemblyId) {
    throw new AssemblyError('PACKAGE_INTEGRITY_MISMATCH', 'integrity and assembly identifiers differ')
  }
  if (sha256(options.profileLockContents) !== options.manifest.profileLock.sha256) {
    throw new AssemblyError('PROFILE_LOCK_MISMATCH', 'profile lockfile differs from the assembly source lock')
  }
  await mkdir(options.workRoot, { recursive: true })
  const realWorkRoot = await assertRealDirectory(options.workRoot, 'UNSAFE_WORK_ROOT', 'work root')
  assertSafeGeneratedText(options.profileLockContents, [realWorkRoot], 'profile source lock')
  const packagesRoot = resolveHostContainedPath(realWorkRoot, ...options.manifest.workRoot.paths.packages.split('/'))
  await assertRealDirectory(packagesRoot, 'UNSAFE_WORK_ROOT', 'accepted package root')
  const distributionsRoot = resolveHostContainedPath(realWorkRoot, 'distributions')
  await mkdir(distributionsRoot, { recursive: true })
  const realDistributionsRoot = await assertRealDirectory(distributionsRoot, 'UNSAFE_WORK_ROOT', 'distribution root')
  const inputIdentity = sha256(json({ manifest: options.manifest, integrity }))
  const distributionName = `${options.manifest.assemblyId}-${inputIdentity.slice(0, 16)}`
  const target = resolveHostContainedPath(realDistributionsRoot, distributionName)
  if (await exists(target)) {
    const existing = await verifyDistributionDirectory(target)
    assertDistributionMatchesInputs(existing.manifest, options.manifest, integrity)
    return existing
  }

  const componentsByName = new Map(options.manifest.components.map((component) => [component.name, component]))
  const staging = resolveHostContainedPath(realDistributionsRoot, `.${distributionName}-${randomUUID()}`)
  await mkdir(staging)
  try {
    const packages: LockedDistributionPackageV1[] = []
    for (const accepted of integrity.packages) {
      const component = componentsByName.get(accepted.component)
      if (component === undefined) throw new AssemblyError('PACKAGE_INTEGRITY_MISMATCH', 'integrity names an unknown component')
      const source = resolveHostContainedPath(packagesRoot, ...accepted.path.split('/'))
      const sourceInfo = await lstat(source)
      if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) {
        throw new AssemblyError('PACKAGE_INTEGRITY_MISMATCH', 'accepted archive must be a real file')
      }
      const inspected = await inspectNpmPackage({
        archivePath: source,
        expectedNoticeBasenames: component.license.noticeFiles,
        allowMissingNotice: component.license.redistribution === 'blocked-pending-owner-license',
        forbiddenAbsolutePaths: [realWorkRoot],
      })
      if (inspected.archiveSha256 !== accepted.sha256 || inspected.archiveBytes !== accepted.bytes) {
        throw new AssemblyError('PACKAGE_INTEGRITY_MISMATCH', 'accepted archive bytes differ from package integrity')
      }
      const distributionPath = portableJoin('archives', accepted.path)
      const destination = resolveHostContainedPath(staging, ...distributionPath.split('/'))
      await mkdir(path.dirname(destination), { recursive: true })
      await copyFile(source, destination)
      packages.push(Object.freeze({
        component: accepted.component,
        path: accepted.path,
        packageName: inspected.packageName,
        packageVersion: inspected.packageVersion,
        sha256: inspected.archiveSha256,
        bytes: inspected.archiveBytes,
      }))
    }
    packages.sort((left, right) => compareCodeUnits(`${left.component}\0${left.path}`, `${right.component}\0${right.path}`))
    const componentPackages = new Map<string, string[]>()
    for (const item of packages) {
      const names = componentPackages.get(item.component) ?? []
      names.push(item.packageName)
      componentPackages.set(item.component, names)
    }
    const bundles = options.manifest.components.flatMap((component) =>
      component.profileContribution.kind === 'cordis-plugin' ? [] : component.profileContribution.packages,
    )
    const installedPlugins = options.manifest.components.flatMap((component) =>
      component.profileContribution.kind === 'cordis-plugin' ? component.profileContribution.packages : [],
    )
    const credentialReferences = [...new Set(options.manifest.components.flatMap(
      (component) => component.profileContribution.credentialReferences,
    ))].sort(compareCodeUnits)
    const harness = options.manifest.components.find((component) => component.name === 'deepseek-harness')
    if (harness === undefined || !packages.some((item) => item.packageName === '@deepseek-ai/dsh')) {
      throw new AssemblyError('LOCKED_DISTRIBUTION_INCOMPLETE', 'the locked DSH application package is required')
    }
    const manifest = validateLockedDistribution({
      schemaVersion: 1,
      assemblyId: options.manifest.assemblyId,
      dshRevision: harness.revision,
      packageManager: { name: 'pnpm', version: PROFILE_PACKAGE_MANAGER_VERSION },
      profileLockSha256: options.manifest.profileLock.sha256,
      bundles,
      installedPlugins,
      credentialReferences,
      components: options.manifest.components
        .map((component) => ({
          name: component.name,
          revision: component.revision,
          packages: [...(componentPackages.get(component.name) ?? [])].sort(compareCodeUnits),
        }))
        .sort((left, right) => compareCodeUnits(left.name, right.name)),
      packages,
    })
    const contents = json(manifest)
    await writeFile(resolveHostContainedPath(staging, 'pnpm-lock.yaml'), options.profileLockContents, {
      encoding: 'utf8',
      flag: 'wx',
    })
    await writeFile(resolveHostContainedPath(staging, DISTRIBUTION_FILENAME), contents, { encoding: 'utf8', flag: 'wx' })
    try {
      await rename(staging, target)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      await rm(staging, { recursive: true })
      const existing = await verifyDistributionDirectory(target)
      assertDistributionMatchesInputs(existing.manifest, options.manifest, integrity)
      return existing
    }
    return Object.freeze({
      directory: target,
      manifest,
      manifestSha256: sha256(contents),
      reused: false,
    })
  } catch (error) {
    if (await exists(staging)) await rm(staging, { recursive: true })
    throw error
  }
}

export interface ProfileLifecycleOptions {
  readonly distributionDirectory: string
  readonly dshHome: string
  readonly profileName: string
  readonly workRoot: string
  readonly packageManager: ProfilePackageManager
  readonly runProcess?: ProcessRunner
  readonly signal?: AbortSignal
}

export interface ProfileLifecycleEvidence {
  readonly schemaVersion: 1
  readonly operation: 'install' | 'update' | 'verify' | 'remove'
  readonly profileName: string
  readonly assemblyId: string
  readonly packageCount: number
  readonly credentialReferences: readonly string[]
  readonly status: 'installed' | 'updated' | 'unchanged' | 'verified' | 'removed'
}

export interface ProfileLifecycleResult {
  readonly profileDirectory: string
  readonly evidence: ProfileLifecycleEvidence
}

interface ProfileMarkerV1 {
  readonly schemaVersion: 1
  readonly profileName: string
  readonly assemblyId: string
  readonly distributionSha256: string
  readonly lockfileSha256: string
  readonly packageCount: number
  readonly credentialReferences: readonly string[]
}

interface ProfileContext {
  readonly distributionDirectory: string
  readonly distribution: LockedDistributionV1
  readonly distributionSha256: string
  readonly dshHome: string
  readonly profilesRoot: string
  readonly profileDirectory: string
  readonly profileName: string
  readonly workRoot: string
}

async function prepareProfileContext(options: ProfileLifecycleOptions): Promise<ProfileContext> {
  if (options.packageManager.version !== PROFILE_PACKAGE_MANAGER_VERSION) {
    throw new AssemblyError('PROFILE_PACKAGE_MANAGER_MISMATCH', 'profile lifecycle requires exact pnpm 11.19.0')
  }
  if (!path.isAbsolute(options.packageManager.executable)) {
    throw new AssemblyError('PROFILE_PACKAGE_MANAGER_NOT_ABSOLUTE', 'profile package-manager executable must be absolute')
  }
  const distributionResult = await verifyDistributionDirectory(options.distributionDirectory)
  const workRoot = await assertRealDirectory(options.workRoot, 'UNSAFE_WORK_ROOT', 'work root')
  await mkdir(options.dshHome, { recursive: true })
  const dshHome = await assertRealDirectory(options.dshHome, 'UNSAFE_DSH_HOME', 'DSH home')
  const profilesRoot = resolveHostContainedPath(dshHome, 'profiles')
  await mkdir(profilesRoot, { recursive: true })
  const realProfilesRoot = await assertRealDirectory(profilesRoot, 'UNSAFE_DSH_HOME', 'DSH profiles root')
  const profileName = assertProfileName(options.profileName)
  const profileDirectory = resolveHostContainedPath(realProfilesRoot, profileName)
  return Object.freeze({
    distributionDirectory: distributionResult.directory,
    distribution: distributionResult.manifest,
    distributionSha256: distributionResult.manifestSha256,
    dshHome,
    profilesRoot: realProfilesRoot,
    profileDirectory,
    profileName,
    workRoot,
  })
}

function profilePackageJson(distribution: LockedDistributionV1): string {
  const dependencies: Record<string, string> = {}
  for (const item of [...distribution.packages].sort((left, right) => compareCodeUnits(left.packageName, right.packageName))) {
    const reference = `file:./.recursus/packages/${item.path}`
    dependencies[item.packageName] = reference
  }
  return json({
    name: 'dsh-profile-recursus',
    private: true,
    packageManager: `pnpm@${PROFILE_PACKAGE_MANAGER_VERSION}`,
    dependencies,
    dsh: { profile: { bundles: distribution.bundles } },
    recursus: {
      schemaVersion: 1,
      assemblyId: distribution.assemblyId,
      credentialReferences: distribution.credentialReferences,
    },
  })
}

const PROFILE_PATCH = `# Recursus-owned user layer. Component bundles are applied in package.json order.\n[]\n`

function profileWorkspace(distribution: LockedDistributionV1): string {
  const overrides = [...distribution.packages]
    .sort((left, right) => compareCodeUnits(left.packageName, right.packageName))
    .map((item) => `  '${item.packageName}': file:./.recursus/packages/${item.path}`)
    .join('\n')
  return `packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\noverrides:\n${overrides}\n`
}

function managedProfileFiles(context: ProfileContext): ReadonlyMap<string, string> {
  return new Map([
    ['package.json', profilePackageJson(context.distribution)],
    ['cordis.patch.yml', PROFILE_PATCH],
    ['pnpm-workspace.yaml', profileWorkspace(context.distribution)],
  ])
}

function forbiddenVariants(values: readonly string[]): readonly string[] {
  const variants = new Set<string>()
  for (const value of values) {
    const resolved = path.resolve(value)
    variants.add(resolved)
    variants.add(resolved.replaceAll('\\', '/'))
    variants.add(resolved.replaceAll('/', '\\'))
    variants.add(resolved.replaceAll('\\', '\\\\'))
  }
  return [...variants]
}

function assertSafeGeneratedText(contents: string, forbiddenPaths: readonly string[], label: string): void {
  if (CREDENTIAL_TEXT.some((pattern) => pattern.test(contents))) {
    throw new AssemblyError('PROFILE_CONTAINS_CREDENTIAL', `${label} contains credential-like content`)
  }
  if (
    DEVELOPER_PATH_TEXT.some((pattern) => pattern.test(contents)) ||
    forbiddenVariants(forbiddenPaths).some((item) => contents.includes(item))
  ) {
    throw new AssemblyError('PROFILE_CONTAINS_PHYSICAL_PATH', `${label} contains an operator absolute path`)
  }
}

function assertNoSensitiveText(contents: string, context: ProfileContext, label: string): void {
  assertSafeGeneratedText(contents, [context.workRoot, context.dshHome, context.distributionDirectory], label)
}

function packageManagerEnvironment(workRoot: string, cacheKey: string): NodeJS.ProcessEnv {
  const inherited = { ...process.env }
  for (const key of Object.keys(inherited)) {
    if (CREDENTIAL_ENVIRONMENT_NAME.test(key)) delete inherited[key]
  }
  const cacheRoot = resolveHostContainedPath(workRoot, 'caches', 'profile-lifecycle', cacheKey)
  const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH'
  return {
    ...inherited,
    [pathKey]: `${path.dirname(process.execPath)}${path.delimiter}${process.env[pathKey] ?? ''}`,
    COREPACK_HOME: resolveHostContainedPath(cacheRoot, 'corepack'),
    GIT_TERMINAL_PROMPT: '0',
    npm_config_cache: resolveHostContainedPath(cacheRoot, 'npm'),
    npm_config_registry: 'https://registry.npmjs.org/',
    npm_config_userconfig: resolveHostContainedPath(cacheRoot, 'npmrc'),
    PNPM_HOME: resolveHostContainedPath(cacheRoot, 'pnpm-home'),
    XDG_CACHE_HOME: resolveHostContainedPath(cacheRoot, 'xdg-cache'),
    XDG_DATA_HOME: resolveHostContainedPath(cacheRoot, 'xdg-data'),
    XDG_STATE_HOME: resolveHostContainedPath(cacheRoot, 'xdg-state'),
  }
}

function pnpmConfigurationArguments(workRoot: string, cacheKey: string): readonly string[] {
  const cacheRoot = resolveHostContainedPath(workRoot, 'caches', 'profile-lifecycle', cacheKey)
  return [
    `--config.cache-dir=${resolveHostContainedPath(cacheRoot, 'pnpm-cache')}`,
    `--config.state-dir=${resolveHostContainedPath(cacheRoot, 'pnpm-state')}`,
    `--config.store-dir=${resolveHostContainedPath(cacheRoot, 'pnpm-store')}`,
  ]
}

function pnpmArguments(context: ProfileContext): readonly string[] {
  return [
    ...pnpmConfigurationArguments(context.workRoot, context.profileName),
    'install',
    '--frozen-lockfile',
    '--ignore-scripts',
    '--strict-peer-dependencies',
  ]
}

function packageManagerProcessEnvironment(
  packageManager: ProfilePackageManager,
  workRoot: string,
  cacheKey: string,
): NodeJS.ProcessEnv {
  return {
    ...packageManagerEnvironment(workRoot, cacheKey),
    ...((packageManager.argumentPrefix?.length ?? 0) === 0
      ? {}
      : { npm_execpath: packageManager.argumentPrefix?.[0] }),
  }
}

async function assertExactProfilePackageManager(
  packageManager: ProfilePackageManager,
  runProcess: ProcessRunner,
  cwd: string,
  environment: NodeJS.ProcessEnv,
  signal?: AbortSignal,
): Promise<void> {
  const versionResult = await runProcess({
    executable: packageManager.executable,
    arguments: [...(packageManager.argumentPrefix ?? []), '--version'],
    cwd,
    environment,
    signal,
  })
  if (versionResult.exitCode !== 0 || versionResult.stdoutTail.trim() !== PROFILE_PACKAGE_MANAGER_VERSION) {
    throw new AssemblyError('PROFILE_PACKAGE_MANAGER_MISMATCH', 'profile package-manager executable is not exact pnpm 11.19.0')
  }
}

async function copyDistributionPackages(context: ProfileContext): Promise<void> {
  for (const item of context.distribution.packages) {
    const source = resolveHostContainedPath(context.distributionDirectory, 'archives', ...item.path.split('/'))
    const target = resolveHostContainedPath(context.profileDirectory, '.recursus', 'packages', ...item.path.split('/'))
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(source, target)
  }
}

async function readOwnedMarker(context: ProfileContext): Promise<ProfileMarkerV1> {
  const markerPath = resolveHostContainedPath(context.profileDirectory, PROFILE_MARKER_FILENAME)
  let marker: unknown
  try {
    const markerInfo = await lstat(markerPath)
    if (!markerInfo.isFile() || markerInfo.isSymbolicLink()) throw new Error('marker is not a real file')
    marker = JSON.parse(await readFile(markerPath, 'utf8')) as unknown
  } catch (error) {
    throw new AssemblyError('PROFILE_NOT_RECURSUS_OWNED', 'profile has no valid Recursus ownership marker', { cause: error })
  }
  if (marker === null || typeof marker !== 'object' || Array.isArray(marker)) {
    throw new AssemblyError('PROFILE_NOT_RECURSUS_OWNED', 'profile ownership marker is invalid')
  }
  const item = marker as Record<string, unknown>
  if (
    Object.keys(item).sort().join('\0') !== [
      'assemblyId', 'credentialReferences', 'distributionSha256', 'lockfileSha256', 'packageCount', 'profileName',
      'schemaVersion',
    ].join('\0') ||
    item.schemaVersion !== 1 || item.profileName !== context.profileName ||
    typeof item.assemblyId !== 'string' || !PROFILE_NAME.test(item.assemblyId) ||
    typeof item.distributionSha256 !== 'string' || !SHA256.test(item.distributionSha256) ||
    typeof item.lockfileSha256 !== 'string' || !SHA256.test(item.lockfileSha256) ||
    !Number.isSafeInteger(item.packageCount) || (item.packageCount as number) < 1 ||
    !Array.isArray(item.credentialReferences) || item.credentialReferences.some(
      (reference) => typeof reference !== 'string' || !/^[A-Z][A-Z0-9_]*$/u.test(reference),
    ) || new Set(item.credentialReferences).size !== item.credentialReferences.length
  ) {
    throw new AssemblyError('PROFILE_NOT_RECURSUS_OWNED', 'profile ownership marker is invalid for the exact profile')
  }
  return item as unknown as ProfileMarkerV1
}

async function readCurrentMarker(context: ProfileContext): Promise<ProfileMarkerV1> {
  const marker = await readOwnedMarker(context)
  if (
    marker.assemblyId !== context.distribution.assemblyId ||
    marker.distributionSha256 !== context.distributionSha256 ||
    marker.lockfileSha256 !== context.distribution.profileLockSha256 ||
    marker.packageCount !== context.distribution.packages.length ||
    JSON.stringify(marker.credentialReferences) !== JSON.stringify(context.distribution.credentialReferences)
  ) {
    throw new AssemblyError('PROFILE_DISTRIBUTION_MISMATCH', 'profile belongs to a different locked Recursus distribution')
  }
  return marker
}

async function verifyInstalledPackage(context: ProfileContext, item: LockedDistributionPackageV1): Promise<void> {
  try {
    const packageDirectory = resolveHostContainedPath(context.profileDirectory, 'node_modules', ...item.packageName.split('/'))
    const packageRealPath = await realpath(packageDirectory)
    assertContainedRealPath(context.profileDirectory, packageRealPath, 'installed package')
    const metadata = JSON.parse(await readFile(resolveHostContainedPath(packageRealPath, 'package.json'), 'utf8')) as Record<string, unknown>
    if (metadata.name === item.packageName && metadata.version === item.packageVersion) return
  } catch (error) {
    if (error instanceof AssemblyError && error.code === 'PROFILE_BOUNDARY_ESCAPE') throw error
  }
  throw new AssemblyError('INSTALLED_PACKAGE_MISMATCH', 'installed package identity differs from the locked distribution')
}

async function readRealProfileFile(target: string, code: string, message: string): Promise<Buffer> {
  try {
    const info = await lstat(target)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('not a real file')
    return await readFile(target)
  } catch (error) {
    if (error instanceof AssemblyError) throw error
    throw new AssemblyError(code, message, { cause: error })
  }
}

function utf8(contents: Buffer, code: string, message: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(contents)
  } catch (error) {
    throw new AssemblyError(code, message, { cause: error })
  }
}

async function readManagedProfileText(target: string, relative: string): Promise<string> {
  const contents = await readRealProfileFile(
    target,
    'PROFILE_MANAGED_FILE_MISMATCH',
    `${relative} must be a real file`,
  )
  return utf8(contents, 'PROFILE_MANAGED_FILE_MISMATCH', `${relative} must be UTF-8`)
}

async function verifyProfile(context: ProfileContext): Promise<void> {
  const realProfile = await assertRealDirectory(context.profileDirectory, 'PROFILE_NOT_INSTALLED', 'profile directory')
  assertContainedRealPath(context.profilesRoot, realProfile, 'profile directory')
  const marker = await readCurrentMarker(context)
  for (const [relative, expected] of managedProfileFiles(context)) {
    const target = resolveHostContainedPath(realProfile, relative)
    const actual = await readManagedProfileText(target, relative)
    if (actual !== expected) throw new AssemblyError('PROFILE_MANAGED_FILE_MISMATCH', `${relative} differs from the locked profile`)
    assertNoSensitiveText(actual, context, relative)
  }
  const lockfilePath = resolveHostContainedPath(realProfile, 'pnpm-lock.yaml')
  const lockfileBytes = await readRealProfileFile(
    lockfilePath,
    'PROFILE_LOCKFILE_MISMATCH',
    'profile lockfile must be a real file',
  )
  const lockfile = utf8(lockfileBytes, 'PROFILE_LOCKFILE_MISMATCH', 'profile lockfile must be UTF-8')
  if (sha256(lockfileBytes) !== marker.lockfileSha256) {
    throw new AssemblyError('PROFILE_LOCKFILE_MISMATCH', 'profile lockfile differs from the ownership marker')
  }
  assertNoSensitiveText(lockfile, context, 'pnpm-lock.yaml')
  for (const item of context.distribution.packages) {
    const archive = resolveHostContainedPath(realProfile, '.recursus', 'packages', ...item.path.split('/'))
    const archiveBytes = await readRealProfileFile(
      archive,
      'PROFILE_ARCHIVE_MISMATCH',
      'profile archive must be a real file',
    )
    if (archiveBytes.byteLength !== item.bytes || sha256(archiveBytes) !== item.sha256) {
      throw new AssemblyError('PROFILE_ARCHIVE_MISMATCH', 'profile archive differs from the locked distribution')
    }
    await verifyInstalledPackage(context, item)
  }
}

async function writeAndInstallProfile(context: ProfileContext, options: ProfileLifecycleOptions): Promise<void> {
  await mkdir(context.profileDirectory)
  try {
    for (const [relative, contents] of managedProfileFiles(context)) {
      assertNoSensitiveText(contents, context, relative)
      await writeFile(resolveHostContainedPath(context.profileDirectory, relative), contents, { encoding: 'utf8', flag: 'wx' })
    }
    const distributionLockfile = await readFile(
      resolveHostContainedPath(context.distributionDirectory, 'pnpm-lock.yaml'),
      'utf8',
    )
    assertNoSensitiveText(distributionLockfile, context, 'pnpm-lock.yaml')
    await writeFile(resolveHostContainedPath(context.profileDirectory, 'pnpm-lock.yaml'), distributionLockfile, {
      encoding: 'utf8',
      flag: 'wx',
    })
    await copyDistributionPackages(context)
    const runner = options.runProcess ?? defaultProcessRunner
    const environment = packageManagerProcessEnvironment(options.packageManager, context.workRoot, context.profileName)
    await assertExactProfilePackageManager(
      options.packageManager,
      runner,
      context.profileDirectory,
      environment,
      options.signal,
    )
    const result = await runner({
      executable: options.packageManager.executable,
      arguments: [...(options.packageManager.argumentPrefix ?? []), ...pnpmArguments(context)],
      cwd: context.profileDirectory,
      environment,
      signal: options.signal,
    })
    if (result.exitCode !== 0) throw new AssemblyError('PROFILE_INSTALL_FAILED', 'locked profile package installation failed')
    const lockfile = await readFile(resolveHostContainedPath(context.profileDirectory, 'pnpm-lock.yaml'), 'utf8')
    assertNoSensitiveText(lockfile, context, 'pnpm-lock.yaml')
    if (sha256(lockfile) !== context.distribution.profileLockSha256) {
      throw new AssemblyError('PROFILE_LOCKFILE_MISMATCH', 'frozen install changed the locked distribution lockfile')
    }
    const marker: ProfileMarkerV1 = {
      schemaVersion: 1,
      profileName: context.profileName,
      assemblyId: context.distribution.assemblyId,
      distributionSha256: context.distributionSha256,
      lockfileSha256: context.distribution.profileLockSha256,
      packageCount: context.distribution.packages.length,
      credentialReferences: context.distribution.credentialReferences,
    }
    await writeFile(resolveHostContainedPath(context.profileDirectory, PROFILE_MARKER_FILENAME), json(marker), {
      encoding: 'utf8',
      flag: 'wx',
    })
    await verifyProfile(context)
  } catch (error) {
    if (await exists(context.profileDirectory)) await rm(context.profileDirectory, { recursive: true })
    throw error
  }
}

async function withProfileLock<T>(context: ProfileContext, operation: () => Promise<T>): Promise<T> {
  const lockPath = resolveHostContainedPath(context.profilesRoot, `.recursus-${context.profileName}.lock`)
  let handle
  try {
    handle = await open(lockPath, 'wx')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new AssemblyError('PROFILE_OPERATION_LOCKED', 'another operation holds the exact profile lock')
    }
    throw error
  }
  try {
    return await operation()
  } finally {
    await handle.close()
    await rm(lockPath)
  }
}

function evidence(
  context: ProfileContext,
  operation: ProfileLifecycleEvidence['operation'],
  status: ProfileLifecycleEvidence['status'],
  marker?: ProfileMarkerV1,
): ProfileLifecycleResult {
  return Object.freeze({
    profileDirectory: context.profileDirectory,
    evidence: Object.freeze({
      schemaVersion: 1,
      operation,
      profileName: context.profileName,
      assemblyId: marker?.assemblyId ?? context.distribution.assemblyId,
      packageCount: marker?.packageCount ?? context.distribution.packages.length,
      credentialReferences: marker?.credentialReferences ?? context.distribution.credentialReferences,
      status,
    }),
  })
}

/** Install an absent isolated profile, or prove an identical existing install unchanged. */
export async function installRecursusProfile(options: ProfileLifecycleOptions): Promise<ProfileLifecycleResult> {
  const context = await prepareProfileContext(options)
  return await withProfileLock(context, async () => {
    if (await exists(context.profileDirectory)) {
      await verifyProfile(context)
      return evidence(context, 'install', 'unchanged')
    }
    await writeAndInstallProfile(context, options)
    return evidence(context, 'install', 'installed')
  })
}

/** Replace only a Recursus-owned profile, rolling the prior install back on failure. */
export async function updateRecursusProfile(options: ProfileLifecycleOptions): Promise<ProfileLifecycleResult> {
  const context = await prepareProfileContext(options)
  return await withProfileLock(context, async () => {
    if (!(await exists(context.profileDirectory))) {
      await writeAndInstallProfile(context, options)
      return evidence(context, 'update', 'updated')
    }
    const realProfile = await assertRealDirectory(context.profileDirectory, 'PROFILE_NOT_INSTALLED', 'profile directory')
    assertContainedRealPath(context.profilesRoot, realProfile, 'profile directory')
    await readOwnedMarker(context)
    try {
      await verifyProfile(context)
      return evidence(context, 'update', 'unchanged')
    } catch (error) {
      if (!(error instanceof AssemblyError) || ![
        'PROFILE_DISTRIBUTION_MISMATCH',
        'PROFILE_MANAGED_FILE_MISMATCH',
        'PROFILE_LOCKFILE_MISMATCH',
        'PROFILE_ARCHIVE_MISMATCH',
        'INSTALLED_PACKAGE_MISMATCH',
        'PROFILE_CONTAINS_CREDENTIAL',
        'PROFILE_CONTAINS_PHYSICAL_PATH',
      ].includes(error.code)) throw error
    }
    const backup = resolveHostContainedPath(context.profilesRoot, `.${context.profileName}-backup-${randomUUID()}`)
    await rename(context.profileDirectory, backup)
    try {
      await writeAndInstallProfile(context, options)
      await rm(backup, { recursive: true })
      return evidence(context, 'update', 'updated')
    } catch (error) {
      if (await exists(context.profileDirectory)) await rm(context.profileDirectory, { recursive: true })
      await rename(backup, context.profileDirectory)
      throw error
    }
  })
}

/** Revalidate profile ownership, generated files, local archives, lockfile, and installed package identities. */
export async function verifyRecursusProfile(options: ProfileLifecycleOptions): Promise<ProfileLifecycleResult> {
  const context = await prepareProfileContext(options)
  return await withProfileLock(context, async () => {
    await verifyProfile(context)
    return evidence(context, 'verify', 'verified')
  })
}

/** Remove only the explicitly named, marker-owned profile after realpath containment checks. */
export async function removeRecursusProfile(options: ProfileLifecycleOptions): Promise<ProfileLifecycleResult> {
  const context = await prepareProfileContext(options)
  return await withProfileLock(context, async () => {
    const realProfile = await assertRealDirectory(context.profileDirectory, 'PROFILE_NOT_INSTALLED', 'profile directory')
    assertContainedRealPath(context.profilesRoot, realProfile, 'profile directory')
    const marker = await readOwnedMarker(context)
    await rm(realProfile, { recursive: true })
    return evidence(context, 'remove', 'removed', marker)
  })
}

export { validateLockedDistribution }
