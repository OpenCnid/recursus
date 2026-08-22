# Recursus runtime specification

Status: normative implementation contract

Version: `0.1-draft`

Current implementation milestone: Milestone 1 — reproducible runtime assembly

Last updated: 2026-08-22

This specification turns the delivery sequence in `GAMEPLAN.md` into testable product and engineering requirements. If prose in the game plan and this document conflict, this document controls. `README.md` explains the product, `docs/ARCHITECTURE.md` explains the topology, and `THIRD_PARTY_NOTICES.md` controls attribution and license-boundary details.

Milestone 0 is complete. It MUST NOT be rebuilt unless its recorded evidence is found invalid. Work starts at the first unmet acceptance criterion in Milestone 1.

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

## 16. Requirement language and scope

The words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are normative. Acceptance criteria are cumulative: a later milestone inherits every applicable invariant from earlier milestones.

Recursus is an integration distribution and a set of DSH-native runtime services. It owns only integration-specific source, schemas, adapters, release tooling, and evidence. Generic component behavior belongs in the component repository named in `manifests/components.json`.

The supported initial host matrix is:

- Windows on `x64`, using PowerShell for operator-facing examples;
- Linux on `x64`, using a POSIX shell for operator-facing examples;
- Node.js `22.19.0` for the reproducible build baseline;
- the exact component revisions in `manifests/components.json`.

Additional platforms or component revisions are unsupported until their acceptance matrix passes and the lock is updated in review.

## 17. Global engineering invariants

Every milestone MUST preserve these rules:

1. DSH remains the sole agent loop, ToolRuntime authority, session owner, lifecycle host, and policy boundary.
2. Provider consumers depend on abstract service contracts rather than concrete SDKs whenever an existing seam permits it.
3. Credentials remain in host-owned configuration. They MUST NOT enter model context, RLM namespaces, events, fixtures, evidence, packages, logs, Honcho cards, or artifact storage.
4. Local project identity comes from DSH configuration and canonical repository identity. The model MUST NOT choose arbitrary project, peer, session, credential, storage root, or authorization scope.
5. Writes are atomic where the platform permits it. Versioned data either validates completely or fails explicitly; unknown schema versions are not guessed.
6. Retried external mutations use a deterministic identity or reconcile an ambiguous result before another attempt.
7. Current files, tests, Git state, CI, explicit corrections, DSH policy, and durable run state outrank recalled memory.
8. Full host access is intentional. Exact-target checks, approval gates, least-egress behavior, and evidence requirements still apply.
9. Windows and POSIX paths MUST be tested as components, not compared by vulnerable string prefixes. Installation and removal MUST reject traversal, prefix collisions, and targets outside the configured profile root.
10. Release and test inputs use synthetic content. Live-provider tests are opt-in, isolated, bounded, and independent of personal memory or production data.
11. Logs and evidence are content-conscious: record identifiers, hashes, status, timing, and bounded diagnostic excerpts, not full transcripts, artifacts, environment dumps, or terminal histories.
12. No milestone may silently weaken a component's license, provenance, privacy, or security boundary.

## 18. Repository and package boundaries

The repository SHOULD converge on these integration-owned surfaces as milestones require them:

```text
manifests/          immutable component and release locks
packages/assembly  source acquisition, build, pack, profile assembly
packages/run-state versioned run events and materialized projections
packages/supervisor execution handles, cursors, health, and wakeups
packages/verifier  completion contracts and verifier registry
packages/coordinator bounded delegation and ownership arbitration
packages/context   authority-ordered context compilation
packages/router    observable model, compute, and delegation routing
packages/operator  operator-facing status and control integration
scripts/            narrow repository verification and release entry points
tests/              cross-package and real assembled acceptance tests
evaluations/        versioned scenarios and content-free measured results
docs/               operator, architecture, security, and release guidance
```

These names define ownership, not a requirement to create empty packages. A package MUST appear only when a milestone needs executable behavior. Shared contracts MUST be small, versioned, provider-neutral, and free of cyclic imports. Component source MUST NOT be vendored into these directories.

## 19. Milestone 0 — foundation acceptance record

