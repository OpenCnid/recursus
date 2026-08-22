import { execFile } from 'node:child_process'
import { lstat, mkdir, realpath, rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { AssemblyError } from './errors.js'
import { assertPortableRelativePath, resolveHostContainedPath } from './paths.js'
import type { AssemblyComponentV1, JsonValue } from './types.js'

const execFileAsync = promisify(execFile)
const REVISION = /^[0-9a-f]{40}$/u

export interface GitCommandResult {
  readonly stdout: string
  readonly stderr: string
}

/** Injectable command seam used for deterministic acquisition failure tests. */
export type GitCommandRunner = (
  argumentsList: readonly string[],
  cwd: string,
  signal?: AbortSignal,
) => Promise<GitCommandResult>

export interface GitAcquisitionOptions {
  readonly component: AssemblyComponentV1
  readonly workRoot: string
  readonly sourcesDirectory?: string
  readonly signal?: AbortSignal
  readonly runGit?: GitCommandRunner
}

export interface GitAcquisitionEvidence {
  readonly method: 'git'
  readonly repository: string
  readonly revision: string
  readonly relativeSourcePath: string
  readonly reused: boolean
}

/** Process-local checkout location plus safe, path-free evidence. */
export interface GitAcquisitionResult {
  readonly sourceDirectory: string
  readonly evidence: GitAcquisitionEvidence
}

const defaultGitRunner: GitCommandRunner = async (argumentsList, cwd, signal) => {
  const operation = argumentsList.find((argument) => !argument.startsWith('-')) ?? 'command'
  try {
    const result = await execFileAsync('git', ['-c', 'core.longpaths=true', ...argumentsList], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      maxBuffer: 4 * 1024 * 1024,
      signal,
      windowsHide: true,
    })
    return { stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    throw new AssemblyError('GIT_COMMAND_FAILED', `Git ${operation} failed during component acquisition`, { cause: error })
  }
}

async function pathInfo(target: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function prepareSourcesRoot(workRoot: string, relativeSources: string): Promise<{
  readonly realWorkRoot: string
  readonly realSourcesRoot: string
}> {
  if (!path.isAbsolute(workRoot)) {
    throw new AssemblyError('WORK_ROOT_NOT_ABSOLUTE', 'the Recursus work root must be absolute')
  }
  await mkdir(workRoot, { recursive: true })
  const realWorkRoot = await realpath(workRoot)
  const components = assertPortableRelativePath(relativeSources, 'sourcesDirectory').split('/')
  const sourcesRoot = resolveHostContainedPath(realWorkRoot, ...components)
  const before = await pathInfo(sourcesRoot)
  if (before?.isSymbolicLink() === true || (before !== undefined && !before.isDirectory())) {
    throw new AssemblyError('UNSAFE_WORK_ROOT', 'the managed sources path must be a real directory')
  }
  await mkdir(sourcesRoot, { recursive: true })
  const realSourcesRoot = await realpath(sourcesRoot)
  resolveHostContainedPath(realWorkRoot, path.relative(realWorkRoot, realSourcesRoot))
  return { realWorkRoot, realSourcesRoot }
}

function assertComponentInput(component: AssemblyComponentV1): void {
  if (!/^[a-z0-9][a-z0-9.-]*$/u.test(component.name)) {
    throw new AssemblyError('INVALID_COMPONENT', 'component name cannot form a managed work path')
  }
  if (!REVISION.test(component.revision)) {
    throw new AssemblyError('INVALID_COMPONENT_REVISION', 'component revision must be an immutable lowercase commit')
  }
  let parsed: URL
  try {
    parsed = new URL(component.repository)
  } catch {
    throw new AssemblyError('INVALID_COMPONENT_REPOSITORY', 'component repository URL is invalid')
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'github.com' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new AssemblyError('INVALID_COMPONENT_REPOSITORY', 'component repository must be credential-free GitHub HTTPS')
  }
}

async function assertManagedCheckout(target: string, sourcesRoot: string): Promise<void> {
  const info = await pathInfo(target)
  if (info === undefined || info.isSymbolicLink() || !info.isDirectory()) {
    throw new AssemblyError('UNSAFE_COMPONENT_CHECKOUT', 'component checkout must be a real directory')
  }
  const resolvedTarget = await realpath(target)
  const relative = path.relative(sourcesRoot, resolvedTarget)
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new AssemblyError('WORK_PATH_ESCAPE', 'component checkout resolves outside the managed sources root')
  }
}

/** Verify origin, cleanliness, and exact immutable revision without changing the checkout. */
export async function verifyGitRevision(options: GitAcquisitionOptions): Promise<GitAcquisitionEvidence> {
  assertComponentInput(options.component)
  const sourcesDirectory = options.sourcesDirectory ?? 'sources'
  const { realSourcesRoot } = await prepareSourcesRoot(options.workRoot, sourcesDirectory)
  const target = resolveHostContainedPath(realSourcesRoot, options.component.name)
  await assertManagedCheckout(target, realSourcesRoot)
  const runGit = options.runGit ?? defaultGitRunner
  const origin = (await runGit(['remote', 'get-url', 'origin'], target, options.signal)).stdout.trim()
  if (origin !== options.component.repository) {
    throw new AssemblyError('COMPONENT_ORIGIN_MISMATCH', `${options.component.name} origin differs from the source lock`)
  }
  const status = (await runGit(['status', '--porcelain=v1', '--untracked-files=all'], target, options.signal)).stdout.trim()
  if (status !== '') {
    throw new AssemblyError('COMPONENT_CHECKOUT_DIRTY', `${options.component.name} checkout has local changes`)
  }
  const actual = (await runGit(['rev-parse', '--verify', 'HEAD^{commit}'], target, options.signal)).stdout.trim()
  if (actual !== options.component.revision) {
    throw new AssemblyError(
      'COMPONENT_REVISION_MISMATCH',
      `${options.component.name} resolved ${actual || 'no commit'} instead of ${options.component.revision}`,
    )
  }
  return Object.freeze({
    method: 'git',
    repository: options.component.repository,
    revision: actual,
    relativeSourcePath: `${sourcesDirectory}/${options.component.name}`,
    reused: true,
  })
}

/**
 * Acquire one exact commit beneath the configured work root. Existing content
 * is reused only when origin, cleanliness, and revision already match. A new
 * partial checkout is removed if acquisition fails.
 */
export async function acquireGitComponent(options: GitAcquisitionOptions): Promise<GitAcquisitionResult> {
  assertComponentInput(options.component)
  if (options.signal?.aborted === true) throw new AssemblyError('ASSEMBLY_ABORTED', 'component acquisition was cancelled')
  const sourcesDirectory = options.sourcesDirectory ?? 'sources'
  const { realSourcesRoot } = await prepareSourcesRoot(options.workRoot, sourcesDirectory)
  const target = resolveHostContainedPath(realSourcesRoot, options.component.name)
  const existing = await pathInfo(target)
  if (existing !== undefined) {
    const evidence = await verifyGitRevision(options)
    return Object.freeze({ sourceDirectory: target, evidence })
  }

  const runGit = options.runGit ?? defaultGitRunner
  let created = false
  try {
    await runGit(['init', '--quiet', options.component.name], realSourcesRoot, options.signal)
    created = true
    await assertManagedCheckout(target, realSourcesRoot)
    await runGit(['remote', 'add', 'origin', options.component.repository], target, options.signal)
    await runGit(
      ['fetch', '--quiet', '--no-tags', '--depth=1', 'origin', options.component.revision],
      target,
      options.signal,
    )
    await runGit(
      ['-c', 'advice.detachedHead=false', 'checkout', '--quiet', '--detach', options.component.revision],
      target,
      options.signal,
    )
    const verified = await verifyGitRevision(options)
    return Object.freeze({
      sourceDirectory: target,
      evidence: Object.freeze({ ...verified, reused: false }),
    })
  } catch (error) {
    if (created) await rm(target, { recursive: true, force: true })
    throw error
  }
}

/** Convert acquisition evidence to JSON without carrying its absolute checkout path. */
export function acquisitionEvidenceJson(evidence: GitAcquisitionEvidence): Readonly<Record<string, JsonValue>> {
  return Object.freeze({ ...evidence })
}
