import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { AssemblyError } from './errors.js'
import { acquireGitComponent, acquisitionEvidenceJson, verifyGitRevision } from './git-acquisition.js'
import { inspectNpmPackage, type InspectedPackage } from './package-inspection.js'
import { assertPortableRelativePath, resolveHostContainedPath } from './paths.js'
import type {
  AdapterContext,
  AdapterStepResult,
  AssemblyComponentV1,
  CommandSpec,
  ComponentAdapter,
  JsonValue,
  PackageSelector,
} from './types.js'

const OUTPUT_TAIL_BYTES = 64 * 1024

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export interface ProcessInvocation {
  readonly executable: string
  readonly arguments: readonly string[]
  readonly cwd: string
  readonly environment: NodeJS.ProcessEnv
  readonly signal?: AbortSignal
}

export interface ProcessResult {
  readonly exitCode: number
  readonly stdoutBytes: number
  readonly stderrBytes: number
  readonly stdoutTail: string
  readonly stderrTail: string
}

export type ProcessRunner = (invocation: ProcessInvocation) => Promise<ProcessResult>

export interface ComponentCommandAdapterOptions {
  readonly bootstrapPnpmModule: string
  readonly packageManagerExecutable?: string
  readonly runProcess?: ProcessRunner
}

interface AdapterState {
  packageManager?: LockedPackageManager
  sourceDirectory?: string
  packageDirectory?: string
  packages?: readonly ComponentPackageEvidence[]
}

interface LockedPackageManager {
  readonly executable: string
  readonly argumentPrefix: readonly string[]
  readonly versionCwd: string
}

export interface ComponentPackageEvidence {
  readonly relativePath: string
  readonly packageName: string
  readonly packageVersion: string
  readonly sha256: string
  readonly bytes: number
  readonly contentsSha256: string
  readonly entryCount: number
  readonly notices: readonly string[]
}

function appendTail(current: Buffer, chunk: Buffer): Buffer {
  const combined = Buffer.concat([current, chunk])
  return combined.byteLength <= OUTPUT_TAIL_BYTES ? combined : combined.subarray(combined.byteLength - OUTPUT_TAIL_BYTES)
}