Milestone 0 is accepted by the public repository state established in commit `d8425e54102d3d144f2b1f6f125c0581cee952ed` and its passing Windows and Ubuntu CI run.

The accepted foundation contains:

- the public `OpenCnid/recursus` repository under MIT for original Recursus work;
- the preserved private predecessor `OpenCnid/recursus-idea` as a distinct repository;
- five immutable component revisions and nested dependency pins;
- explicit credit, license boundaries, non-endorsement language, and security posture;
- a cross-platform foundation verifier.

Future work MAY amend documentation or strengthen verification, but MUST NOT import private predecessor history, erase attribution, or represent referenced component code as Recursus MIT code.

## 20. Milestone 1 — reproducible runtime assembly

### 20.1 Objective

Produce an inspected, reproducible local Recursus distribution from the exact component lock without copying component history into this repository.

### 20.2 Assembly manifest

Milestone 1 MUST introduce a versioned assembly schema that records, per component:

- logical name and role;
- repository and immutable revision;
- expected license/notice status;
- source acquisition method;
- required toolchain and package manager;
- deterministic build and verification entry points;
- pack output selectors;
- SHA-256 and byte size of every accepted package;
- DSH profile configuration contribution;
- platform support and compatibility constraints.

The checked-in source lock is human-reviewable. Generated integrity output MUST be deterministic for the same accepted package bytes and MUST omit timestamps or machine paths that would make equality meaningless.

### 20.3 Component adapters

Each adapter MUST implement the same lifecycle:

```text
inspect → acquire → verify revision → restore dependencies → verify source → build → pack → inspect package
```

Adapters MUST invoke a component's own lockfile, package manager, build, tests, and pack mechanism. An adapter MUST NOT rewrite component source to make assembly convenient. Source checkouts and caches live beneath an explicitly configured Recursus work root and are excluded from release packages.

Acquisition MUST fail closed when the resolved revision differs from the lock. Package inspection MUST reject credentials, developer absolute paths, unexpected generated files, missing notices, source-control metadata, and entries outside the declared package boundary.

### 20.4 Profile lifecycle

The assembly package MUST provide bounded commands or APIs for:

- building the locked distribution;
- installing or updating an explicitly named isolated Recursus profile;
- verifying an installed profile;
- removing only that exact profile after containment validation.

Install and update MUST be idempotent. Removal MUST NOT touch other DSH profiles, user repositories, component caches, memory, artifact roots, or credentials. Profile configuration MUST reference host credential providers without serializing their values.

### 20.5 Assembled smoke test

The real smoke test MUST use the assembled profile and prove, through public DSH boundaries:

1. the configured Codex provider completes a bounded synthetic request;
2. DSH authorizes and records a harmless local tool call;
3. RLM starts its persistent kernel and returns a deliberate bounded computation result;
4. Honcho memory can be disabled without breaking startup;
5. when explicitly enabled with test credentials, a sanitized synthetic memory round trip succeeds;
6. a synthetic artifact is recorded under the DSH-derived project/session boundary and resolved exactly;
7. one packaged Dovetail skill is discovered and invoked through its supported DSH seam.

Live Codex and Honcho checks MUST remain opt-in. The default CI path MUST use contract tests and local deterministic doubles, while an isolated live acceptance job proves provider compatibility before release. A double may test failure and determinism; it does not substitute for the required release-time live acceptance.

### 20.6 Milestone 1 acceptance evidence

Milestone 1 is complete only when the repository contains:

- the assembly schema and exact lock;
- adapters for all five components;
- package hashes and generated notice closure;
- install, verify, update, and remove documentation;
- Windows clean-machine assembly evidence;
- Linux build and package verification evidence;
- disabled-provider and opt-in live-provider results;
- a package-content, secret, path, provenance, and license report;
- the real assembled smoke-test report with component revisions.

## 21. Milestone 2 — durable run state

### 21.1 Contract

The run-state package MUST expose a DSH-native service definition independently from its filesystem provider. A run has a stable `runId`, DSH-derived `projectId`, schema version, monotonically increasing event sequence, and an optimistic concurrency token.

Every event envelope MUST contain:

