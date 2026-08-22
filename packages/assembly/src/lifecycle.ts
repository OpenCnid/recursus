import { AssemblyError } from './errors.js'
import {
  ASSEMBLY_LIFECYCLE_STEPS,
  type AdapterContext,
  type AdapterStepResult,
  type AssemblyLifecycleStep,
  type ComponentAdapter,
  type JsonValue,
  type LifecycleResult,
} from './types.js'

const MAX_EVIDENCE_BYTES = 16 * 1024

function assertJson(value: unknown, path: string, seen: Set<unknown>): asserts value is JsonValue {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new AssemblyError('INVALID_ADAPTER_RESULT', `${path} contains a non-finite number`)
    }
    return
  }
  if (typeof value !== 'object' || seen.has(value)) {
    throw new AssemblyError('INVALID_ADAPTER_RESULT', `${path} is not acyclic JSON data`)
  }
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((item, index) => { assertJson(item, `${path}[${String(index)}]`, seen) })
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new AssemblyError('INVALID_ADAPTER_RESULT', `${path} must be a plain object`)
    }
    for (const [key, item] of Object.entries(value)) assertJson(item, `${path}.${key}`, seen)
  }
  seen.delete(value)
}

function validateStepResult(step: AssemblyLifecycleStep, value: unknown): AdapterStepResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AssemblyError('INVALID_ADAPTER_RESULT', `${step} returned no result object`)
  }
  const result = value as Record<string, unknown>
  if (Object.keys(result).sort().join('\0') !== ['evidence', 'status'].join('\0') || result.status !== 'passed') {
    throw new AssemblyError('INVALID_ADAPTER_RESULT', `${step} returned fields or status outside the adapter contract`)
  }
  if (result.evidence === null || typeof result.evidence !== 'object' || Array.isArray(result.evidence)) {
    throw new AssemblyError('INVALID_ADAPTER_RESULT', `${step} evidence must be an object`)
  }
  assertJson(result.evidence, `${step}.evidence`, new Set())
  const encoded = JSON.stringify(result.evidence)
  if (Buffer.byteLength(encoded, 'utf8') > MAX_EVIDENCE_BYTES) {
    throw new AssemblyError('ADAPTER_EVIDENCE_TOO_LARGE', `${step} evidence exceeds ${String(MAX_EVIDENCE_BYTES)} bytes`)
  }
  return Object.freeze({
    status: 'passed',
    evidence: Object.freeze(structuredClone(result.evidence as Record<string, JsonValue>)),
  })
}

/** Fail before execution when an adapter omits any phase from the shared lifecycle. */
export function assertAdapterContract(adapter: unknown): asserts adapter is ComponentAdapter {
  if (adapter === null || typeof adapter !== 'object') {
    throw new AssemblyError('INVALID_COMPONENT_ADAPTER', 'component adapter must be an object')
  }
  for (const step of ASSEMBLY_LIFECYCLE_STEPS) {
    if (typeof (adapter as Record<string, unknown>)[step] !== 'function') {
      throw new AssemblyError('INVALID_COMPONENT_ADAPTER', `component adapter is missing ${step}`)
    }
  }
}

/**
 * Execute lifecycle phases once, in the normative order, through an optional
 * stopping point. A rejected phase stops the run and later phases are never
 * invoked.
 */
export async function runAdapterLifecycle(
  adapterValue: unknown,
  context: AdapterContext,
  through: AssemblyLifecycleStep = 'inspectPackage',
): Promise<readonly LifecycleResult[]> {
  assertAdapterContract(adapterValue)
  const stopIndex = ASSEMBLY_LIFECYCLE_STEPS.indexOf(through)
  if (stopIndex < 0) throw new AssemblyError('INVALID_LIFECYCLE_STEP', 'requested lifecycle stopping point is unknown')
  const results: LifecycleResult[] = []
  for (const step of ASSEMBLY_LIFECYCLE_STEPS.slice(0, stopIndex + 1)) {
    if (context.signal?.aborted === true) {
      throw new AssemblyError('ASSEMBLY_ABORTED', `${context.component.name} lifecycle was cancelled before ${step}`)
    }
    const result = validateStepResult(step, await adapterValue[step](context))
    results.push(Object.freeze({
      component: context.component.name,
      step,
      ...result,
    }))
  }
  return Object.freeze(results)
}
