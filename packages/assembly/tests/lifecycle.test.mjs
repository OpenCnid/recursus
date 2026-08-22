import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ASSEMBLY_LIFECYCLE_STEPS,
  runAdapterLifecycle,
} from '../lib/index.js'

const component = {
  name: 'synthetic-component',
}

function adapter(events, overrides = {}) {
  return Object.fromEntries(ASSEMBLY_LIFECYCLE_STEPS.map((step) => [
    step,
    overrides[step] ?? (async () => {
      events.push(step)
      return { status: 'passed', evidence: { step } }
    }),
  ]))
}

test('the runner invokes the common lifecycle in normative order', async () => {
  const events = []
  const results = await runAdapterLifecycle(adapter(events), {
    component,
    workRoot: 'X:\\synthetic',
  })
  assert.deepEqual(events, ASSEMBLY_LIFECYCLE_STEPS)
  assert.deepEqual(results.map((result) => result.step), ASSEMBLY_LIFECYCLE_STEPS)
  assert.ok(results.every((result) => result.component === component.name && result.status === 'passed'))
  assert.ok(Object.isFrozen(results))
})

test('a bounded acquisition slice stops after exact revision verification', async () => {
  const events = []
  const results = await runAdapterLifecycle(adapter(events), {
    component,
    workRoot: '/synthetic',
  }, 'verifyRevision')
  assert.deepEqual(events, ['inspect', 'acquire', 'verifyRevision'])
  assert.equal(results.length, 3)
})

test('a failing phase prevents every later phase', async () => {
  const events = []
  const subject = adapter(events, {
    acquire: async () => {
      events.push('acquire')
      throw new Error('synthetic acquisition failure')
    },
  })
  await assert.rejects(() => runAdapterLifecycle(subject, { component, workRoot: '/synthetic' }))
  assert.deepEqual(events, ['inspect', 'acquire'])
})

test('missing phases, non-JSON evidence, and oversized evidence are rejected', async () => {
  const events = []
  const incomplete = adapter(events)
  delete incomplete.pack
  await assert.rejects(() => runAdapterLifecycle(incomplete, { component, workRoot: '/synthetic' }), {
    code: 'INVALID_COMPONENT_ADAPTER',
  })

  const cyclic = {}
  cyclic.self = cyclic
  await assert.rejects(() => runAdapterLifecycle(adapter([], {
    inspect: async () => ({ status: 'passed', evidence: cyclic }),
  }), { component, workRoot: '/synthetic' }), { code: 'INVALID_ADAPTER_RESULT' })

  await assert.rejects(() => runAdapterLifecycle(adapter([], {
    inspect: async () => ({ status: 'passed', evidence: { output: 'x'.repeat(20_000) } }),
  }), { component, workRoot: '/synthetic' }), { code: 'ADAPTER_EVIDENCE_TOO_LARGE' })
})