- schema version, event ID, run ID, project ID, sequence, type, and recorded time;
- causation and correlation IDs when triggered by another event or tool call;
- actor class (`operator`, `agent`, `tool`, `supervisor`, or `system`);
- bounded, type-validated payload;
- integrity information sufficient to detect truncation or tampering.

Payloads MUST reference large output by artifact or evidence ID rather than embedding it.

### 21.2 State machine

The initial materialized state machine is:

```text
created → planning → running → waiting → verifying → completed
                         ├────→ blocked
                         ├────→ failed
                         └────→ cancelled
```

Terminal transitions require a reason. `completed` additionally requires a satisfied completion contract. Recovery MUST rebuild the same projection from committed events. Invalid transitions, duplicate sequence numbers, corrupt tails, or unsupported versions fail explicitly and do not fabricate state.

### 21.3 Persistence and recovery

The first provider SHOULD use standard-library filesystem primitives and project-scoped append-only event segments plus atomically published projections. It MUST support one writer or explicit optimistic concurrency, crash-safe recovery, deterministic replay, and bounded compaction that preserves the event audit trail.

The service MUST record objective, acceptance criteria, plan graph, budgets, approvals, external mutation identities, execution/evidence references, blocker/failure state, and next eligible action. Honcho MUST NOT be required to read, write, replay, or resume a run.

### 21.4 Acceptance

Tests MUST cover concurrent writers, interrupted publication, truncated and corrupt events, unknown versions, projection deletion/rebuild, compaction, restart, project isolation, ambiguous external success, and prevention of repeated external mutation. A real DSH restart test MUST resume at the first incomplete step with the original objective and acceptance contract intact.

## 22. Milestone 3 — execution supervisor

### 22.1 Execution handle

Every supervised execution MUST have a stable handle containing:

- owning project, run, and step;
- execution class and exact working-directory authority;
- launch identity and sanitized argument metadata;
- process or provider identity;
- start time, health, output cursor, retry policy, and terminal state;
- cancellation and wakeup relationships.

Raw credentials and complete output MUST NOT be stored in the handle.

### 22.2 Behavior

The supervisor MUST distinguish `starting`, `running`, `waiting`, `stalled`, `succeeded`, `failed`, `cancelled`, and `lost`. It MUST consume output incrementally using durable cursors, avoid replaying previously acknowledged output, bound retained excerpts, and place large intentional output in the artifact store.

After host restart, the supervisor MUST reconnect where the provider safely supports it or classify the execution as lost with an exact recovery action. It MUST NOT pretend that a reused process ID proves identity. Cancellation MUST target the recorded process tree, RLM call, child run, timer, or external check and record the outcome.

### 22.3 Acceptance

Acceptance tests MUST cover short processes, long processes, watchers, failed launches, output flooding, stalled output, cursor recovery, PID reuse defense, RLM cancellation, bounded retry, host restart, timers, GitHub CI polling, and user-input wakeups on Windows and Linux where supported.

## 23. Milestone 4 — verification-driven completion

### 23.1 Completion contract

A completion contract is a versioned set of required, optional, and explicitly waivable gates. Each gate declares its verifier, inputs, freshness rule, timeout, retry class, and evidence policy.

Verifier output MUST contain:

- gate and verifier versions;
- `pending`, `running`, `passed`, `failed`, `waived`, or `unavailable` status;
- start and completion times;
- bounded evidence references and input hashes;
- deterministic versus suspected-flaky classification;
- exact next corrective action when known;
- waiver identity and rationale when waived.

### 23.2 Completion rule

The run-state service MUST reject a `completed` transition if any mandatory gate is missing, stale, failed, or merely claimed in prose. Current evidence invalidates remembered success when relevant inputs change.

The first software contract MUST support formatting, lint, type checking, focused tests, broad tests, diff inspection, secrets, developer paths, package inspection, provenance, PR checks, post-merge CI, and branch cleanup. Repository-specific contracts MAY disable inapplicable gates only through checked-in configuration or an explicit operator waiver.

### 23.3 Acceptance

Tests MUST prove success, deterministic failure, flaky retry, stale evidence, input change invalidation, timeout, unavailable verifier, waiver, restart during verification, and persistent correction under a terminal instruction. A real repository change MUST be prevented from completing until every configured gate passes.

