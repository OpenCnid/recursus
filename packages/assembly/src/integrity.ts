import { AssemblyError } from './errors.js'
import { assertPortableRelativePath } from './paths.js'
import type { AssemblyManifestV1 } from './types.js'
import type { ComponentPackageEvidence } from './command-adapter.js'

export interface PackageIntegrityEntryV1 {
  readonly component: string
  readonly path: string
  readonly sha256: string
  readonly bytes: number
}

export interface PackageIntegrityV1 {
  readonly $schema: './package-integrity.schema.json'
  readonly schemaVersion: 1
  readonly assemblyId: string
  readonly algorithm: 'sha256'
  readonly packages: readonly PackageIntegrityEntryV1[]
}

const IDENTIFIER = /^[a-z0-9][a-z0-9.-]*$/u
const SHA256 = /^[0-9a-f]{64}$/u

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

/** Validate generated integrity output and its deterministic sort order. */
export function validatePackageIntegrity(value: unknown): PackageIntegrityV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AssemblyError('INVALID_PACKAGE_INTEGRITY', 'package integrity output must be an object')
  }
  const document = value as Record<string, unknown>
  const expectedKeys = ['$schema', 'schemaVersion', 'assemblyId', 'algorithm', 'packages']
  if (Object.keys(document).sort().join('\0') !== [...expectedKeys].sort().join('\0')) {
    throw new AssemblyError('INVALID_PACKAGE_INTEGRITY', 'package integrity fields differ from schema version 1')
  }
  if (
    document.$schema !== './package-integrity.schema.json' ||
    document.schemaVersion !== 1 ||
    document.algorithm !== 'sha256' ||
    typeof document.assemblyId !== 'string' ||
    !IDENTIFIER.test(document.assemblyId) ||
    !Array.isArray(document.packages)
  ) {
    throw new AssemblyError('INVALID_PACKAGE_INTEGRITY', 'package integrity header is invalid')
  }
  let previous = ''
  const packages = document.packages.map((value, index): PackageIntegrityEntryV1 => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new AssemblyError('INVALID_PACKAGE_INTEGRITY', `packages[${String(index)}] must be an object`)
    }
    const item = value as Record<string, unknown>
    if (Object.keys(item).sort().join('\0') !== ['bytes', 'component', 'path', 'sha256'].join('\0')) {
      throw new AssemblyError('INVALID_PACKAGE_INTEGRITY', `packages[${String(index)}] fields are invalid`)
    }
    if (typeof item.component !== 'string' || !IDENTIFIER.test(item.component)) {
      throw new AssemblyError('INVALID_PACKAGE_INTEGRITY', `packages[${String(index)}].component is invalid`)
    }
    if (typeof item.path !== 'string') {
      throw new AssemblyError('INVALID_PACKAGE_INTEGRITY', `packages[${String(index)}].path is invalid`)
    }
    assertPortableRelativePath(item.path, `packages[${String(index)}].path`)
    if (typeof item.sha256 !== 'string' || !SHA256.test(item.sha256)) {
      throw new AssemblyError('INVALID_PACKAGE_INTEGRITY', `packages[${String(index)}].sha256 is invalid`)
    }
    if (!Number.isSafeInteger(item.bytes) || (item.bytes as number) < 1) {
      throw new AssemblyError('INVALID_PACKAGE_INTEGRITY', `packages[${String(index)}].bytes is invalid`)
    }
    const orderKey = `${item.component}\0${item.path}`
    if (orderKey <= previous) {
      throw new AssemblyError('NONDETERMINISTIC_PACKAGE_INTEGRITY', 'package integrity entries must be unique and sorted')
    }
    previous = orderKey
    return {
      component: item.component,
      path: item.path,
      sha256: item.sha256,
      bytes: item.bytes as number,
    }
  })
  return Object.freeze({
    $schema: './package-integrity.schema.json',
    schemaVersion: 1,
    assemblyId: document.assemblyId,
    algorithm: 'sha256',
    packages: Object.freeze(packages),
  })
}

/** Serialize already-validated output without timestamps or host paths. */
export function serializePackageIntegrity(value: PackageIntegrityV1): string {
  const sorted: PackageIntegrityV1 = {
    ...value,
    packages: [...value.packages].sort((left, right) =>
      compareCodeUnits(`${left.component}\0${left.path}`, `${right.component}\0${right.path}`),
    ),
  }
  return `${JSON.stringify(validatePackageIntegrity(sorted), null, 2)}\n`
}

/** Build deterministic integrity output from packages that passed inspection. */
export function createPackageIntegrity(
  manifest: AssemblyManifestV1,
  packagesByComponent: ReadonlyMap<string, readonly ComponentPackageEvidence[]>,
): PackageIntegrityV1 {
  const entries: PackageIntegrityEntryV1[] = []
  for (const component of manifest.components) {
    const packages = packagesByComponent.get(component.name)
    if (packages === undefined || packages.length === 0) {
      throw new AssemblyError('COMPONENT_PACKAGES_MISSING', `${component.name} has no inspected packages`)
    }
    for (const item of packages) {
      entries.push({
        component: component.name,
        path: `${component.name}/${assertPortableRelativePath(item.relativePath, 'accepted package path')}`,
        sha256: item.sha256,
        bytes: item.bytes,
      })
    }
  }
  entries.sort((left, right) => compareCodeUnits(`${left.component}\0${left.path}`, `${right.component}\0${right.path}`))
  return validatePackageIntegrity({
    $schema: './package-integrity.schema.json',
    schemaVersion: 1,
    assemblyId: manifest.assemblyId,
    algorithm: 'sha256',
    packages: entries,
  })
}
