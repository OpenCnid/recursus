import { createHash, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

type ModuleRecord = Record<string, unknown>
type Fiber = { dispose(): Promise<void> }
type SmokeAgent = {
  readonly id: unknown
  readonly session: { readonly events: readonly { readonly type: string }[]; readonly header: { readonly cwd?: string } }
  followup(message: unknown): void
  whenIdle(): Promise<void>
}
type ToolResult = { readonly isError: boolean; readonly value?: Record<string, unknown> }
type SmokeHonchoScope = Readonly<Record<string, unknown>>
type SmokeHoncho = {
  scopeForSession(dshSessionId: string, agentKind: 'root'): SmokeHonchoScope
  ensureScope(scope: SmokeHonchoScope, signal?: AbortSignal): Promise<void>
  record(request: Record<string, unknown>): Promise<void>
  search(request: Record<string, unknown>): Promise<{ readonly items: readonly { readonly text: string }[] }>
  status(): { readonly pendingDeliveries: number; readonly deliveredCount?: number }
  drainOnce(): Promise<number>
}
type SmokeContext = {
  readonly fiber: Fiber
  readonly llm: {
    registerAdapter(providers: string[], adapter: unknown): unknown
    listProviders(): readonly { readonly id: string }[]
    listModels(provider: string): Promise<readonly { readonly id: string }[]>
    stream(request: Record<string, unknown>): AsyncIterable<Record<string, unknown>>
  }
  readonly credentials?: { set(reference: string, value: string): Promise<void> }
  readonly tools: {
    register(definition: unknown): unknown
    execute(request: Record<string, unknown>): Promise<ToolResult>
  }
  readonly agentLoop: { create(id: unknown, options: unknown, meta?: unknown): SmokeAgent }
  readonly rlm: {
    execute(request: Record<string, unknown>): Promise<Record<string, unknown>>
    info(agent: SmokeAgent): Record<string, unknown> | undefined
  }
  readonly skills: {
    list(options: Record<string, unknown>): Promise<readonly Record<string, unknown>[]>
  }
  readonly honcho?: SmokeHoncho
  plugin(plugin: unknown, config?: unknown): PromiseLike<Fiber>
  on(event: string, listener: (...arguments_: unknown[]) => unknown, options?: unknown): unknown
}

type HonchoClient = {
  workspaces(options: Record<string, unknown>): Promise<{ readonly items: readonly string[] }>
  setMetadata(metadata: Record<string, unknown>): Promise<unknown>
  getMetadata(): Promise<Record<string, unknown>>
  sessions(options: Record<string, unknown>): Promise<{ readonly items: readonly { delete(): Promise<void> }[] }>
  deleteWorkspace(workspaceId: string): Promise<void>
}

type HonchoConstructor = new (config: Record<string, unknown>) => HonchoClient
type CredentialProviderConstructor = new (context: unknown) => object

interface ProfileModules {
  readonly load: (name: string) => Promise<ModuleRecord>
  readonly loadDependency: (owner: string, name: string) => Promise<ModuleRecord>
}

const REPORT_PREFIX = 'RECURSUS_SMOKE_REPORT='

function argumentsMap(): Map<string, string | true> {
  const output = new Map<string, string | true>()
  for (let index = 2; index < process.argv.length; index += 1) {
    const key = process.argv[index]
    if (key === undefined || !key.startsWith('--')) throw new Error('invalid worker argument')
    if (key === '--live-codex' || key === '--live-honcho') output.set(key, true)
    else {
      const value = process.argv[index + 1]
      if (value === undefined || value.startsWith('--')) throw new Error('worker argument value is missing')
      output.set(key, value)
      index += 1
    }
  }
  return output
}

function required(arguments_: Map<string, string | true>, name: string): string {
  const value = arguments_.get(name)
  if (typeof value !== 'string' || value.length === 0) throw new Error(`missing ${name}`)
  return value
}

function named<T>(module: ModuleRecord, name: string): T {
  const value = module[name]
  if (value === undefined) throw new Error(`assembled package export is missing: ${name}`)
  return value as T
}

function defaultExport(module: ModuleRecord): unknown {
  return module.default ?? module
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function assertResult(result: ToolResult, label: string): Record<string, unknown> {
  if (result.isError || result.value === undefined) throw new Error(`${label} failed`)
  return result.value
}

function textResponse(text: string): readonly Record<string, unknown>[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

function toolResponse(callId: unknown): readonly Record<string, unknown>[] {
  const argumentsJson = JSON.stringify({ marker: 'recursus-smoke' })
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: callId, name: 'recursus_local_probe', argumentsDelta: argumentsJson },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: callId, name: 'recursus_local_probe', arguments: argumentsJson } },
    { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

async function profileModuleLoader(profileDirectory: string): Promise<ProfileModules> {
  const require = createRequire(path.join(profileDirectory, 'package.json'))
  const load = async (name: string): Promise<ModuleRecord> => {
    const resolved = require.resolve(name)
    return await import(pathToFileURL(resolved).href) as ModuleRecord
  }
  const loadDependency = async (owner: string, name: string): Promise<ModuleRecord> => {
    const ownerPath = require.resolve(owner)
    const ownerRequire = createRequire(ownerPath)
    return await import(pathToFileURL(ownerRequire.resolve(name)).href) as ModuleRecord
  }
  return { load, loadDependency }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function requiredString(value: Record<string, unknown>, key: string, label: string): string {
  const member = value[key]
  if (typeof member !== 'string' || member.length === 0) throw new Error(`${label} is missing ${key}`)
  return member
}

function oauthExpiry(idToken: string): number {
  const payload = idToken.split('.')[1]
  if (payload === undefined) throw new Error('Codex OAuth identity token is malformed')
  let decoded: Record<string, unknown>
  try {
    decoded = object(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')), 'Codex OAuth identity token payload')
  } catch {
    throw new Error('Codex OAuth identity token payload is invalid')
  }
  const expires = decoded.exp
  if (!Number.isSafeInteger(expires) || (expires as number) <= 0) throw new Error('Codex OAuth identity token expiry is invalid')
  return (expires as number) * 1000
}

async function liveCodex(
  load: (name: string) => Promise<ModuleRecord>,
  runtimeRoot: string,
  authFile: string,
): Promise<Record<string, unknown>> {
  const [cordis, testkit, credentials, codex, llm] = await Promise.all([
    load('@deepseek-ai/cordis'),
    load('@deepseek-ai/dsh-agent-loop-testkit'),
    load('@deepseek-ai/dsh-credentials'),
    load('deepseek-openai-codex'),
    load('@deepseek-ai/dsh-llm'),
  ])
  let auth: Record<string, unknown>
  try {
    auth = object(JSON.parse(await readFile(authFile, 'utf8')), 'Codex auth document')
  } catch {
    throw new Error('Codex auth document is unavailable or invalid')
  }
  const tokens = object(auth.tokens, 'Codex auth tokens')
  const credential = {
    type: 'oauth',
    access: requiredString(tokens, 'access_token', 'Codex auth tokens'),
    refresh: requiredString(tokens, 'refresh_token', 'Codex auth tokens'),
    expires: oauthExpiry(requiredString(tokens, 'id_token', 'Codex auth tokens')),
    accountId: requiredString(tokens, 'account_id', 'Codex auth tokens'),
  }
  const Context = named<new () => SmokeContext>(cordis, 'Context')
  const CredentialProvider = named<CredentialProviderConstructor>(credentials, 'CredentialProvider')
  const createUserMessage = named<(value: unknown) => unknown>(llm, 'createUserMessage')
  const encodeCredential = named<(value: unknown) => string>(codex, 'encodeCredential')
  const ctx = new Context()
  const lockDirectory = path.join(runtimeRoot, 'codex-locks')
  await mkdir(lockDirectory, { recursive: true })
  class EphemeralCredentials extends CredentialProvider {
    private readonly store = new Map<string, string>()

    constructor(context: unknown, seed: Record<string, string> = {}) {
      super(context)
      for (const [key, value] of Object.entries(seed)) this.store.set(key, value)
    }

    resolve(reference: string): Promise<{ readonly value: string; readonly source: 'memory' } | undefined> {
      const value = this.store.get(reference)
      return Promise.resolve(value === undefined ? undefined : { value, source: 'memory' })
    }

    describe(reference: string): Promise<{ readonly configured: boolean; readonly source?: 'memory'; readonly writable: true }> {
      const configured = this.store.has(reference)
      return Promise.resolve({ configured, ...(configured ? { source: 'memory' as const } : {}), writable: true })
    }

    set(reference: string, value: string): Promise<void> {
      if (value.length === 0) return Promise.reject(new Error('ephemeral credential value must be non-empty'))
      this.store.set(reference, value)
      return Promise.resolve()
    }

    unset(reference: string): Promise<void> {
      this.store.delete(reference)
      return Promise.resolve()
    }
  }
  try {
    await named<(context: unknown) => Promise<void>>(testkit, 'mountAgentLoopTestDependencies')(ctx)
    await ctx.plugin(EphemeralCredentials, { OPENAI_CODEX_OAUTH: encodeCredential(credential) })
    if (ctx.credentials === undefined) throw new Error('assembled credential service did not mount')
    await ctx.plugin(defaultExport(codex), {
      credentialRef: 'OPENAI_CODEX_OAUTH',
      lockDirectory,
      adapterTimeoutMs: 90_000,
    })
    if (!ctx.llm.listProviders().some((provider) => provider.id === 'openai-codex')) {
      throw new Error('assembled Codex provider did not register')
    }
    if (!(await ctx.llm.listModels('openai-codex')).some((model) => model.id === 'gpt-5.6-luna')) {
      throw new Error('assembled Codex model catalog is missing the bounded acceptance model')
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 90_000)
    timer.unref?.()
    let textSeen = false
    let completed = false
    try {
      const request = {
        provider: 'openai-codex',
        model: 'gpt-5.6-luna',
        reasoningEffort: 'minimal',
        maxTokens: 32,
        signal: controller.signal,
        messages: [createUserMessage({
          content: [{ type: 'text', text: 'This is a bounded synthetic acceptance request. Reply with exactly OK.' }],
          source: { kind: 'user' },
        })],
      }
      for await (const chunk of ctx.llm.stream(request)) {
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string' && chunk.text.length > 0) textSeen = true
        if (chunk.type !== 'finish') continue
        const reason = object(chunk.reason, 'Codex finish reason')
        completed = reason.kind === 'stop'
      }
    } catch {
      throw new Error('bounded Codex request failed')
    } finally {
      clearTimeout(timer)
      controller.abort()
    }
    if (!textSeen || !completed) throw new Error('bounded Codex request did not complete normally')
    return { status: 'passed', mode: 'live', bounded: true }
  } finally {
    await ctx.fiber.dispose()
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}

async function deleteWorkspace(client: HonchoClient, workspaceId: string): Promise<void> {
  const deleteDeadline = Date.now() + 120_000
  while (Date.now() < deleteDeadline) {
    try {
      await client.deleteWorkspace(workspaceId)
      break
    } catch {
      await delay(1_000)
    }
  }
  const absenceDeadline = Date.now() + 300_000
  while (Date.now() < absenceDeadline) {
    const remaining = await client.workspaces({ filters: { id: workspaceId }, page: 1, size: 10 })
    if (!remaining.items.includes(workspaceId)) return
    await delay(1_000)
  }
  throw new Error('synthetic Honcho workspace deletion could not be verified')
}

async function cleanupHonchoWorkspace(
  client: HonchoClient,
  workspaceId: string,
  runId: string,
): Promise<void> {
  const existing = await client.workspaces({ filters: { id: workspaceId }, page: 1, size: 10 })
  if (!existing.items.includes(workspaceId)) return
  const metadata = await client.getMetadata()
  if (
    metadata.source !== 'recursus-m1-smoke' || metadata.schema_version !== 1 ||
    metadata.run_id !== runId || metadata.synthetic !== true
  ) throw new Error('synthetic Honcho workspace cleanup fence did not match')
  const sessions = await client.sessions({ page: 1, size: 100 })
  for (const session of sessions.items) await session.delete()
  await deleteWorkspace(client, workspaceId)
}

async function liveHoncho(
  modules: ProfileModules,
  runtimeRoot: string,
  resourceRoot: string,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const baseURL = process.env.HONCHO_BASE_URL ?? 'https://api.honcho.dev'
  let parsedBase: URL
  try {
    parsedBase = new URL(baseURL)
  } catch {
    throw new Error('HONCHO_BASE_URL is invalid')
  }
  if (parsedBase.protocol !== 'https:' && parsedBase.protocol !== 'http:') throw new Error('HONCHO_BASE_URL must use HTTP or HTTPS')
  const [cordis, honchoProvider, honchoContract, sdk] = await Promise.all([
    modules.load('@deepseek-ai/cordis'),
    modules.load('@deepseek-honcho/dsh-honcho-sdk'),
    modules.load('@deepseek-honcho/dsh-honcho'),
    modules.loadDependency('@deepseek-honcho/dsh-honcho-sdk', '@honcho-ai/sdk'),
  ])
  const Context = named<new () => SmokeContext>(cordis, 'Context')
  const Honcho = named<HonchoConstructor>(sdk, 'Honcho')
  const sanitize = named<(input: string, policy: Record<string, unknown>) => { text: string; redacted: number }>(
    honchoContract,
    'sanitizeHonchoContent',
  )
  const runId = randomBytes(10).toString('hex')
  const workspaceId = `recursus_m1_${runId}`
  const userPeerId = `recursus_user_${runId}`
  const assistantPeerId = `recursus_assistant_${runId}`
  const projectId = `recursus_project_${runId}`
  const dshSessionId = `recursus_live_${runId}`
  await mkdir(resourceRoot, { recursive: true })
  const realResourceRoot = await realpath(resourceRoot)
  const resourceRelative = path.relative(path.dirname(resourceRoot), realResourceRoot)
  if (resourceRelative !== path.basename(resourceRoot)) throw new Error('live Honcho resource root escaped the work root')
  const resourceDocument = {
    schemaVersion: 1,
    provider: 'honcho',
    workspaceId,
    fence: { source: 'recursus-m1-smoke', schemaVersion: 1, runId, synthetic: true },
  }
  await writeFile(
    path.join(realResourceRoot, `${runId}.json`),
    `${JSON.stringify({ ...resourceDocument, cleanupVerified: false }, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx' },
  )
  const client = new Honcho({ apiKey, baseURL, workspaceId, timeout: 10_000, maxRetries: 1 })
  const existing = await client.workspaces({ filters: { id: workspaceId }, page: 1, size: 10 })
  if (existing.items.includes(workspaceId)) throw new Error('generated Honcho acceptance workspace already exists')
  let workspaceAttempted = false
  let ctx: SmokeContext | undefined
  let operationFailure: Error | undefined
  let roundTripPassed = false
  try {
    workspaceAttempted = true
    await client.setMetadata({ source: 'recursus-m1-smoke', schema_version: 1, run_id: runId, synthetic: true })
    ctx = new Context()
    process.env.HONCHO_API_KEY = apiKey
    try {
      await ctx.plugin(defaultExport(honchoProvider), {
        apiKeyEnv: 'HONCHO_API_KEY',
        baseURL,
        workspaceId,
        userPeerId,
        assistantPeerId,
        projectId,
        stateRoot: path.join(runtimeRoot, 'honcho-state'),
        timeoutMs: 10_000,
        maxRetries: 1,
        workspaceAutoCreate: false,
        peerAutoCreate: true,
        sessionAutoCreate: true,
        assistantObservation: false,
        drainTimeoutMs: 10_000,
        pollMs: 100,
      })
    } finally {
      delete process.env.HONCHO_API_KEY
    }
    if (ctx.honcho === undefined) throw new Error('assembled Honcho provider did not mount')
    const scope = ctx.honcho.scopeForSession(dshSessionId, 'root')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 180_000)
    timer.unref?.()
    try {
      await ctx.honcho.ensureScope(scope, controller.signal)
      const marker = `orchard_${runId}`
      const fakeSecret = 'recursus_fake_secret_12345'
      const sanitized = sanitize(
        `Synthetic Recursus memory ${marker}; api_key=${fakeSecret}`,
        { redactSecrets: true, maxCharacters: 512, maxBytes: 1024 },
      )
      if (sanitized.redacted !== 1 || sanitized.text.includes(fakeSecret) || !sanitized.text.includes(marker)) {
        throw new Error('synthetic Honcho content was not sanitized')
      }
      await ctx.honcho.record({
        deliveryId: sha256(`recursus-honcho-live:${runId}`),
        scope,
        messages: [{
          role: 'assistant',
          peerId: assistantPeerId,
          content: sanitized.text,
          createdAt: new Date().toISOString(),
          metadata: { synthetic: true, content_classification: 'recursus-acceptance' },
        }],
        signal: controller.signal,
      })
      const deliveryDeadline = Date.now() + 90_000
      while (Date.now() < deliveryDeadline) {
        await ctx.honcho.drainOnce()
        const status = ctx.honcho.status()
        if (status.pendingDeliveries === 0 && (status.deliveredCount ?? 0) >= 1) break
        await delay(250)
      }
      const delivered = ctx.honcho.status()
      if (delivered.pendingDeliveries !== 0 || (delivered.deliveredCount ?? 0) < 1) {
        throw new Error('synthetic Honcho delivery did not drain')
      }
      const searchDeadline = Date.now() + 120_000
      while (Date.now() < searchDeadline) {
        const result = await ctx.honcho.search({
          scope,
          query: marker,
          includeUserRepresentation: false,
          projectOnly: true,
          maxItems: 5,
          maxCharacters: 1024,
          signal: controller.signal,
        })
        if (result.items.some((item) => item.text.includes(marker) && !item.text.includes(fakeSecret))) {
          roundTripPassed = true
          break
        }
        await delay(1_000)
      }
      if (!roundTripPassed) throw new Error('sanitized Honcho round trip did not become searchable')
    } finally {
      clearTimeout(timer)
      controller.abort()
    }
  } catch {
    operationFailure = new Error('live Honcho synthetic round trip failed')
  }
  if (ctx !== undefined) {
    try {
      await ctx.fiber.dispose()
    } catch {
      operationFailure ??= new Error('live Honcho provider disposal failed')
    }
  }
  if (workspaceAttempted) {
    try {
      await cleanupHonchoWorkspace(client, workspaceId, runId)
      await writeFile(
        path.join(realResourceRoot, `${runId}.cleaned.json`),
        `${JSON.stringify({ ...resourceDocument, cleanupVerified: true }, null, 2)}\n`,
        { encoding: 'utf8', flag: 'wx' },
      )
    } catch {
      throw new Error('live Honcho fenced cleanup failed')
    }
  }
  if (operationFailure !== undefined) throw operationFailure
  return { status: 'passed', mode: 'live', sanitizedRoundTrip: roundTripPassed, cleanupVerified: true }
}

async function disabledHonchoStartup(load: (name: string) => Promise<ModuleRecord>): Promise<void> {
  const cordis = await load('@deepseek-ai/cordis')
  const testkit = await load('@deepseek-ai/dsh-agent-loop-testkit')
  const loop = await load('@deepseek-ai/dsh-agent-loop')
  const Context = named<new () => SmokeContext>(cordis, 'Context')
  const ctx = new Context()
  try {
    await named<(context: unknown) => Promise<void>>(testkit, 'mountAgentLoopTestDependencies')(ctx)
    await ctx.plugin(defaultExport(loop), { agents: [] })
    if (ctx.honcho !== undefined) throw new Error('Honcho unexpectedly mounted in disabled startup')
  } finally {
    await ctx.fiber.dispose()
  }
}

async function deterministicSmoke(load: (name: string) => Promise<ModuleRecord>, runtimeRoot: string): Promise<Record<string, unknown>> {
  const [cordis, testkit, loop, approval, subagent, spawn, llm, session, tools, jupyter, fakeHoncho, artifactMemory, skillRegistry, dovetail, toolSkill] = await Promise.all([
    load('@deepseek-ai/cordis'),
    load('@deepseek-ai/dsh-agent-loop-testkit'),
    load('@deepseek-ai/dsh-agent-loop'),
    load('@deepseek-ai/dsh-user-approval'),
    load('@deepseek-ai/dsh-subagent'),
    load('@deepseek-ai/dsh-subagent-spawn-in-process'),
    load('@deepseek-ai/dsh-llm'),
    load('@deepseek-ai/dsh-session'),
    load('@deepseek-ai/dsh-tools'),
    load('@deepseek-rlm/dsh-rlm-jupyter'),
    load('@deepseek-honcho/dsh-honcho/testkit'),
    load('@deepseek-honcho/dsh-artifact-memory'),
    load('@deepseek-ai/dsh-skill'),
    load('deepseek-dovetail'),
    load('@deepseek-ai/dsh-tool-skill'),
  ])
  const Context = named<new () => SmokeContext>(cordis, 'Context')
  const SessionId = named<(value: string) => unknown>(session, 'SessionId')
  const CallId = named<(value: string) => unknown>(llm, 'CallId')
  const createUserMessage = named<(value: unknown) => unknown>(llm, 'createUserMessage')
  const LlmAdapter = named<new () => object>(llm, 'LlmAdapter')
  const defineTool = named<(value: unknown) => unknown>(tools, 'defineTool')
  const ctx = new Context()
  const sessionId = 'recursus-m1-smoke'
  const workspace = path.join(runtimeRoot, 'workspace')
  const rlmRoot = path.join(runtimeRoot, 'rlm')
  const artifactRoot = path.join(runtimeRoot, 'artifacts')
  const managedRuntimeRoot = path.join(runtimeRoot, 'python-runtime')
  await mkdir(workspace, { recursive: true })
  let localToolValue: Record<string, unknown> | undefined
  try {
    await named<(context: unknown) => Promise<void>>(testkit, 'mountAgentLoopTestDependencies')(ctx)
    await ctx.plugin(defaultExport(loop), { agents: [] })
    await ctx.plugin(defaultExport(approval))
    await ctx.plugin(defaultExport(subagent))
    await ctx.plugin(spawn, { providerName: 'rlm-spawn' })
    await ctx.plugin(defaultExport(skillRegistry))
    await ctx.plugin(named(dovetail, 'Host'))
    await ctx.plugin(toolSkill)
    await ctx.plugin(named(fakeHoncho, 'FakeHonchoMemory'), {
      workspaceId: 'recursus_synthetic_workspace',
      userPeerId: 'recursus_synthetic_user',
      assistantPeerId: 'recursus_synthetic_assistant',
      projectId: 'recursus_synthetic_project',
    })
    await ctx.plugin(defaultExport(artifactMemory), {
      enabled: true,
      artifactRoot,
      rlmArtifactRoot: rlmRoot,
      repositoryRoot: workspace,
      projectId: 'recursus_synthetic_project',
      assistantPeerId: 'recursus_synthetic_assistant',
      recordTool: true,
      resolveTool: true,
      remoteIndexing: false,
      integrityMode: 'always',
      maxArtifactBytes: 1024 * 1024,
      maxProjectBytes: 2 * 1024 * 1024,
      reconciliationIntervalMs: 60_000,
    })
    await ctx.plugin(defaultExport(jupyter), {
      artifactRoot: rlmRoot,
      managedRuntimeRoot,
      subagentProvider: 'rlm-spawn',
      maxOutputBytes: 64 * 1024,
      snapshot: { policy: 'after-cell', maxBytes: 1024 * 1024, maxVariableBytes: 512 * 1024 },
    })

    class ScriptedAdapter extends LlmAdapter {
      readonly script = [toolResponse(CallId('recursus-probe-call')), textResponse('RECURSUS_SMOKE_OK')]

      resolveModel(provider: string, model: string) {
        return Promise.resolve({ provider, id: model, name: 'Recursus deterministic smoke' })
      }

      async *stream() {
        const response = this.script.shift()
        if (response === undefined) throw new Error('deterministic LLM script exhausted')
        for (const chunk of response) yield chunk
      }
    }
    ctx.llm.registerAdapter(['recursus-smoke'], new ScriptedAdapter())
    ctx.tools.register(defineTool({
      name: 'recursus_local_probe',
      description: 'Return one fixed synthetic local value without external mutation.',
      parameters: { marker: { type: 'string', required: true } },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: { accepted: { type: 'boolean', required: true }, marker: { type: 'string', required: true } },
        },
        render: (_arguments: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      isConcurrencySafe: () => true,
      execute: (arguments_: Record<string, unknown>) => {
        localToolValue = { accepted: arguments_.marker === 'recursus-smoke', marker: 'fixed-result' }
        return Promise.resolve(localToolValue)
      },
    }))
    ctx.on('tools/pre-execute', async (execution: unknown, next: unknown) => {
      const item = execution as { readonly name?: string }
      if (item.name === 'recursus_local_probe') return { kind: 'ask', reason: 'bounded synthetic local probe' }
      return await (next as () => Promise<unknown>)()
    })
    ctx.on('approval/request', () => Promise.resolve('allowed-once'))

    const agent = ctx.agentLoop.create(SessionId(sessionId), { provider: 'recursus-smoke', model: 'fixed' }, { cwd: workspace })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Run the fixed local smoke probe.' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    if (localToolValue === undefined) throw new Error('local smoke tool was not executed')
    const eventTypes = agent.session.events.map((event) => event.type)
    for (const event of ['approval/asked', 'approval/decided', 'tool/call', 'tool/result']) {
      if (!eventTypes.includes(event)) throw new Error(`DSH did not record ${event}`)
    }

    const controller = new AbortController()
    const first = await ctx.rlm.execute({
      agent,
      callId: CallId('recursus-rlm-set'),
      code: [
        'from pathlib import Path',
        'import os',
        'recursus_value = 38',
        'exports = Path(os.environ["RLM_SESSION_DIR"]) / "exports"',
        'exports.mkdir(parents=True, exist_ok=True)',
        '(exports / "synthetic.txt").write_bytes(b"recursus-artifact-v1\\n")',
      ].join('\n'),
      signal: controller.signal,
    })
    const second = await ctx.rlm.execute({ agent, callId: CallId('recursus-rlm-read'), code: 'recursus_value + 4', signal: controller.signal })
    if (first.status !== 'ok' || second.status !== 'ok' || second.result !== '42' || first.generation !== second.generation) {
      throw new Error('persistent RLM computation failed')
    }
    const kernel = ctx.rlm.info(agent)
    if (kernel === undefined || kernel.generation !== second.generation) throw new Error('RLM kernel identity changed')

    const sourcePath = path.join(rlmRoot, 'sessions', sessionId, 'exports', 'synthetic.txt')
    const sourceBytes = await readFile(sourcePath)
    const expectedHash = sha256(sourceBytes)
    const recorded = assertResult(await ctx.tools.execute({
      callId: CallId('recursus-artifact-record'),
      name: 'memory_artifact_record',
      arguments: {
        source_path: sourcePath,
        title: 'Synthetic bounded result',
        summary: 'Fixed acceptance artifact generated by the persistent kernel.',
        query_fingerprint: sha256('recursus-m1-synthetic-query'),
        source: 'recursus-smoke',
        source_version: 'synthetic-v1',
        media_type: 'text/plain',
        shape: 'one fixed line',
        tags: ['synthetic', 'acceptance'],
      },
      agent,
      signal: controller.signal,
    }), 'artifact record')
    if (recorded.sha256 !== expectedHash || recorded.bytes !== sourceBytes.byteLength || typeof recorded.experiment_id !== 'string') {
      throw new Error('artifact record identity differs from exact source bytes')
    }
    const resolved = assertResult(await ctx.tools.execute({
      callId: CallId('recursus-artifact-resolve'),
      name: 'memory_artifact_resolve',
      arguments: { experiment_id: recorded.experiment_id, current_source_version: 'synthetic-v1' },
      agent,
      signal: controller.signal,
    }), 'artifact resolve')
    if (typeof resolved.path !== 'string' || sha256(await readFile(resolved.path)) !== expectedHash) throw new Error('artifact exact resolution failed')

    const skills = await ctx.skills.list({ cwd: workspace, signal: controller.signal, scope: agent })
    const promptSkill = skills.find((skill) => skill.name === 'prompt-engineering')
    if (promptSkill?.provider !== 'dovetail') throw new Error('packaged Dovetail skill was not discovered')
    const invoked = assertResult(await ctx.tools.execute({
      callId: CallId('recursus-skill-invoke'),
      name: 'skill',
      arguments: { name: 'prompt-engineering' },
      agent,
      signal: controller.signal,
    }), 'Dovetail skill invocation')
    if (invoked.name !== 'prompt-engineering' || invoked.provider !== 'dovetail' || typeof invoked.content !== 'string' || invoked.content.length === 0) {
      throw new Error('packaged Dovetail skill invocation failed')
    }

    return {
      toolApproval: {
        status: 'passed',
        auditEvents: ['approval/asked', 'approval/decided', 'tool/call', 'tool/result'],
        toolResultSha256: sha256(JSON.stringify(localToolValue)),
      },
      rlm: { status: 'passed', result: '42', generation: second.generation, persistent: true },
      artifact: { status: 'passed', bytes: sourceBytes.byteLength, sha256: expectedHash, exactResolution: true },
      dovetail: { status: 'passed', provider: 'dovetail', skill: 'prompt-engineering', discovered: true, invoked: true },
    }
  } finally {
    await ctx.fiber.dispose()
  }
}

async function main(): Promise<void> {
  const arguments_ = argumentsMap()
  const profile = required(arguments_, '--profile')
  const workRoot = required(arguments_, '--work-root')
  const assemblyId = required(arguments_, '--assembly-id')
  const revisions = JSON.parse(required(arguments_, '--revisions')) as Record<string, string>
  const modules = await profileModuleLoader(profile)
  const runtimeRoot = await mkdtemp(path.join(workRoot, 'assembled-smoke-'))
  const liveHonchoResourceRoot = path.join(workRoot, 'live-honcho-resources')
  const honchoApiKey = arguments_.has('--live-honcho') ? process.env.HONCHO_API_KEY : undefined
  delete process.env.HONCHO_API_KEY
  if (arguments_.has('--live-honcho') && (honchoApiKey === undefined || honchoApiKey.length === 0)) {
    throw new Error('HONCHO_API_KEY is required for live acceptance')
  }
  try {
    await disabledHonchoStartup(modules.load)
    const deterministic = await deterministicSmoke(modules.load, runtimeRoot)
    const codexProvider = arguments_.has('--live-codex')
      ? await liveCodex(modules.load, runtimeRoot, required(arguments_, '--codex-auth-file'))
      : { status: 'not-run', mode: 'not-run', bounded: false }
    const honchoLive = arguments_.has('--live-honcho')
      ? await liveHoncho(modules, runtimeRoot, liveHonchoResourceRoot, honchoApiKey as string)
      : { status: 'not-run', mode: 'not-run', sanitizedRoundTrip: false, cleanupVerified: false }
    const report = {
      schemaVersion: 1,
      assemblyId,
      platform: process.platform === 'win32' ? 'windows-x64' : 'linux-x64',
      componentRevisions: revisions,
      checks: {
        codexProvider,
        ...deterministic,
        honchoDisabled: { status: 'passed', startupPassed: true },
        honchoLive,
      },
    }
    process.stdout.write(`${REPORT_PREFIX}${JSON.stringify(report)}\n`)
  } finally {
    const relative = path.relative(workRoot, runtimeRoot)
    if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('unsafe smoke cleanup path')
    await rm(runtimeRoot, { recursive: true, force: true })
  }
}

await main()