## 24. Milestone 5 — coordinated delegation

### 24.1 Delegation envelope

Every child request MUST record:

- parent run/step and stable child ID;
- bounded objective and expected result schema;
- dependencies, priority, and readiness;
- read/write ownership and repository/worktree scope;
- inherited, selected, or cold context policy;
- model, reasoning, tool, token, time, and retry budgets;
- cancellation propagation;
- required evidence and integration owner.

### 24.2 Ownership and integration

The coordinator MUST reject or serialize conflicting mutable ownership. Independent mutable work SHOULD use isolated Git worktrees. Compatible read-only tasks MAY share a workspace. Child output is untrusted until the parent validates its result schema, integrates it, and runs the relevant completion gates.

Children MUST NOT create a second durable human-memory stream, impersonate the operator, broaden their own authority, or inherit credentials that their tools do not require.

### 24.3 Acceptance

Tests MUST cover dependency scheduling, bounded concurrency, edit conflicts, cancellation, timeout, malformed evidence, child replacement, parent restart, orphan recovery, shared read-only work, isolated mutable work, and deterministic integration ordering.

## 25. Milestone 6 — bounded context compiler

### 25.1 Context item

Every candidate item MUST carry stable identity, source, trust class, freshness or source version, byte/token estimate, selection reason, sensitivity class, and recapture policy.

The compiler MUST apply this authority order:

1. DSH policy and system contracts;
2. active objective, acceptance criteria, and durable run state;
3. current files, datasets, tests, and explicit corrections;
4. unresolved failures and fresh verification evidence;
5. relevant committed DSH events;
6. exact project-local artifact cards and deliberate slices;
7. bounded, source-labeled Honcho recall.

### 25.2 Selection

Selection MUST be deterministic for the same inputs and budget, observable without exposing sensitive content, and bounded before model invocation. Stale or untrusted items remain labeled in the rendered context. Injected recall, artifacts, tool output, and resolved paths MUST NOT be automatically recaptured as human exchanges.

### 25.3 Acceptance

Tests MUST cover budget pressure, authority conflicts, stale memory, prompt injection in every source class, duplicates, missing token estimates, sensitivity filtering, compaction recovery, stable selection, and long-session behavior without full-history replay.

## 26. Milestone 7 — adaptive model and compute routing

### 26.1 Decision contract

A routing decision MUST record task category, context size, required tools, failure history, latency target, configured budgets, operator preference, candidate capabilities, selected route, fallback, and reason codes.

Routes MAY select a model/reasoning profile, persistent RLM computation, bounded delegation, or operator escalation. Explicit operator choices override automation. No route may bypass DSH ToolRuntime policy, approvals, credential ownership, or cancellation.

### 26.2 Promotion and fallback

Automatic promotion after failure MUST be bounded. Unavailable preferred routes use a documented compatible fallback or fail explicitly; they MUST NOT silently change semantics. Routing policy changes require paired evaluation against a fixed baseline.

### 26.3 Acceptance

Evaluation MUST compare task success, verification pass rate, latency, token usage, compute usage, and retry count across the routed and fixed baselines. Tests MUST cover explicit overrides, model unavailability, repeated failures, oversized context, RLM suitability, parallelizable tasks, budget exhaustion, and authority escalation.

## 27. Milestone 8 — operator experience

The operator surface MUST reconstruct from DSH services and durable state. It MUST expose active/history views, objective, plan, next action, blockers, processes, kernels, children, ownership, memory/artifact/outbox health, budgets, routing decisions, and verification gates.

Pause, resume, cancel, approve, waive, and inspect actions MUST call authorized DSH services and append durable run events. UI availability MUST NOT grant equivalent model tools or arbitrary administrative scope. Routine telemetry MUST exclude credentials and content-sensitive payloads by default.

Acceptance requires reconnect reconstruction, concurrent update handling, authorization tests, cancellation confirmation, explicit destructive-action targeting, accessibility checks, and clear degraded states for unavailable memory, provider, supervisor, or CI services.

## 28. Milestone 9 — evaluation and release

### 28.1 Evaluation corpus

