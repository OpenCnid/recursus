# Recursus game plan

## 1. Mission

Recursus will turn the verified DeepSeek Harness, Codex, RLM, Honcho, artifact-memory, and Dovetail components into one durable runtime agent that can work for long periods, survive interruption, coordinate bounded children, verify its own completion, and resume from authoritative state.

The product is optimized for a trusted, full-access development machine. Capability, continuity, and correctness are the priorities. DSH remains the only agent control plane.

## 2. Delivery principles

1. Build an integration distribution, not a copied-source monolith.
2. Keep exact revisions, package hashes, provenance, and licenses visible.
3. Make every milestone independently testable end to end.
4. Persist authoritative run state locally through DSH lifecycle seams.
5. Treat Honcho memory as useful but fallible context.
6. Store exact large results in the artifact store and pass references through run state.
7. Require evidence before completion claims.
8. Keep irreversible external actions explicit and auditable.
9. Preserve component ownership so generic improvements can flow upstream.

## 3. Milestone 0 — product foundation

Deliver:

- public `OpenCnid/recursus` repository;
- MIT license for original Recursus work;
- architecture, specification, contribution, security, and attribution documents;
- exact initial component manifest;
- Windows and Ubuntu foundation CI;
- GitHub issues and milestones corresponding to this plan.

Acceptance:

- the private predecessor is preserved separately as `recursus-idea`;
- the public repository contains no private predecessor content;
- all five components are pinned to immutable revisions;
- license boundaries do not imply that MIT relicenses external components;
- the foundation verifier passes on Windows and Ubuntu.

## 4. Milestone 1 — reproducible runtime assembly

Deliver:

- component fetch/build/pack adapters using each repository's own package manager and verification commands;
- package SHA-256 manifest and source revision lock;
- assembled DSH development and evaluation profiles;
- one command to build the complete local distribution;
- one command to install or update an isolated Recursus profile;
- one command to verify and remove that profile without touching unrelated profiles;
- generated third-party notice closure and package-content inspection.

Acceptance:

- a clean Windows machine can produce the same inspected component artifacts from the lock;
- the assembled profile exposes the Codex provider, persistent RLM, Honcho memory, artifact tools, and Dovetail skills;
- credentials are referenced through host configuration and absent from artifacts and logs;
- installation is idempotent and does not depend on developer absolute paths;
- a real assembled smoke task exercises model, tool, RLM, memory, artifact, and skill paths.

## 5. Milestone 2 — durable run state

Implement a DSH-native service and provider-neutral contract for versioned run events and materialized state.

Initial states:

```text
created → planning → running → waiting → verifying → completed
                         └────→ blocked | failed | cancelled
```

A run records:

- objective and acceptance criteria;
- current plan and step dependencies;
- completed, active, pending, and superseded steps;
- tool-call, process, kernel, artifact, commit, PR, and CI references;
- recorded approvals and capability decisions;
- time, token, model, compute, and retry budgets;
- verification gates and evidence;
- blocker, failure, cancellation, or completion reason;
- the next eligible action.

Acceptance:

- state writes are atomic, versioned, project-scoped, and concurrency-safe;
- materialized state can be rebuilt from its events;
- restart and compaction do not lose the objective, plan, evidence, or next action;
- an already-recorded external mutation is not repeated after restart;
- incompatible or corrupt state fails explicitly;
- Honcho outages cannot remove or rewrite active run truth.

## 6. Milestone 3 — execution supervisor

Deliver a DSH service for supervising:

- terminal commands and process trees;
- builds, tests, development servers, and watchers;
- RLM/Jupyter kernels;
- GitHub pull-request and CI checks;
- scheduled wakeups and bounded monitors;
- output cursors and health transitions.

Every supervised execution records its working directory, launch identity, start time, output cursor, health, restart policy, exit state, and owning run step.

Acceptance:

- the host can restart and reconnect to or safely classify every prior execution;
- output is consumed incrementally without duplicate replay;
- running, waiting, stalled, failed, and lost processes are distinct states;
- transient retries are bounded and reason-coded;
- cancellation reaches the intended process tree and active RLM call;
- a waiting run wakes when its process, timer, external check, or user input changes.

## 7. Milestone 4 — verification-driven completion

Add machine-readable completion contracts and verifier plugins.

The software-development contract may require:

- requested behavior implemented;
- focused and broad tests passing;
- formatting, lint, and type checking passing;
- final diff inspected;
- no secrets, unrelated files, or developer paths;
- packages and provenance verified;
- PR checks and post-merge CI passing;
- temporary branches removed;
- required external resources cleaned up or explicitly retained.

Acceptance:

- the runtime cannot mark a run complete while a required gate is failing or missing;
- every gate stores content-bounded evidence and timestamps;
- failures produce an exact next corrective action where one is known;
- flaky and deterministic failures remain distinguishable;
- a waiver requires an explicit recorded operator decision;
- a terminal condition causes persistent correction until success or a genuine blocker.

