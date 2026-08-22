import { execFile } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { AssemblyError } from './errors.js'
import type { AssemblyManifestV1 } from './types.js'

const execFileAsync = promisify(execFile)
const SHA256 = /^[0-9a-f]{64}$/u
const REVISION = /^[0-9a-f]{40}$/u
const REPORT_PREFIX = 'RECURSUS_SMOKE_REPORT='
const CREDENTIAL_ENVIRONMENT_NAME = /(?:AUTH|COOKIE|CREDENTIAL|KEY|PASSWORD|SECRET|TOKEN)/iu

export type SmokeStatus = 'passed' | 'not-run'

export interface AssembledSmokeReportV1 {
  readonly schemaVersion: 1
  readonly assemblyId: string
  readonly platform: 'windows-x64' | 'linux-x64'
  readonly componentRevisions: Readonly<Record<string, string>>
  readonly checks: {
    readonly codexProvider: { readonly status: SmokeStatus; readonly mode: 'live' | 'not-run'; readonly bounded: boolean }
    readonly toolApproval: { readonly status: 'passed'; readonly auditEvents: readonly string[]; readonly toolResultSha256: string }
    readonly rlm: { readonly status: 'passed'; readonly result: '42'; readonly generation: number; readonly persistent: true }
    readonly honchoDisabled: { readonly status: 'passed'; readonly startupPassed: true }
    readonly honchoLive: { readonly status: SmokeStatus; readonly mode: 'live' | 'not-run'; readonly sanitizedRoundTrip: boolean; readonly cleanupVerified: boolean }
    readonly artifact: { readonly status: 'passed'; readonly bytes: number; readonly sha256: string; readonly exactResolution: true }
    readonly dovetail: { readonly status: 'passed'; readonly provider: 'dovetail'; readonly skill: 'prompt-engineering'; readonly discovered: true; readonly invoked: true }
  }
}

export interface RunAssembledSmokeOptions {
  readonly manifest: AssemblyManifestV1
  readonly profileDirectory: string
  readonly workRoot: string
  readonly liveCodex?: boolean
  readonly liveHoncho?: boolean
  readonly codexAuthFile?: string
  readonly timeoutMs?: number
  readonly environment?: NodeJS.ProcessEnv
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  if (Object.keys(value).sort().join('\0') !== [...expected].sort().join('\0')) {
    throw new AssemblyError('INVALID_SMOKE_REPORT', `${label} fields differ from schema version 1`)
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AssemblyError('INVALID_SMOKE_REPORT', `${label} must be an object`)
  }
  return value as Record<string, unknown>
}

