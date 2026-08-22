# Recursus foundation specification

Status: normative foundation contract

## 1. Product identity

Recursus is an independent OpenCnid runtime-agent distribution built on DeepSeek Harness and separately versioned OpenCnid components. It is not a fork renamed to obscure its upstream, and it is not an official product of DeepSeek, OpenAI, Honcho, Plastic Labs, Prime Agent, Project Jupyter, or any other upstream project.

Original Recursus work is MIT licensed. Referenced, consumed, or later assembled components retain their own terms.

## 2. Control-plane rule

DeepSeek Harness MUST remain the only agent runtime and control plane. It owns:

- root and child agent loops;
- sessions and committed event history;
- tools, policy, approvals, and telemetry;
- model-provider selection;
- agent lineage and cancellation;
- UI and plugin lifecycle.

Recursus MUST extend DSH through published or deliberately reviewed service and plugin seams. It MUST NOT introduce an independent hidden agent loop.

## 3. Component ownership

| Component | Owns | Does not own |
| --- | --- | --- |
| DSH | agent control plane | semantic memory or RLM computation |
| Codex adapter | OAuth-backed Codex provider integration | agent policy, tools, or task state |
| RLM | persistent Python, snapshots, recursive compute | authoritative cross-session truth |
| Honcho integration | semantic memory and sanitized experiment discovery | active task state or exact artifact bytes |
| Artifact memory | immutable project-local bytes and exact resolution | general transcript or policy |
| Dovetail | packaged workflows and evaluation methods | agent runtime or global skill truth |
| Recursus | assembly, durable runs, supervision, verification, coordination, context, routing, releases | component internals already owned elsewhere |

## 4. Full-access operating model

Recursus MAY run commands, Python, tools, and child agents with the host access intentionally granted by its operator. Recursus MUST describe this accurately and MUST NOT claim that ordinary runtime checks are a security sandbox.

The full-access model does not remove operational invariants:

- destructive targets MUST be resolved exactly;
- unrelated user changes MUST be preserved;
- credentials MUST remain outside model context and packaged artifacts;
- irreversible external actions MUST remain explicit and auditable;
- retries of external mutations MUST be idempotent or operator-confirmed;
- completion MUST be evidence-based.

## 5. Component lock

Every assembly MUST resolve from a versioned component manifest. Mutable branch names alone are insufficient release inputs. Each component MUST have:

- immutable revision;
- source repository;
- role;
- package or build version;
- license or notice-defined licensing status;
- package hashes before release;
- compatibility and verification evidence.

Changing a component revision is a reviewed compatibility change.

## 6. Licensing and attribution

The Recursus MIT license applies only to original Recursus files unless another file states otherwise. A Recursus release MUST preserve the license and notice closure of all distributed components.

Components without a selected permissive license MAY be referenced and tested as external repositories but MUST NOT be copied, relicensed, or redistributed in a Recursus release until the owner authorizes appropriate terms.

Attribution MUST be specific, prominent, and non-endorsement-aware. Credit MUST NOT imply that upstream maintainers approve Recursus.

## 7. Durable run service

The run service MUST be a DSH-native, provider-neutral service. It MUST persist versioned events and expose a materialized projection. Run state MUST be project-scoped and MUST distinguish planning, execution, waiting, verification, completion, failure, cancellation, and blockage.

Run state MUST be authoritative for the active objective, acceptance criteria, plan, evidence, budgets, and next action. Honcho MAY help recall related history but MUST NOT be the run-state provider.

Event writes MUST be atomic and concurrency-safe. Unknown future schema versions MUST fail explicitly rather than being guessed.

## 8. External mutation identity

Every material external mutation SHOULD have a deterministic or durably recorded identity sufficient to prevent accidental replay after restart. Examples include tool call ID, delivery ID, commit, PR, deployment operation, or provider idempotency key.

The runtime MUST distinguish:

- not attempted;
- in progress;
- succeeded;
- failed before success;
- ambiguous success;
- verified success.

Ambiguous success MUST be reconciled before retry where the provider exposes a safe lookup.

## 9. Execution supervision

The supervisor MUST keep bounded, content-conscious metadata for active executions: owner run/step, command class, working directory authority, process identity, start time, health, output cursor, restart policy, and exit state.

It MUST NOT duplicate terminal output into Honcho. It MUST propagate cancellation through the intended execution hierarchy and represent lost processes explicitly after restart.

## 10. Completion contracts

A run MUST NOT be marked complete merely because the model says it is finished. Completion requires all mandatory contract gates to have passing evidence or explicit operator waivers.

Verifier results MUST include gate identity, status, timestamp, bounded evidence reference, and next action when failing. Current repository tests and CI remain authoritative over remembered outcomes.

## 11. Delegation

Child work MUST be attached to a parent run and bounded by an objective, expected result, context policy, ownership, budget, and cancellation relationship. Children MUST NOT impersonate the human peer or automatically train human memory.

The parent remains responsible for integration and verification. Parallel mutable work MUST use compatible ownership or isolated worktrees.

## 12. Context compilation

Context selection MUST be bounded and source-labeled. DSH policy, active run state, current files/tests, and explicit corrections MUST outrank artifacts and Honcho recall. Memory MUST be represented as fallible and untrusted.

Selected context SHOULD carry trust, freshness, source, size, and selection-reason metadata. Injected context MUST NOT be automatically captured as a new human exchange.

## 13. Routing

Automated model, reasoning-effort, RLM, and delegation routing MUST be observable, bounded, and subordinate to explicit operator choices. Routing MUST NOT bypass DSH tool policy or credential boundaries.

Routing promotion requires paired evaluation against a fixed baseline using task success, latency, and resource usage.

## 14. Release integrity

A Recursus release MUST include or link:

- immutable component revisions;
- package hashes;
- platform and toolchain versions;
- full third-party notices;
- content-free verification evidence;
- installation and removal instructions;
- known limitations;
- proof that artifacts contain no credentials or developer paths.

No release MAY claim support for an untested DSH or component version.

## 15. Definition of Done for the first runtime release

The first versioned Recursus runtime is done only when:

1. a clean Windows system can build and install the pinned assembly with one documented workflow;
2. the assembled profile exposes the model provider, RLM, memory, artifacts, and skills;
3. a durable task survives host restart and resumes at the next incomplete step;
4. an external mutation is not duplicated during recovery;
5. a long-running process and CI check can be resumed or classified correctly;
6. completion is prevented until required verification gates pass;
7. bounded child work can execute concurrently and integrate cleanly;
8. context remains within budget and preserves authority ordering;
9. the end-to-end evaluation performs a real repository change through post-merge CI;
10. license, provenance, package, secret, and path checks pass;
11. every remaining limitation is documented;
12. publication receives explicit operator approval.