## 8. Milestone 5 — coordinated delegation

Define a bounded delegation contract containing:

- objective and expected result schema;
- dependencies and priority;
- file, package, or read-only ownership;
- cold or inherited context policy;
- model and reasoning profile;
- tool, time, token, and retry budgets;
- cancellation relationship;
- evidence required by the parent.

Use isolated worktrees when independent agents may edit overlapping repositories. Share the main workspace only for compatible read-only work.

Acceptance:

- dependency-ready children may execute concurrently;
- conflicting mutable ownership is rejected or serialized;
- child results contain evidence and source references, not only prose;
- the root independently integrates and verifies child work;
- child messages do not automatically become human memory;
- failed children can be retried or replaced without restarting the parent run.

## 9. Milestone 6 — bounded context compiler

Compile model context in this precedence order:

1. DSH policy and system contracts;
2. active objective, acceptance criteria, and run state;
3. current files, datasets, tests, and explicit corrections;
4. unresolved failures and verification evidence;
5. relevant committed DSH events;
6. exact local artifact cards and selected slices;
7. bounded, source-labeled Honcho recall.

Every item carries source, trust class, freshness, byte/token cost, and selection reason.

Acceptance:

- context stays within a configured budget;
- authoritative evidence outranks recalled memory;
- stale and untrusted material is labeled;
- injected context is not automatically recaptured;
- selection is observable and reproducible from the same inputs;
- long sessions do not degrade into full-history replay.

## 10. Milestone 7 — adaptive model and compute routing

Route work among:

- fast models for discovery and mechanical transformations;
- stronger models for architecture, difficult debugging, and repeated failures;
- persistent RLM computation for exact analysis and large inputs;
- bounded subagents for independent parallel work;
- operator escalation when evidence conflicts or authority is missing.

Routing inputs include task category, context size, failure history, latency target, user preference, and configured token/cost/time budgets.

Acceptance:

- routing decisions and their inputs are observable;
- explicit operator model choices override automatic routing;
- escalation is bounded and never bypasses ToolRuntime policy;
- evaluation compares success, latency, and usage with a fixed-model baseline;
- absence of a preferred model produces a documented fallback rather than silent behavior drift.

## 11. Milestone 8 — operator experience

Add an operator surface for:

- active and historical runs;
- current plan, next action, and blockers;
- supervised processes and RLM kernels;
- child agents and ownership;
- memory, artifact, and outbox health;
- budgets and routing decisions;
- verification gates;
- pause, resume, cancel, approve, and inspect controls.

Acceptance:

- control actions flow through DSH services and durable run events;
- the model never receives credential, arbitrary-scope, or destructive administration tools merely because the UI has them;
- UI reconstruction after reconnect reflects authoritative state;
- content-sensitive data is excluded from routine telemetry by default.

## 12. Milestone 9 — evaluation and release

The release corpus must include:

- clean-machine assembly;
- multi-hour run continuity;
- host crash and reboot recovery;
- compaction recovery;
- exactly-once external mutation behavior;
- process and CI reconnection;
- cancellation and bounded retry;
- parallel delegation and edit conflict handling;
- test-failure diagnosis and repair;
- prompt injection through files, tools, artifacts, and memory;
- artifact reuse across sessions;
- model-routing comparison;
- package, secret, provenance, and license closure.

Release acceptance:

- Windows and Linux aggregate CI pass;
- an isolated real task proceeds from request through implementation, restart, verification, PR, merge, post-merge CI, and branch deletion;
- generated artifacts contain no credentials, personal memory, raw provider tokens, or developer paths;
- component source revisions and package hashes reproduce the tested release;
- every remaining limitation is explicit;
- the first versioned release is published only with operator approval.

## 13. Collaboration model

- `main` remains releasable and protected by CI.
- Work begins from a GitHub issue linked to one milestone and acceptance contract.
- Pull requests identify affected component pins and license boundaries.
- Generic component changes land in their owning repository first, then Recursus updates its reviewed pin.
- Integration-only code belongs here.
- Release evidence is content-free and reproducible.
- GitHub Projects may visualize milestone state, but repository issues and committed specs remain the durable planning record.

## 14. Immediate issue sequence

1. Define the assembly manifest schema and component adapter contract.
2. Implement read-only component fetch and revision verification.
3. Implement component build/pack adapters without installation.
4. Generate package hashes and third-party notice closure.
5. Assemble an isolated DSH profile and run the first real smoke test.
6. Specify the durable run event and projection contracts.
7. Implement the local run-state provider and crash-recovery tests.
8. Add execution handles and output-cursor persistence.
9. Add the first software completion contract.
10. Demonstrate one restartable repository task end to end.