/** Validate the content-bounded, deterministic evidence returned by an assembled smoke worker. */
export function validateAssembledSmokeReport(value: unknown): AssembledSmokeReportV1 {
  const report = record(value, 'smoke report')
  exactKeys(report, ['assemblyId', 'checks', 'componentRevisions', 'platform', 'schemaVersion'], 'smoke report')
  if (
    report.schemaVersion !== 1 || typeof report.assemblyId !== 'string' ||
    !/^[a-z0-9][a-z0-9.-]{0,63}$/u.test(report.assemblyId) ||
    (report.platform !== 'windows-x64' && report.platform !== 'linux-x64')
  ) throw new AssemblyError('INVALID_SMOKE_REPORT', 'smoke report header is invalid')

  const revisions = record(report.componentRevisions, 'componentRevisions')
  if (Object.keys(revisions).length !== 5 || Object.values(revisions).some((revision) => typeof revision !== 'string' || !REVISION.test(revision))) {
    throw new AssemblyError('INVALID_SMOKE_REPORT', 'component revisions are invalid')
  }
  const checks = record(report.checks, 'checks')
  exactKeys(checks, ['artifact', 'codexProvider', 'dovetail', 'honchoDisabled', 'honchoLive', 'rlm', 'toolApproval'], 'checks')

  const codex = record(checks.codexProvider, 'codexProvider')
  exactKeys(codex, ['bounded', 'mode', 'status'], 'codexProvider')
  if (!(
    (codex.status === 'passed' && codex.mode === 'live' && codex.bounded === true) ||
    (codex.status === 'not-run' && codex.mode === 'not-run' && codex.bounded === false)
  )) throw new AssemblyError('INVALID_SMOKE_REPORT', 'Codex smoke evidence is inconsistent')

  const tool = record(checks.toolApproval, 'toolApproval')
  exactKeys(tool, ['auditEvents', 'status', 'toolResultSha256'], 'toolApproval')
  if (
    tool.status !== 'passed' || !Array.isArray(tool.auditEvents) ||
    tool.auditEvents.join('\0') !== ['approval/asked', 'approval/decided', 'tool/call', 'tool/result'].join('\0') ||
    typeof tool.toolResultSha256 !== 'string' || !SHA256.test(tool.toolResultSha256)
  ) throw new AssemblyError('INVALID_SMOKE_REPORT', 'tool approval evidence is invalid')

  const rlm = record(checks.rlm, 'rlm')
  exactKeys(rlm, ['generation', 'persistent', 'result', 'status'], 'rlm')
  if (rlm.status !== 'passed' || rlm.result !== '42' || rlm.persistent !== true || !Number.isSafeInteger(rlm.generation) || (rlm.generation as number) < 1) {
    throw new AssemblyError('INVALID_SMOKE_REPORT', 'RLM evidence is invalid')
  }
  const disabled = record(checks.honchoDisabled, 'honchoDisabled')
  exactKeys(disabled, ['startupPassed', 'status'], 'honchoDisabled')
  if (disabled.status !== 'passed' || disabled.startupPassed !== true) throw new AssemblyError('INVALID_SMOKE_REPORT', 'disabled Honcho evidence is invalid')

  const live = record(checks.honchoLive, 'honchoLive')
  exactKeys(live, ['cleanupVerified', 'mode', 'sanitizedRoundTrip', 'status'], 'honchoLive')
  if (!(
    (live.status === 'passed' && live.mode === 'live' && live.sanitizedRoundTrip === true && live.cleanupVerified === true) ||
    (live.status === 'not-run' && live.mode === 'not-run' && live.sanitizedRoundTrip === false && live.cleanupVerified === false)
  )) throw new AssemblyError('INVALID_SMOKE_REPORT', 'live Honcho evidence is inconsistent')

  const artifact = record(checks.artifact, 'artifact')
  exactKeys(artifact, ['bytes', 'exactResolution', 'sha256', 'status'], 'artifact')
  if (
    artifact.status !== 'passed' || artifact.exactResolution !== true ||
    !Number.isSafeInteger(artifact.bytes) || (artifact.bytes as number) < 1 ||
    typeof artifact.sha256 !== 'string' || !SHA256.test(artifact.sha256)
  ) throw new AssemblyError('INVALID_SMOKE_REPORT', 'artifact evidence is invalid')

  const dovetail = record(checks.dovetail, 'dovetail')
  exactKeys(dovetail, ['discovered', 'invoked', 'provider', 'skill', 'status'], 'dovetail')
  if (
    dovetail.status !== 'passed' || dovetail.provider !== 'dovetail' || dovetail.skill !== 'prompt-engineering' ||
    dovetail.discovered !== true || dovetail.invoked !== true
  ) throw new AssemblyError('INVALID_SMOKE_REPORT', 'Dovetail evidence is invalid')
  return value as AssembledSmokeReportV1
}

function assertContained(root: string, target: string, label: string): void {
  const relative = path.relative(root, target)
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new AssemblyError('SMOKE_BOUNDARY_ESCAPE', `${label} must be contained by the configured work root`)
  }
}

