import path, { type PlatformPath } from 'node:path'
import { AssemblyError } from './errors.js'

/** Reject an absolute, empty, backslash-bearing, or traversing manifest path. */
export function assertPortableRelativePath(value: string, label = 'path'): string {
  if (value.length === 0 || value.includes('\\') || value.startsWith('/')) {
    throw new AssemblyError('INVALID_RELATIVE_PATH', `${label} must be a non-empty portable relative path`)
  }
  const parts = value.split('/')
  if (parts.some((part) => part.length === 0 || part === '.' || part === '..')) {
    throw new AssemblyError('INVALID_RELATIVE_PATH', `${label} contains an empty or traversing path component`)
  }
  if (/^[A-Za-z]:/u.test(parts[0] ?? '')) {
    throw new AssemblyError('INVALID_RELATIVE_PATH', `${label} must not contain a Windows drive prefix`)
  }
  return value
}

/**
 * Resolve child components beneath a root using the selected platform's path
 * rules. Containment is decided by parsed path components, never a string
 * prefix, so sibling names such as `profile-other` cannot pass for `profile`.
 */
export function resolveContainedPath(
  pathApi: PlatformPath,
  root: string,
  ...components: readonly string[]
): string {
  if (!pathApi.isAbsolute(root)) {
    throw new AssemblyError('WORK_ROOT_NOT_ABSOLUTE', 'the Recursus work root must be absolute')
  }
  if (components.length === 0 || components.some((component) => component.length === 0)) {
    throw new AssemblyError('INVALID_WORK_PATH', 'a managed work path requires non-empty components')
  }
  const resolvedRoot = pathApi.resolve(root)
  const target = pathApi.resolve(resolvedRoot, ...components)
  const relative = pathApi.relative(resolvedRoot, target)
  if (
    relative.length === 0 ||
    relative === '..' ||
    relative.startsWith(`..${pathApi.sep}`) ||
    pathApi.isAbsolute(relative)
  ) {
    throw new AssemblyError('WORK_PATH_ESCAPE', 'the managed path escapes or aliases the Recursus work root')
  }
  return target
}

/** Resolve a managed path using the current host path rules. */
export function resolveHostContainedPath(root: string, ...components: readonly string[]): string {
  return resolveContainedPath(path, root, ...components)
}