export const defaultProcessRunner: ProcessRunner = async (invocation) => await new Promise((resolve, reject) => {
  const child = spawn(invocation.executable, [...invocation.arguments], {
    cwd: invocation.cwd,
    env: invocation.environment,
    signal: invocation.signal,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdoutBytes = 0
  let stderrBytes = 0
  let stdoutTail: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  let stderrTail: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  child.stdout.on('data', (value: Buffer) => {
    stdoutBytes += value.byteLength
    stdoutTail = appendTail(stdoutTail, value)
  })
  child.stderr.on('data', (value: Buffer) => {
    stderrBytes += value.byteLength
    stderrTail = appendTail(stderrTail, value)
  })
  child.once('error', reject)
  child.once('close', (code) => resolve({
    exitCode: code ?? -1,
    stdoutBytes,
    stderrBytes,
    stdoutTail: stdoutTail.toString('utf8'),
    stderrTail: stderrTail.toString('utf8'),
  }))
})

async function assertRealDirectory(directory: string, label: string): Promise<string> {
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new AssemblyError('UNSAFE_WORK_ROOT', `${label} must be a real directory`)
  return await realpath(directory)
}

async function prepareManagedDirectory(workRoot: string, relative: string, component: string): Promise<string> {
  if (!path.isAbsolute(workRoot)) throw new AssemblyError('WORK_ROOT_NOT_ABSOLUTE', 'the Recursus work root must be absolute')
  const relativeParts = assertPortableRelativePath(relative, 'managed work directory').split('/')
  await mkdir(workRoot, { recursive: true })
  const realWorkRoot = await assertRealDirectory(workRoot, 'work root')
  const parent = resolveHostContainedPath(realWorkRoot, ...relativeParts)
  await mkdir(parent, { recursive: true })
  const realParent = await assertRealDirectory(parent, 'managed work directory')
  const target = resolveHostContainedPath(realParent, component)
  await mkdir(target, { recursive: true })
  return await assertRealDirectory(target, 'component work directory')
}

function componentEnvironment(workRoot: string, component: AssemblyComponentV1): NodeJS.ProcessEnv {
  const cachesRoot = resolveHostContainedPath(workRoot, 'caches', component.name)
  const toolBin = resolveHostContainedPath(cachesRoot, 'pnpm-executable', 'node_modules', '@pnpm', 'exe')
  const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH'
  const inherited = { ...process.env }
  for (const key of Object.keys(inherited)) {
    if (/(?:TOKEN|SECRET|PASSWORD|API_KEY|AUTHORIZATION)/iu.test(key)) delete inherited[key]
  }
  return {
    ...inherited,
    [pathKey]: `${toolBin}${path.delimiter}${path.dirname(process.execPath)}${path.delimiter}${process.env[pathKey] ?? ''}`,
    COREPACK_HOME: resolveHostContainedPath(cachesRoot, 'corepack'),
    GIT_TERMINAL_PROMPT: '0',
    npm_config_cache: resolveHostContainedPath(cachesRoot, 'npm'),
    npm_config_registry: 'https://registry.npmjs.org/',
    npm_config_userconfig: resolveHostContainedPath(cachesRoot, 'npmrc'),
    PNPM_HOME: resolveHostContainedPath(cachesRoot, 'pnpm-home'),
    PIP_CACHE_DIR: resolveHostContainedPath(cachesRoot, 'pip'),
    UV_CACHE_DIR: resolveHostContainedPath(cachesRoot, 'uv'),
    UV_PYTHON_INSTALL_DIR: resolveHostContainedPath(cachesRoot, 'python'),
    XDG_CACHE_HOME: resolveHostContainedPath(cachesRoot, 'xdg-cache'),
    XDG_DATA_HOME: resolveHostContainedPath(cachesRoot, 'xdg-data'),
    XDG_STATE_HOME: resolveHostContainedPath(cachesRoot, 'xdg-state'),
  }
}

function pnpmConfigurationArguments(component: AssemblyComponentV1, workRoot: string): readonly string[] {
  const componentCache = resolveHostContainedPath(workRoot, 'caches', component.name, 'pnpm-cache')
  const componentState = resolveHostContainedPath(workRoot, 'caches', component.name, 'pnpm-state')
  const componentStore = resolveHostContainedPath(workRoot, 'caches', component.name, 'pnpm-store')
  return [
    `--config.cache-dir=${componentCache}`,
    `--config.state-dir=${componentState}`,
    `--config.store-dir=${componentStore}`,
  ]
}

function bootstrapArguments(workRoot: string, bootstrapPnpmModule: string): readonly string[] {
  const bootstrapStore = resolveHostContainedPath(workRoot, 'caches', 'pnpm-bootstrap')
  const bootstrapCache = resolveHostContainedPath(workRoot, 'caches', 'pnpm-bootstrap-cache')
  const bootstrapState = resolveHostContainedPath(workRoot, 'caches', 'pnpm-bootstrap-state')
  return [
    bootstrapPnpmModule,
    `--config.cache-dir=${bootstrapCache}`,
    `--config.state-dir=${bootstrapState}`,
    `--config.store-dir=${bootstrapStore}`,
  ]
}

async function ensurePackageManagerExecutable(
  component: AssemblyComponentV1,
  workRoot: string,
  bootstrapPnpmModule: string,
  runProcess: ProcessRunner,
  signal?: AbortSignal,
): Promise<LockedPackageManager> {
  const toolchainRoot = await prepareManagedDirectory(workRoot, 'caches', `${component.name}/pnpm-executable`)
  const executableName = process.platform === 'win32' ? 'pnpm.exe' : process.platform === 'linux' ? 'pnpm' : undefined
  if (executableName === undefined) throw new AssemblyError('UNSUPPORTED_ASSEMBLY_PLATFORM', 'assembly supports Windows and Linux')
  const executable = resolveHostContainedPath(toolchainRoot, 'node_modules', '@pnpm', 'exe', executableName)
  const module = resolveHostContainedPath(toolchainRoot, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
  try {
    const [existingExecutable, existingModule] = await Promise.all([lstat(executable), lstat(module)])
    if (
      !existingExecutable.isFile() || existingExecutable.isSymbolicLink() ||
      !existingModule.isFile() || existingModule.isSymbolicLink()
    ) {
      throw new AssemblyError('UNSAFE_PACKAGE_MANAGER', 'cached pnpm entrypoints must be real files')
    }
    return Object.freeze({ executable: process.execPath, argumentPrefix: Object.freeze([module]), versionCwd: toolchainRoot })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const packageJson = `${JSON.stringify({
    name: `recursus-pnpm-${component.toolchain.packageManager.version}`,
    private: true,
    packageManager: `pnpm@${component.toolchain.packageManager.version}`,
    dependencies: {
      '@pnpm/exe': component.toolchain.packageManager.version,
      pnpm: component.toolchain.packageManager.version,
    },
  }, null, 2)}\n`
  const workspace = "packages: []\nallowBuilds:\n  '@pnpm/exe': true\n"
  for (const [filename, contents] of [['package.json', packageJson], ['pnpm-workspace.yaml', workspace]] as const) {
    const target = resolveHostContainedPath(toolchainRoot, filename)
    try {
      await writeFile(target, contents, { encoding: 'utf8', flag: 'wx' })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (await readFile(target, 'utf8') !== contents) {
        throw new AssemblyError('PACKAGE_MANAGER_CACHE_MISMATCH', 'cached package manager provisioning files differ from the source lock')
      }
    }
  }
  const installed = await runProcess({
    executable: process.execPath,
    arguments: [
      ...bootstrapArguments(workRoot, bootstrapPnpmModule),
      '--dir',
      toolchainRoot,
      'install',
      '--lockfile=false',
    ],
    cwd: toolchainRoot,
    environment: componentEnvironment(workRoot, component),
    signal,
  })
  if (installed.exitCode !== 0) throw new AssemblyError('PACKAGE_MANAGER_PROVISION_FAILED', 'exact pnpm executable provisioning failed')
  const [installedExecutable, installedModule] = await Promise.all([lstat(executable), lstat(module)])
  if (
    !installedExecutable.isFile() || installedExecutable.isSymbolicLink() ||
    !installedModule.isFile() || installedModule.isSymbolicLink()
  ) {
    throw new AssemblyError('PACKAGE_MANAGER_PROVISION_FAILED', 'exact pnpm packages produced no real entrypoints')
  }
  if (process.platform === 'linux') await chmod(executable, 0o755)
  return Object.freeze({ executable: process.execPath, argumentPrefix: Object.freeze([module]), versionCwd: toolchainRoot })
}

function replacePlaceholders(argumentsList: readonly string[], packageDirectory: string): readonly string[] {
  return argumentsList.map((argument) => {
    const replaced = argument.replaceAll('{packageOutput}', packageDirectory)
    if (replaced.includes('{') || replaced.includes('}')) {
      throw new AssemblyError('UNKNOWN_COMMAND_PLACEHOLDER', 'component command contains an unknown placeholder')
    }
    return replaced
  })
}

function commandArguments(
  command: CommandSpec,
  component: AssemblyComponentV1,
  packageDirectory: string,
  workRoot: string,
): readonly string[] {
  if (command.executable !== 'pnpm') throw new AssemblyError('UNSUPPORTED_COMPONENT_COMMAND', 'only locked pnpm entrypoints are supported')
  return [
    ...pnpmConfigurationArguments(component, workRoot),
    ...replacePlaceholders(command.arguments, packageDirectory),
  ]
}

async function executeCommands(
  commands: readonly CommandSpec[],
  component: AssemblyComponentV1,
  sourceDirectory: string,
  packageDirectory: string,
  workRoot: string,
  packageManager: LockedPackageManager,
  runProcess: ProcessRunner,
  signal?: AbortSignal,
): Promise<AdapterStepResult> {
  const hostPlatform = process.platform === 'win32'
    ? 'windows-x64'
    : process.platform === 'linux'
      ? 'linux-x64'
      : undefined
  if (hostPlatform === undefined) throw new AssemblyError('UNSUPPORTED_ASSEMBLY_PLATFORM', 'assembly supports Windows and Linux')
  const applicableCommands = commands.filter((command) => command.platforms?.includes(hostPlatform) ?? true)
  let stdoutBytes = 0
  let stderrBytes = 0
  for (const [index, command] of applicableCommands.entries()) {
    if (signal?.aborted === true) throw new AssemblyError('ASSEMBLY_ABORTED', 'component command execution was cancelled')
    if (command.cwd !== 'source') throw new AssemblyError('UNSUPPORTED_COMMAND_CWD', 'component command cwd is not supported')
    const result = await runProcess({
      executable: packageManager.executable,
      arguments: [...packageManager.argumentPrefix, ...commandArguments(command, component, packageDirectory, workRoot)],
      cwd: sourceDirectory,
      environment: {
        ...componentEnvironment(workRoot, component),
        ...(packageManager.argumentPrefix[0] === undefined ? {} : { npm_execpath: packageManager.argumentPrefix[0] }),
        ...command.environment,
      },
      signal,
    })
    stdoutBytes += result.stdoutBytes
    stderrBytes += result.stderrBytes
    if (result.exitCode !== 0) {
      const gateNames = [...`${result.stdoutTail}\n${result.stderrTail}`.matchAll(/(?:== FAILED |\n\s*- (?:NON-BLOCKING )?FAILED )([A-Za-z0-9][A-Za-z0-9: ./_-]{0,119}?)(?: \(|\r?\n)/gu)]
        .map((match) => match[1]?.trim())
        .filter((name): name is string => name !== undefined && name !== '')
      const failedGates = [...new Set(gateNames)].sort(compareCodeUnits)
      const suffix = failedGates.length === 0 ? '' : `; failed gates: ${failedGates.join(', ')}`
      throw new AssemblyError(
        'COMPONENT_COMMAND_FAILED',
        `${component.name} command ${String(index + 1)} exited with ${String(result.exitCode)}${suffix}`,
      )
    }
  }
  return Object.freeze({ status: 'passed', evidence: Object.freeze({ commands: applicableCommands.length, stdoutBytes, stderrBytes }) })
}

function selectorRegex(selector: PackageSelector): RegExp {
  assertPortableRelativePath(selector.glob, 'package selector')
  const escaped = selector.glob.replace(/[.+?^${}()|[\]\\]/gu, '\\$&').replaceAll('*', '[^/]*')
  return new RegExp(`^${escaped}$`, 'u')
}

async function inspectAllowedMetadata(
  packageDirectory: string,
  metadataPaths: readonly string[],
  selectedPackages: ReadonlySet<string>,
): Promise<void> {
  for (const metadataPath of metadataPaths) {
    const contents = await readFile(resolveHostContainedPath(packageDirectory, ...metadataPath.split('/')), 'utf8')
    if (!contents.endsWith('\n') || contents.includes('\r') || contents.includes('\u0000')) {
      throw new AssemblyError('INVALID_PACKAGE_METADATA', `${metadataPath} must be newline-terminated UTF-8 line metadata`)
    }
    const directory = metadataPath.includes('/') ? metadataPath.slice(0, metadataPath.lastIndexOf('/') + 1) : ''
    const entries = contents.slice(0, -1).split('\n')
    if (entries.length === 0 || entries.some((entry) => entry === '') || new Set(entries).size !== entries.length) {
      throw new AssemblyError('INVALID_PACKAGE_METADATA', `${metadataPath} must contain unique non-empty package names`)
    }
    for (const entry of entries) {
      if (entry.includes('/') || entry.includes('\\') || !entry.endsWith('.tgz') || !selectedPackages.has(`${directory}${entry}`)) {
        throw new AssemblyError('INVALID_PACKAGE_METADATA', `${metadataPath} references an unselected package`)
      }
    }
  }
}

async function discoverPackages(
  packageDirectory: string,
  selectors: readonly PackageSelector[],
  allowedMetadata: readonly string[] = [],
): Promise<readonly string[]> {
  const files: string[] = []
  async function visit(directory: string, relativeDirectory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new AssemblyError('UNSAFE_PACKAGE_OUTPUT', 'package output contains a symbolic link')
      const relative = relativeDirectory === '' ? entry.name : `${relativeDirectory}/${entry.name}`
      const absolute = resolveHostContainedPath(packageDirectory, ...relative.split('/'))
      if (entry.isDirectory()) await visit(absolute, relative)
      else if (entry.isFile()) files.push(relative)
      else throw new AssemblyError('UNSAFE_PACKAGE_OUTPUT', 'package output contains an unsupported filesystem entry')
    }
  }
  await visit(packageDirectory, '')
  const selected = new Set<string>()
  for (const selector of selectors) {
    const matches = files.filter((file) => selectorRegex(selector).test(file))
    if (matches.length === 0) throw new AssemblyError('EXPECTED_PACKAGE_MISSING', `no package matches ${selector.glob}`)
    matches.forEach((match) => selected.add(match))
  }
  const metadata = new Set(allowedMetadata)
  for (const metadataPath of metadata) {
    assertPortableRelativePath(metadataPath, 'allowed package metadata')
    if (!files.includes(metadataPath)) {
      throw new AssemblyError('EXPECTED_PACKAGE_METADATA_MISSING', `package metadata ${metadataPath} is missing`)
    }
  }
  const unexpected = files.filter((file) => !selected.has(file) && !metadata.has(file))
  if (unexpected.length > 0) throw new AssemblyError('UNEXPECTED_PACKAGE_OUTPUT', 'package output contains files outside declared selectors')
  await inspectAllowedMetadata(packageDirectory, [...metadata], selected)
  return Object.freeze([...selected].sort(compareCodeUnits))
}

function packageEvidence(relativePath: string, inspected: InspectedPackage): ComponentPackageEvidence {
  return Object.freeze({
    relativePath,
    packageName: inspected.packageName,
    packageVersion: inspected.packageVersion,
    sha256: inspected.archiveSha256,
    bytes: inspected.archiveBytes,
    contentsSha256: inspected.contentsSha256,
    entryCount: inspected.entries.length,
    notices: inspected.notices,
  })
}

/** Re-inspect an already produced component package directory without trusting prior evidence. */
export async function inspectComponentPackageDirectory(
  component: AssemblyComponentV1,
  packageDirectory: string,
  forbiddenAbsolutePaths: readonly string[],
): Promise<readonly ComponentPackageEvidence[]> {
  if (forbiddenAbsolutePaths.length === 0) {
    throw new AssemblyError('PACKAGE_INSPECTION_ROOT_REQUIRED', 'component package inspection requires an exact work root')
  }
  if (!path.isAbsolute(packageDirectory)) {
    throw new AssemblyError('PACKAGE_OUTPUT_NOT_ABSOLUTE', 'component package directory must be absolute')
  }
  const realPackageDirectory = await assertRealDirectory(packageDirectory, 'component package directory')
  const relativePackages = await discoverPackages(
    realPackageDirectory,
    component.pack.selectors,
    component.pack.allowedMetadata,
  )
  const inspected: ComponentPackageEvidence[] = []
  for (const relativePackage of relativePackages) {
    const archivePath = resolveHostContainedPath(realPackageDirectory, ...relativePackage.split('/'))
    inspected.push(packageEvidence(relativePackage, await inspectNpmPackage({
      archivePath,
      expectedNoticeBasenames: component.license.noticeFiles,
      allowMissingNotice: component.license.redistribution === 'blocked-pending-owner-license',
      forbiddenAbsolutePaths,
    })))
  }
  return Object.freeze(inspected)
}

/** Create the concrete provider-neutral adapter for a locked component. */
export function createComponentCommandAdapter(options: ComponentCommandAdapterOptions): ComponentAdapter & {
  readonly packageEvidence: () => readonly ComponentPackageEvidence[]
} {
  if (!path.isAbsolute(options.bootstrapPnpmModule)) {
    throw new AssemblyError('PACKAGE_MANAGER_BOOTSTRAP_NOT_ABSOLUTE', 'the pnpm bootstrap module must be an absolute path')
  }
  const runProcess = options.runProcess ?? defaultProcessRunner
  const state: AdapterState = {}

  function requireSource(): string {
    if (state.sourceDirectory === undefined) throw new AssemblyError('ADAPTER_PHASE_ORDER', 'component source is not acquired')
    return state.sourceDirectory
  }

  function requirePackageManager(): LockedPackageManager {
    if (state.packageManager === undefined) throw new AssemblyError('ADAPTER_PHASE_ORDER', 'package manager is not inspected')
    return state.packageManager
  }

  function requirePackageDirectory(): string {
    if (state.packageDirectory === undefined) throw new AssemblyError('ADAPTER_PHASE_ORDER', 'package output is not prepared')
    return state.packageDirectory
  }

  return {
    packageEvidence: () => state.packages ?? Object.freeze([]),
    async inspect(context: AdapterContext): Promise<AdapterStepResult> {
      await prepareManagedDirectory(context.workRoot, 'caches', context.component.name)
      state.packageManager = options.packageManagerExecutable === undefined
        ? await ensurePackageManagerExecutable(
          context.component,
          context.workRoot,
          options.bootstrapPnpmModule,
          runProcess,
          context.signal,
        )
        : Object.freeze({
          executable: options.packageManagerExecutable,
          argumentPrefix: Object.freeze([]),
          versionCwd: path.dirname(options.packageManagerExecutable),
        })
      if (!path.isAbsolute(state.packageManager.executable)) {
        throw new AssemblyError('PACKAGE_MANAGER_EXECUTABLE_NOT_ABSOLUTE', 'the exact package manager executable must be absolute')
      }
      const packageManager = requirePackageManager()
      const version = await runProcess({
        executable: packageManager.executable,
        arguments: [
          ...packageManager.argumentPrefix,
          ...commandArguments(
            { executable: 'pnpm', arguments: ['--version'], cwd: 'source' },
            context.component,
            context.workRoot,
            context.workRoot,
          ),
        ],
        cwd: packageManager.versionCwd,
        environment: componentEnvironment(context.workRoot, context.component),
        signal: context.signal,
      })
      const versionLines = version.stdoutTail.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
      if (version.exitCode !== 0 || !versionLines.includes(context.component.toolchain.packageManager.version)) {
        throw new AssemblyError('PACKAGE_MANAGER_VERSION_MISMATCH', `${context.component.name} package manager version differs from the lock`)
      }
      return { status: 'passed', evidence: { packageManager: 'pnpm', version: context.component.toolchain.packageManager.version } }
    },
    async acquire(context: AdapterContext): Promise<AdapterStepResult> {
      const acquired = await acquireGitComponent({
        component: context.component,
        workRoot: context.workRoot,
        sourcesDirectory: 'sources',
        signal: context.signal,
      })
      state.sourceDirectory = acquired.sourceDirectory
      return { status: 'passed', evidence: acquisitionEvidenceJson(acquired.evidence) }
    },
    async verifyRevision(context: AdapterContext): Promise<AdapterStepResult> {
      const evidence = await verifyGitRevision({
        component: context.component,
        workRoot: context.workRoot,
        sourcesDirectory: 'sources',
        signal: context.signal,
      })
      state.sourceDirectory = resolveHostContainedPath(context.workRoot, 'sources', context.component.name)
      return { status: 'passed', evidence: acquisitionEvidenceJson(evidence) }
    },
    async restoreDependencies(context: AdapterContext): Promise<AdapterStepResult> {
      const packageDirectory = await prepareManagedDirectory(context.workRoot, 'packages', context.component.name)
      state.packageDirectory = packageDirectory
      const existing = await readdir(packageDirectory)
      if (existing.length > 0) throw new AssemblyError('PACKAGE_OUTPUT_NOT_EMPTY', 'component package output must start empty')
      return await executeCommands(context.component.entrypoints.restoreDependencies, context.component, requireSource(), packageDirectory, context.workRoot, requirePackageManager(), runProcess, context.signal)
    },
    async verifySource(context: AdapterContext): Promise<AdapterStepResult> {
      return await executeCommands(context.component.entrypoints.verifySource, context.component, requireSource(), requirePackageDirectory(), context.workRoot, requirePackageManager(), runProcess, context.signal)
    },
    async build(context: AdapterContext): Promise<AdapterStepResult> {
      return await executeCommands(context.component.entrypoints.build, context.component, requireSource(), requirePackageDirectory(), context.workRoot, requirePackageManager(), runProcess, context.signal)
    },
    async pack(context: AdapterContext): Promise<AdapterStepResult> {
      return await executeCommands(context.component.entrypoints.pack, context.component, requireSource(), requirePackageDirectory(), context.workRoot, requirePackageManager(), runProcess, context.signal)
    },
    async inspectPackage(context: AdapterContext): Promise<AdapterStepResult> {
      await executeCommands(context.component.entrypoints.inspectPackage, context.component, requireSource(), requirePackageDirectory(), context.workRoot, requirePackageManager(), runProcess, context.signal)
      const inspected = await inspectComponentPackageDirectory(
        context.component,
        requirePackageDirectory(),
        [context.workRoot],
      )
      state.packages = Object.freeze(inspected)
      const aggregate = createHash('sha256')
      for (const item of inspected) {
        aggregate.update(`${item.relativePath}\0${item.sha256}\0${String(item.bytes)}\n`)
      }
      const evidence: Readonly<Record<string, JsonValue>> = {
        packageCount: inspected.length,
        integritySha256: aggregate.digest('hex'),
      }
      return { status: 'passed', evidence }
    },
  }
}