function smokeEnvironment(
  source: NodeJS.ProcessEnv,
  liveHoncho: boolean,
): NodeJS.ProcessEnv {
  const environment = Object.fromEntries(
    Object.entries(source).filter(([name]) => !CREDENTIAL_ENVIRONMENT_NAME.test(name)),
  )
  if (liveHoncho) {
    const apiKey = source.HONCHO_API_KEY
    if (apiKey === undefined || apiKey.length === 0) {
      throw new AssemblyError('HONCHO_CREDENTIAL_REQUIRED', 'live Honcho acceptance requires the host HONCHO_API_KEY')
    }
    environment.HONCHO_API_KEY = apiKey
  }
  if (source.HONCHO_BASE_URL !== undefined) environment.HONCHO_BASE_URL = source.HONCHO_BASE_URL
  return environment
}

/** Run the shipped worker against one installed profile and validate its content-free report. */
export async function runAssembledSmoke(options: RunAssembledSmokeOptions): Promise<AssembledSmokeReportV1> {
  if (!path.isAbsolute(options.workRoot) || !path.isAbsolute(options.profileDirectory)) {
    throw new AssemblyError('SMOKE_PATH_NOT_ABSOLUTE', 'smoke paths must be absolute')
  }
  const realWorkRoot = await realpath(options.workRoot)
  const realProfile = await realpath(options.profileDirectory)
  assertContained(realWorkRoot, realProfile, 'profile directory')
  if (options.liveCodex === true && (options.codexAuthFile === undefined || !path.isAbsolute(options.codexAuthFile))) {
    throw new AssemblyError('CODEX_AUTH_FILE_REQUIRED', 'live Codex acceptance requires an explicit absolute auth file')
  }
  const revisions = Object.fromEntries(
    [...options.manifest.components].sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
      .map((component) => [component.name, component.revision]),
  )
  const worker = fileURLToPath(new URL('./assembled-smoke-worker.js', import.meta.url))
  const args = [worker, '--profile', realProfile, '--work-root', realWorkRoot, '--assembly-id', options.manifest.assemblyId, '--revisions', JSON.stringify(revisions)]
  if (options.liveCodex === true) args.push('--live-codex', '--codex-auth-file', options.codexAuthFile as string)
  if (options.liveHoncho === true) args.push('--live-honcho')
  const environment = smokeEnvironment(options.environment ?? process.env, options.liveHoncho === true)
  let stdout: string
  try {
    const result = await execFileAsync(process.execPath, args, {
      cwd: realWorkRoot,
      env: environment,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: options.timeoutMs ?? (options.liveHoncho === true ? 900_000 : 600_000),
      windowsHide: true,
    })
    stdout = result.stdout
  } catch {
    throw new AssemblyError('ASSEMBLED_SMOKE_FAILED', 'assembled smoke worker failed without accepted evidence')
  }
  const line = stdout.split(/\r?\n/u).findLast((item) => item.startsWith(REPORT_PREFIX))
  if (line === undefined) throw new AssemblyError('ASSEMBLED_SMOKE_FAILED', 'assembled smoke worker returned no report')
  let parsed: unknown
  try {
    parsed = JSON.parse(line.slice(REPORT_PREFIX.length))
  } catch {
    throw new AssemblyError('INVALID_SMOKE_REPORT', 'assembled smoke worker returned invalid JSON')
  }
  const report = validateAssembledSmokeReport(parsed)
  const expectedPlatform = process.platform === 'win32' ? 'windows-x64' : 'linux-x64'
  if (report.assemblyId !== options.manifest.assemblyId || report.platform !== expectedPlatform || JSON.stringify(report.componentRevisions) !== JSON.stringify(revisions)) {
    throw new AssemblyError('SMOKE_IDENTITY_MISMATCH', 'smoke report identity differs from the locked assembly')
  }
  if (options.liveCodex === true && report.checks.codexProvider.status !== 'passed') throw new AssemblyError('LIVE_CODEX_NOT_PROVEN', 'live Codex acceptance was requested but not proven')
  if (options.liveHoncho === true && report.checks.honchoLive.status !== 'passed') throw new AssemblyError('LIVE_HONCHO_NOT_PROVEN', 'live Honcho acceptance was requested but not proven')
  return report
}
