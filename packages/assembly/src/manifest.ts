import { readFile } from 'node:fs/promises'
import { AssemblyError } from './errors.js'
import { assertPortableRelativePath } from './paths.js'
import type {
  AssemblyComponentV1,
  AssemblyManifestV1,
  CommandSpec,
  JsonValue,
} from './types.js'

type UnknownRecord = Record<string, unknown>

const IDENTIFIER = /^[a-z0-9][a-z0-9.-]*$/u
const REVISION = /^[0-9a-f]{40}$/u
const SHA256 = /^[0-9a-f]{64}$/u

function invalid(path: string, message: string): never {
  throw new AssemblyError('INVALID_ASSEMBLY_MANIFEST', `${path}: ${message}`)
}

function record(value: unknown, path: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return invalid(path, 'must be an object')
  }
  return value as UnknownRecord
}

function exactKeys(value: UnknownRecord, path: string, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional])
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) invalid(path, `contains unsupported field ${JSON.stringify(key)}`)
  }
  for (const key of required) {
    if (!(key in value)) invalid(path, `is missing field ${JSON.stringify(key)}`)
  }
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) return invalid(path, 'must be a non-empty string')
  return value
}

function literal<T extends string | number | boolean>(value: unknown, expected: T, path: string): T {
  if (value !== expected) invalid(path, `must equal ${JSON.stringify(expected)}`)
  return expected
}

function array(value: unknown, path: string, minimum = 0): unknown[] {
  if (!Array.isArray(value) || value.length < minimum) {
    return invalid(path, `must be an array with at least ${String(minimum)} item(s)`)
  }
  return value
}

function stringArray(value: unknown, path: string, minimum = 0): string[] {
  const values = array(value, path, minimum).map((item, index) => string(item, `${path}[${String(index)}]`))
  if (new Set(values).size !== values.length) invalid(path, 'must not contain duplicates')
  return values
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  const candidate = string(value, path)
  if (!allowed.includes(candidate as T)) invalid(path, `must be one of ${allowed.join(', ')}`)
  return candidate as T
}

function identifier(value: unknown, path: string): string {
  const candidate = string(value, path)
  if (!IDENTIFIER.test(candidate)) invalid(path, 'must be a lowercase identifier')
  return candidate
}

function revision(value: unknown, path: string): string {
  const candidate = string(value, path)
  if (!REVISION.test(candidate)) invalid(path, 'must be a lowercase 40-character Git commit')
  return candidate
}

function sha256(value: unknown, path: string): string {
  const candidate = string(value, path)
  if (!SHA256.test(candidate)) invalid(path, 'must be a lowercase SHA-256 digest')
  return candidate
}

function relativePath(value: unknown, path: string): string {
  try {
    return assertPortableRelativePath(string(value, path), path)
  } catch (error) {
    if (error instanceof AssemblyError) invalid(path, error.message)
    throw error
  }
}

function repository(value: unknown, path: string): string {
  const candidate = string(value, path)
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return invalid(path, 'must be an absolute URL')
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'github.com' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    !/^\/OpenCnid\/[A-Za-z0-9._-]+$/u.test(parsed.pathname)
  ) {
    invalid(path, 'must be a credential-free https://github.com/OpenCnid repository URL')
  }
  return candidate
}

function command(value: unknown, path: string): CommandSpec {
  const item = record(value, path)
  exactKeys(item, path, ['executable', 'arguments', 'cwd'], ['platforms', 'environment'])
  const argumentsList = array(item.arguments, `${path}.arguments`, 1).map((argument, index) => {
    if (typeof argument !== 'string') invalid(`${path}.arguments[${String(index)}]`, 'must be a string')
    return argument
  })
  const platforms = item.platforms === undefined ? undefined : stringArray(item.platforms, `${path}.platforms`, 1)
    .map((platform, index) => oneOf(platform, ['windows-x64', 'linux-x64'] as const, `${path}.platforms[${String(index)}]`))
  let environment: Readonly<Record<string, string>> | undefined
  if (item.environment !== undefined) {
    const rawEnvironment = record(item.environment, `${path}.environment`)
    const entries = Object.entries(rawEnvironment)
    if (entries.length === 0) invalid(`${path}.environment`, 'must not be empty')
    const validated: Record<string, string> = {}
    for (const [name, value] of entries) {
      if (!/^DSH_[A-Z0-9_]+$/u.test(name)) invalid(`${path}.environment.${name}`, 'must be a DSH-owned build setting')
      validated[name] = string(value, `${path}.environment.${name}`)
    }
    environment = validated
  }
  return {
    executable: string(item.executable, `${path}.executable`),
    arguments: argumentsList,
    cwd: literal(item.cwd, 'source', `${path}.cwd`),
    ...(platforms === undefined ? {} : { platforms }),
    ...(environment === undefined ? {} : { environment }),
  }
}

