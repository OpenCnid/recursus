/** JSON values allowed in content-bounded lifecycle evidence. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { readonly [key: string]: JsonValue }

/** One executable invocation owned by a pinned component. */
export interface CommandSpec {
  readonly executable: string
  readonly arguments: readonly string[]
  readonly cwd: 'source'
  readonly platforms?: readonly ('windows-x64' | 'linux-x64')[]
  readonly environment?: Readonly<Record<string, string>>
}

/** License and redistribution facts reviewed at the component revision. */
export interface ComponentLicense {
  readonly declared: string
  readonly status: 'permissive' | 'pending-owner-license' | 'composite'
  readonly noticeFiles: readonly string[]
  readonly redistribution:
    | 'allowed-with-notices'
    | 'blocked-pending-owner-license'
    | 'composite-review-required'
}

/** Required package manager and additional build tools. */
export interface ComponentToolchain {
  readonly node: string
  readonly packageManager: {
    readonly name: 'pnpm'
    readonly version: string
  }
  readonly additional: readonly {
    readonly name: string
    readonly version: string
  }[]
}

/** Immutable lockfile digest at the pinned source revision. */
export interface ComponentLockfile {
  readonly path: string
  readonly sha256: string
}

/** Component-owned commands for lifecycle phases after exact acquisition. */
export interface ComponentEntrypoints {
  readonly restoreDependencies: readonly CommandSpec[]
  readonly verifySource: readonly CommandSpec[]
  readonly build: readonly CommandSpec[]
  readonly pack: readonly CommandSpec[]
  readonly inspectPackage: readonly CommandSpec[]
}

/** Package output selected for hashing and inspection. */
export interface PackageSelector {
  readonly glob: string
  readonly format: 'npm-tarball'
  readonly purpose: 'runtime' | 'dependency-closure'
}

/** Public DSH profile contribution made by a component package. */
export interface ProfileContribution {
  readonly kind: 'profile-foundation' | 'bundle-patch' | 'cordis-plugin'
  readonly packages: readonly string[]
  readonly patch?: string
  readonly configPolicy: 'package-defaults' | 'host-credentials-required' | 'profile-template'
}

/** One exact component entry in assembly schema version 1. */
export interface AssemblyComponentV1 {
  readonly name: string
  readonly role: string
  readonly repository: string
  readonly revision: string
  readonly version: string
  readonly license: ComponentLicense
  readonly acquisition: {
    readonly method: 'git'
    readonly readOnly: true
    readonly revisionKind: 'commit'
  }
  readonly toolchain: ComponentToolchain
  readonly lockfiles: readonly ComponentLockfile[]
  readonly entrypoints: ComponentEntrypoints
  readonly pack: {
    readonly outputRoot: '{packageOutput}'
    readonly selectors: readonly PackageSelector[]
    readonly allowedMetadata?: readonly string[]
  }
  readonly profileContribution: ProfileContribution
  readonly platforms: {
    readonly supported: readonly ('windows-x64' | 'linux-x64')[]
    readonly constraints: readonly string[]
  }
  readonly compatibility: {
    readonly dshRevision: string
    readonly nestedPins: Readonly<Record<string, string>>
    readonly constraints: readonly string[]
  }
}

/** Human-reviewable source lock for one Recursus assembly. */
export interface AssemblyManifestV1 {
  readonly $schema: './assembly.schema.json'
  readonly schemaVersion: 1
  readonly assemblyId: string
  readonly runtime: 'recursus'
  readonly baseline: string
  readonly workRoot: {
    readonly operatorConfigured: true
    readonly paths: {
      readonly sources: string
      readonly caches: string
      readonly packages: string
    }
  }
  readonly integrityOutput: {
    readonly schema: string
    readonly path: string
    readonly deterministic: true
  }
  readonly components: readonly AssemblyComponentV1[]
}

/** Ordered lifecycle phases shared by every component adapter. */
export const ASSEMBLY_LIFECYCLE_STEPS = [
  'inspect',
  'acquire',
  'verifyRevision',
  'restoreDependencies',
  'verifySource',
  'build',
  'pack',
  'inspectPackage',
] as const

export type AssemblyLifecycleStep = (typeof ASSEMBLY_LIFECYCLE_STEPS)[number]

/** Inputs available to every provider-neutral component adapter phase. */
export interface AdapterContext {
  readonly component: AssemblyComponentV1
  readonly workRoot: string
  readonly signal?: AbortSignal
}

/** Content-bounded result safe to retain as lifecycle evidence. */
export interface AdapterStepResult {
  readonly status: 'passed'
  readonly evidence: Readonly<Record<string, JsonValue>>
}

/** Common adapter lifecycle. Implementations may not omit or reorder phases. */
export interface ComponentAdapter {
  inspect(context: AdapterContext): Promise<AdapterStepResult>
  acquire(context: AdapterContext): Promise<AdapterStepResult>
  verifyRevision(context: AdapterContext): Promise<AdapterStepResult>
  restoreDependencies(context: AdapterContext): Promise<AdapterStepResult>
  verifySource(context: AdapterContext): Promise<AdapterStepResult>
  build(context: AdapterContext): Promise<AdapterStepResult>
  pack(context: AdapterContext): Promise<AdapterStepResult>
  inspectPackage(context: AdapterContext): Promise<AdapterStepResult>
}

/** One lifecycle result annotated by the runner rather than the adapter. */
export interface LifecycleResult extends AdapterStepResult {
  readonly component: string
  readonly step: AssemblyLifecycleStep
}
