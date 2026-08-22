import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'
import {
  AssemblyError,
  runAssembledSmoke,
  validateAssembledSmokeReport,
} from '../lib/index.js'

const temporaryRoots = []
const revisions = {
  'deepseek-dovetail': '1111111111111111111111111111111111111111',
  'deepseek-harness': '2222222222222222222222222222222222222222',
  'deepseek-honcho': '3333333333333333333333333333333333333333',
  'deepseek-openai-codex': '4444444444444444444444444444444444444444',
  'deepseek-rlm': '5555555555555555555555555555555555555555',
}

function report(overrides = {}) {
  return {
    schemaVersion: 1,
    assemblyId: 'recursus-m1',
    platform: process.platform === 'win32' ? 'windows-x64' : 'linux-x64',
    componentRevisions: revisions,
    checks: {
      codexProvider: { status: 'not-run', mode: 'not-run', bounded: false },
      toolApproval: {
        status: 'passed',
        auditEvents: ['approval/asked', 'approval/decided', 'tool/call', 'tool/result'],
        toolResultSha256: 'a'.repeat(64),
      },
      rlm: { status: 'passed', result: '42', generation: 1, persistent: true },
      honchoDisabled: { status: 'passed', startupPassed: true },
      honchoLive: {
        status: 'not-run', mode: 'not-run', sanitizedRoundTrip: false, cleanupVerified: false,
      },
      artifact: { status: 'passed', bytes: 21, sha256: 'b'.repeat(64), exactResolution: true },
      dovetail: {
        status: 'passed', provider: 'dovetail', skill: 'prompt-engineering', discovered: true, invoked: true,
      },
      ...overrides,
    },
  }
}

function manifest() {
  return {
    assemblyId: 'recursus-m1',
    components: Object.entries(revisions).map(([name, revision]) => ({ name, revision })),
  }
}

async function temporaryDirectory(prefix) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix))
  temporaryRoots.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test('accepts deterministic-disabled and explicitly live smoke evidence', () => {
  assert.deepEqual(validateAssembledSmokeReport(report()), report())
  const live = report({
    codexProvider: { status: 'passed', mode: 'live', bounded: true },
    honchoLive: { status: 'passed', mode: 'live', sanitizedRoundTrip: true, cleanupVerified: true },
  })
  assert.deepEqual(validateAssembledSmokeReport(live), live)
})

test('rejects extra fields and internally inconsistent provider evidence', () => {
  assert.throws(
    () => validateAssembledSmokeReport({ ...report(), checkoutRoot: 'C:\\developer\\recursus' }),
    (error) => error instanceof AssemblyError && error.code === 'INVALID_SMOKE_REPORT',
  )
  assert.throws(
    () => validateAssembledSmokeReport(report({
      codexProvider: { status: 'passed', mode: 'not-run', bounded: true },
    })),
    (error) => error instanceof AssemblyError && error.code === 'INVALID_SMOKE_REPORT',
  )
  assert.throws(
    () => validateAssembledSmokeReport(report({
      honchoLive: { status: 'passed', mode: 'live', sanitizedRoundTrip: true, cleanupVerified: false },
    })),
    (error) => error instanceof AssemblyError && error.code === 'INVALID_SMOKE_REPORT',
  )
})

test('requires absolute smoke paths before launching the assembled worker', async () => {
  await assert.rejects(
    runAssembledSmoke({ manifest: manifest(), workRoot: 'relative-work', profileDirectory: 'relative-profile' }),
    (error) => error instanceof AssemblyError && error.code === 'SMOKE_PATH_NOT_ABSOLUTE',
  )
})

test('rejects profiles outside or equal to the explicit work root', async () => {
  const workRoot = await temporaryDirectory('recursus-smoke-work-')
  const outside = await temporaryDirectory('recursus-smoke-outside-')
  await assert.rejects(
    runAssembledSmoke({ manifest: manifest(), workRoot, profileDirectory: outside }),
    (error) => error instanceof AssemblyError && error.code === 'SMOKE_BOUNDARY_ESCAPE',
  )
  await assert.rejects(
    runAssembledSmoke({ manifest: manifest(), workRoot, profileDirectory: workRoot }),
    (error) => error instanceof AssemblyError && error.code === 'SMOKE_BOUNDARY_ESCAPE',
  )
})

test('requires an explicit absolute auth file for an opted-in Codex check', async () => {
  const workRoot = await temporaryDirectory('recursus-smoke-auth-')
  const profileDirectory = path.join(workRoot, 'profile')
  await mkdir(profileDirectory)
  await assert.rejects(
    runAssembledSmoke({ manifest: manifest(), workRoot, profileDirectory, liveCodex: true }),
    (error) => error instanceof AssemblyError && error.code === 'CODEX_AUTH_FILE_REQUIRED',
  )
  await assert.rejects(
    runAssembledSmoke({
      manifest: manifest(), workRoot, profileDirectory, liveCodex: true, codexAuthFile: 'relative-auth.json',
    }),
    (error) => error instanceof AssemblyError && error.code === 'CODEX_AUTH_FILE_REQUIRED',
  )
})

test('requires an explicit host credential for an opted-in Honcho check', async () => {
  const workRoot = await temporaryDirectory('recursus-smoke-honcho-')
  const profileDirectory = path.join(workRoot, 'profile')
  await mkdir(profileDirectory)
  await assert.rejects(
    runAssembledSmoke({
      manifest: manifest(),
      workRoot,
      profileDirectory,
      liveHoncho: true,
      environment: { PATH: process.env.PATH },
    }),
    (error) => error instanceof AssemblyError && error.code === 'HONCHO_CREDENTIAL_REQUIRED',
  )
})