function commands(value: unknown, path: string): CommandSpec[] {
  return array(value, path, 1).map((item, index) => command(item, `${path}[${String(index)}]`))
}

function component(value: unknown, path: string): AssemblyComponentV1 {
  const item = record(value, path)
  exactKeys(item, path, [
    'name',
    'role',
    'repository',
    'revision',
    'version',
    'license',
    'acquisition',
    'toolchain',
    'lockfiles',
    'entrypoints',
    'pack',
    'profileContribution',
    'platforms',
    'compatibility',
  ])

  const license = record(item.license, `${path}.license`)
  exactKeys(license, `${path}.license`, ['declared', 'status', 'noticeFiles', 'redistribution'])
  const acquisition = record(item.acquisition, `${path}.acquisition`)
  exactKeys(acquisition, `${path}.acquisition`, ['method', 'readOnly', 'revisionKind'])
  const toolchain = record(item.toolchain, `${path}.toolchain`)
  exactKeys(toolchain, `${path}.toolchain`, ['node', 'packageManager', 'additional'])
  const packageManager = record(toolchain.packageManager, `${path}.toolchain.packageManager`)
  exactKeys(packageManager, `${path}.toolchain.packageManager`, ['name', 'version'])
  const packageManagerVersion = string(packageManager.version, `${path}.toolchain.packageManager.version`)
  if (!/^\d+\.\d+\.\d+$/u.test(packageManagerVersion)) {
    invalid(`${path}.toolchain.packageManager.version`, 'must be an exact semantic version')
  }
  const additional = array(toolchain.additional, `${path}.toolchain.additional`).map((entry, index) => {
    const toolPath = `${path}.toolchain.additional[${String(index)}]`
    const tool = record(entry, toolPath)
    exactKeys(tool, toolPath, ['name', 'version'])
    return { name: identifier(tool.name, `${toolPath}.name`), version: string(tool.version, `${toolPath}.version`) }
  })
  const lockfiles = array(item.lockfiles, `${path}.lockfiles`, 1).map((entry, index) => {
    const lockPath = `${path}.lockfiles[${String(index)}]`
    const lock = record(entry, lockPath)
    exactKeys(lock, lockPath, ['path', 'sha256'])
    return { path: relativePath(lock.path, `${lockPath}.path`), sha256: sha256(lock.sha256, `${lockPath}.sha256`) }
  })
  if (new Set(lockfiles.map((lock) => lock.path)).size !== lockfiles.length) {
    invalid(`${path}.lockfiles`, 'must not repeat a lockfile path')
  }

  const entrypoints = record(item.entrypoints, `${path}.entrypoints`)
  exactKeys(entrypoints, `${path}.entrypoints`, [
    'restoreDependencies',
    'verifySource',
    'build',
    'pack',
    'inspectPackage',
  ])
  const pack = record(item.pack, `${path}.pack`)
  exactKeys(pack, `${path}.pack`, ['outputRoot', 'selectors'], ['allowedMetadata'])
  const selectors = array(pack.selectors, `${path}.pack.selectors`, 1).map((entry, index) => {
    const selectorPath = `${path}.pack.selectors[${String(index)}]`
    const selector = record(entry, selectorPath)
    exactKeys(selector, selectorPath, ['glob', 'format', 'purpose'])
    return {
      glob: relativePath(selector.glob, `${selectorPath}.glob`),
      format: literal(selector.format, 'npm-tarball', `${selectorPath}.format`),
      purpose: oneOf(selector.purpose, ['runtime', 'dependency-closure'] as const, `${selectorPath}.purpose`),
    }
  })
  if (new Set(selectors.map((selector) => selector.glob)).size !== selectors.length) {
    invalid(`${path}.pack.selectors`, 'must not repeat an output selector')
  }
  const allowedMetadata = pack.allowedMetadata === undefined
    ? undefined
    : stringArray(pack.allowedMetadata, `${path}.pack.allowedMetadata`, 1).map((metadataPath, index) =>
      relativePath(metadataPath, `${path}.pack.allowedMetadata[${String(index)}]`),
    )

  const profile = record(item.profileContribution, `${path}.profileContribution`)
  exactKeys(profile, `${path}.profileContribution`, ['kind', 'packages', 'configPolicy'], ['patch'])
  const profileKind = oneOf(
    profile.kind,
    ['profile-foundation', 'bundle-patch', 'cordis-plugin'] as const,
    `${path}.profileContribution.kind`,
  )
  const profilePatch = profile.patch === undefined
    ? undefined
    : relativePath(profile.patch, `${path}.profileContribution.patch`)
  if (profileKind === 'bundle-patch' && profilePatch === undefined) {
    invalid(`${path}.profileContribution.patch`, 'is required for a bundle-patch contribution')
  }

  const platforms = record(item.platforms, `${path}.platforms`)
  exactKeys(platforms, `${path}.platforms`, ['supported', 'constraints'])
  const supported = stringArray(platforms.supported, `${path}.platforms.supported`, 1).map((platform, index) =>
    oneOf(platform, ['windows-x64', 'linux-x64'] as const, `${path}.platforms.supported[${String(index)}]`),
  )
  const compatibility = record(item.compatibility, `${path}.compatibility`)
  exactKeys(compatibility, `${path}.compatibility`, ['dshRevision', 'nestedPins', 'constraints'])
  const nestedPinsRecord = record(compatibility.nestedPins, `${path}.compatibility.nestedPins`)
  const nestedPins: Record<string, string> = {}
  for (const [key, nestedValue] of Object.entries(nestedPinsRecord)) {
    nestedPins[identifier(key, `${path}.compatibility.nestedPins key`)] = string(
      nestedValue,
      `${path}.compatibility.nestedPins.${key}`,
    )
  }

  return {
    name: identifier(item.name, `${path}.name`),
    role: identifier(item.role, `${path}.role`),
    repository: repository(item.repository, `${path}.repository`),
    revision: revision(item.revision, `${path}.revision`),
    version: string(item.version, `${path}.version`),
    license: {
      declared: string(license.declared, `${path}.license.declared`),
      status: oneOf(
        license.status,
        ['permissive', 'pending-owner-license', 'composite'] as const,
        `${path}.license.status`,
      ),
      noticeFiles: stringArray(license.noticeFiles, `${path}.license.noticeFiles`, 1).map((notice, index) =>
        relativePath(notice, `${path}.license.noticeFiles[${String(index)}]`),
      ),
      redistribution: oneOf(
        license.redistribution,
        ['allowed-with-notices', 'blocked-pending-owner-license', 'composite-review-required'] as const,
        `${path}.license.redistribution`,
      ),
    },
    acquisition: {
      method: literal(acquisition.method, 'git', `${path}.acquisition.method`),
      readOnly: literal(acquisition.readOnly, true, `${path}.acquisition.readOnly`),
      revisionKind: literal(acquisition.revisionKind, 'commit', `${path}.acquisition.revisionKind`),
    },
    toolchain: {
      node: string(toolchain.node, `${path}.toolchain.node`),
      packageManager: {
        name: literal(packageManager.name, 'pnpm', `${path}.toolchain.packageManager.name`),
        version: packageManagerVersion,
      },
      additional,
    },
    lockfiles,
    entrypoints: {
      restoreDependencies: commands(entrypoints.restoreDependencies, `${path}.entrypoints.restoreDependencies`),
      verifySource: commands(entrypoints.verifySource, `${path}.entrypoints.verifySource`),
      build: commands(entrypoints.build, `${path}.entrypoints.build`),
      pack: commands(entrypoints.pack, `${path}.entrypoints.pack`),
      inspectPackage: commands(entrypoints.inspectPackage, `${path}.entrypoints.inspectPackage`),
    },
    pack: {
      outputRoot: literal(pack.outputRoot, '{packageOutput}', `${path}.pack.outputRoot`),
      selectors,
      ...(allowedMetadata === undefined ? {} : { allowedMetadata }),
    },
    profileContribution: {
      kind: profileKind,
      packages: stringArray(profile.packages, `${path}.profileContribution.packages`, 1),
      ...(profilePatch === undefined ? {} : { patch: profilePatch }),
      configPolicy: oneOf(
        profile.configPolicy,
        ['package-defaults', 'host-credentials-required', 'profile-template'] as const,
        `${path}.profileContribution.configPolicy`,
      ),
    },
    platforms: {
      supported,
      constraints: stringArray(platforms.constraints, `${path}.platforms.constraints`),
    },
    compatibility: {
      dshRevision: revision(compatibility.dshRevision, `${path}.compatibility.dshRevision`),
      nestedPins,
      constraints: stringArray(compatibility.constraints, `${path}.compatibility.constraints`),
    },
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

/** Validate schema version 1 completely and reject unknown fields or versions. */
export function validateAssemblyManifest(value: unknown): AssemblyManifestV1 {
  const manifest = record(value, 'manifest')
  exactKeys(manifest, 'manifest', [
    '$schema',
    'schemaVersion',
    'assemblyId',
    'runtime',
    'baseline',
    'workRoot',
    'integrityOutput',
    'components',
  ])
  if (manifest.schemaVersion !== 1) {
    throw new AssemblyError('UNSUPPORTED_ASSEMBLY_SCHEMA', 'assembly schema version is unsupported')
  }
  const workRoot = record(manifest.workRoot, 'manifest.workRoot')
  exactKeys(workRoot, 'manifest.workRoot', ['operatorConfigured', 'paths'])
  const paths = record(workRoot.paths, 'manifest.workRoot.paths')
  exactKeys(paths, 'manifest.workRoot.paths', ['sources', 'caches', 'packages'])
  const resolvedPaths = {
    sources: relativePath(paths.sources, 'manifest.workRoot.paths.sources'),
    caches: relativePath(paths.caches, 'manifest.workRoot.paths.caches'),
    packages: relativePath(paths.packages, 'manifest.workRoot.paths.packages'),
  }
  if (new Set(Object.values(resolvedPaths)).size !== 3) {
    invalid('manifest.workRoot.paths', 'source, cache, and package roots must be distinct')
  }
  const integrityOutput = record(manifest.integrityOutput, 'manifest.integrityOutput')
  exactKeys(integrityOutput, 'manifest.integrityOutput', ['schema', 'path', 'deterministic'])
  const components = array(manifest.components, 'manifest.components', 1).map((entry, index) =>
    component(entry, `manifest.components[${String(index)}]`),
  )
  for (const key of ['name', 'role'] as const) {
    const values = components.map((entry) => entry[key])
    if (new Set(values).size !== values.length) invalid('manifest.components', `component ${key} values must be unique`)
  }
  const result: AssemblyManifestV1 = {
    $schema: literal(manifest.$schema, './assembly.schema.json', 'manifest.$schema'),
    schemaVersion: 1,
    assemblyId: identifier(manifest.assemblyId, 'manifest.assemblyId'),
    runtime: literal(manifest.runtime, 'recursus', 'manifest.runtime'),
    baseline: revision(manifest.baseline, 'manifest.baseline'),
    workRoot: {
      operatorConfigured: literal(workRoot.operatorConfigured, true, 'manifest.workRoot.operatorConfigured'),
      paths: resolvedPaths,
    },
    integrityOutput: {
      schema: relativePath(integrityOutput.schema, 'manifest.integrityOutput.schema'),
      path: relativePath(integrityOutput.path, 'manifest.integrityOutput.path'),
      deterministic: literal(integrityOutput.deterministic, true, 'manifest.integrityOutput.deterministic'),
    },
    components,
  }
  return deepFreeze(structuredClone(result)) as AssemblyManifestV1
}

/** Read and validate an assembly source lock. */
export async function loadAssemblyManifest(path: string): Promise<AssemblyManifestV1> {
  let parsed: JsonValue
  try {
    parsed = JSON.parse(await readFile(path, 'utf8')) as JsonValue
  } catch (error) {
    throw new AssemblyError('ASSEMBLY_MANIFEST_READ_FAILED', 'assembly manifest could not be read as JSON', { cause: error })
  }
  return validateAssemblyManifest(parsed)
}

/** Prove the extended source lock preserves every accepted component pin. */
export function assertComponentLockMatches(manifest: AssemblyManifestV1, lockValue: unknown): void {
  const lock = record(lockValue, 'component lock')
  const lockedComponents = array(lock.components, 'component lock.components', 1)
  const expected = new Map(lockedComponents.map((entry, index) => {
    const itemPath = `component lock.components[${String(index)}]`
    const item = record(entry, itemPath)
    return [string(item.name, `${itemPath}.name`), item] as const
  }))
  if (expected.size !== manifest.components.length) {
    throw new AssemblyError('COMPONENT_LOCK_MISMATCH', 'assembly and accepted component counts differ')
  }
  for (const componentEntry of manifest.components) {
    const locked = expected.get(componentEntry.name)
    if (locked === undefined) {
      throw new AssemblyError('COMPONENT_LOCK_MISMATCH', `accepted component lock has no ${componentEntry.name}`)
    }
    for (const key of ['role', 'repository', 'revision', 'version'] as const) {
      if (locked[key] !== componentEntry[key]) {
        throw new AssemblyError(
          'COMPONENT_LOCK_MISMATCH',
          `${componentEntry.name} ${key} differs from the accepted component lock`,
        )
      }
    }
    if (locked.license !== componentEntry.license.declared) {
      throw new AssemblyError(
        'COMPONENT_LOCK_MISMATCH',
        `${componentEntry.name} license status differs from the accepted component lock`,
      )
    }
  }
}