The versioned corpus MUST cover:

- clean-machine assembly and removal;
- multi-hour continuity, compaction, crash, and reboot recovery;
- exactly-once or reconciled external mutations;
- process, RLM, timer, and CI reconnection;
- cancellation, retry budgets, and genuine blockage;
- parallel delegation, conflicts, replacement, and integration;
- test failure diagnosis and correction;
- prompt injection through files, tool output, artifacts, memory, and child results;
- artifact reuse and freshness across sessions;
- routed versus fixed-baseline performance;
- package, credential, path, provenance, notice, and license closure.

Scenarios use synthetic repositories and provider-isolated accounts. Evaluation output MUST include scenario version, component lock, platform, result, measurements, bounded evidence references, and known limitations.

### 28.2 Release artifacts

A release candidate MUST contain only inspected Recursus-owned files and distributable component artifacts. It MUST include the component lock, package integrity manifest, notices, source locators, supported platform/toolchain matrix, installation/removal instructions, evaluation summary, and known limitations.

The release process MUST verify the candidate from outside the source worktree. Publication, tag creation, package upload, and release announcement require explicit operator authorization.

### 28.3 Final acceptance

The first release MUST demonstrate a real, isolated repository task from request through planning, implementation, process/RLM use, interruption, recovery, verification, pull request, merge, post-merge CI, and branch deletion. Every external mutation and verification gate MUST be traceable through content-bounded durable evidence.

## 29. Cross-milestone verification matrix

Each implementation pull request MUST run the smallest relevant subset and the broadest safe aggregate available:

| Verification class | Required coverage |
| --- | --- |
| Formatting and static analysis | repository format, lint, type checking, schema validation |
| Unit | state transitions, validation, containment, deterministic IDs, redaction |
| Concurrency and recovery | competing writers, interrupted writes, restarts, ambiguous success |
| Contract | DSH services, component adapters, provider-neutral consumers |
| Real integration | exact pinned public seams, isolated profiles, synthetic content |
| Cross-platform | Windows and Linux for assembly, paths, persistence, and processes |
| Security and privacy | credentials, prompt injection, egress, logs, packages, paths |
| Provenance and licensing | revisions, hashes, notices, distributability |
| Package inspection | expected files only, reproducible metadata, install/remove boundaries |

A provider double is appropriate for deterministic error injection, outage, retry, concurrency, and redaction tests. It MUST NOT be described as proof that a hosted provider accepts, processes, stores, or recalls the expected data. Claims about a live provider require an isolated opt-in live test and bounded backend evidence.

## 30. Evidence and milestone completion

Every milestone report MUST state:

- exact scope delivered and owning packages;
- exact component revisions and dependency versions;
- commands run and pass/fail counts;
- acceptance criteria with evidence paths or run identifiers;
- live-provider egress and isolation evidence when applicable;
- package contents, hashes, provenance, and license findings;
- security, privacy, trust, full-access, retention, and non-sandbox limitations;
- unmet criteria and the next exact change required.

Evidence MUST be committed only when it is synthetic, content-bounded, stable, and safe to publish. Volatile or sensitive run output remains outside Git and is summarized by hash, status, and an operator-accessible locator.

## 31. Implementation procedure

At the start of each implementation session:

1. read `AGENTS.md`, `README.md`, `GAMEPLAN.md`, this specification, `docs/ARCHITECTURE.md`, and `THIRD_PARTY_NOTICES.md` completely;
2. inspect the working tree, current branch, component manifest, existing tests, and the owning component's exact pinned public seams;
3. identify the first unmet milestone criterion and create an evidence-based plan;
4. implement the smallest complete vertical slice that proves it;
5. add unit, failure, recovery, and real integration tests proportional to the boundary;
6. update configuration, examples, operator documentation, security/privacy notes, provenance, and evaluation artifacts;
7. run relevant focused checks, `node scripts/verify.mjs`, the broadest safe aggregate, diff inspection, secret/path scans, and package inspection;
8. report remaining gaps accurately and do not advance the milestone merely because code exists.

Do not commit, push, publish, merge, delete branches, mutate live provider data, or create releases unless the operator explicitly authorizes that action.
