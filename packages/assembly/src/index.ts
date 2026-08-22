export { AssemblyError } from './errors.js'
export { createComponentCommandAdapter, defaultProcessRunner, inspectComponentPackageDirectory } from './command-adapter.js'
export type {
  ComponentCommandAdapterOptions,
  ComponentPackageEvidence,
  ProcessInvocation,
  ProcessResult,
  ProcessRunner,
} from './command-adapter.js'
export { acquireGitComponent, acquisitionEvidenceJson, verifyGitRevision } from './git-acquisition.js'
export type {
  GitAcquisitionEvidence,
  GitAcquisitionOptions,
  GitAcquisitionResult,
  GitCommandResult,
  GitCommandRunner,
} from './git-acquisition.js'
export { createPackageIntegrity, serializePackageIntegrity, validatePackageIntegrity } from './integrity.js'
export type { PackageIntegrityEntryV1, PackageIntegrityV1 } from './integrity.js'
export { assertAdapterContract, runAdapterLifecycle } from './lifecycle.js'
export { inspectNpmPackage } from './package-inspection.js'
export type {
  InspectedPackage,
  InspectedPackageEntry,
  PackageInspectionOptions,
} from './package-inspection.js'
export { assertComponentLockMatches, loadAssemblyManifest, validateAssemblyManifest } from './manifest.js'
export { assertPortableRelativePath, resolveContainedPath, resolveHostContainedPath } from './paths.js'
export {
  buildLockedDistribution,
  installRecursusProfile,
  removeRecursusProfile,
  resolveRecursusProfilePath,
  updateRecursusProfile,
  validateLockedDistribution,
  verifyRecursusProfile,
} from './profile-lifecycle.js'
export type {
  BuildLockedDistributionOptions,
  LockedDistributionComponentV1,
  LockedDistributionPackageV1,
  LockedDistributionResult,
  LockedDistributionV1,
  ProfileLifecycleEvidence,
  ProfileLifecycleOptions,
  ProfileLifecycleResult,
  ProfilePackageManager,
} from './profile-lifecycle.js'
export * from './types.js'
