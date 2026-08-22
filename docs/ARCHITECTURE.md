# Architecture

## Product boundary

Recursus is an assembly and runtime-evolution repository. It does not replace DeepSeek Harness and does not absorb the source histories of its component repositories.

The architecture has three layers:

1. **Control plane:** DeepSeek Harness owns the only agent loop, session log, tool registry, policy, lineage, cancellation, and UI lifecycle.
2. **Capabilities:** independently versioned providers, compute, memory, artifacts, and workflow packages attach through published DSH/Cordis seams.
3. **Recursus runtime layer:** durable run state, process supervision, completion contracts, coordination, context selection, routing, assembly, and release evidence.

## Authority model

| Concern | Authority |
| --- | --- |
| Agent and subagent loops | DeepSeek Harness |
| Current task/run state | Recursus run service persisted through DSH-owned lifecycle seams |
| Tool authorization and logging | DeepSeek Harness ToolRuntime |
| Live Python computation | DeepSeek RLM kernel |
| Exact cross-session result bytes | Project-local artifact store |
| Semantic discovery and historical context | Honcho, treated as fallible and untrusted |
| Current software truth | Git, current files, tests, CI, explicit corrections |
| Product assembly and compatibility | Recursus |

## Component policy

Every component entry must include:

- an immutable source revision;
- its repository and role;
- declared or notice-defined licensing status;
- compatibility assumptions;
- a reproducible build and verification command;
- package hashes before inclusion in a release.

Recursus consumes packages, tarballs, or pinned source builds. It does not copy component source into this repository merely for convenience. Generic changes belong in the owning component repository and return here through a new reviewed pin.

## Full-access operating model

Recursus intentionally supports agents with the host access granted by the operator. The runtime does not present this as containment. Reliability controls focus on:

- recoverable Git-based changes;
- exact-target validation for destructive operations;
- durable records of approvals and external mutations;
- process-tree cancellation;
- bounded retries and budgets;
- verification before completion;
- explicit gates for publishing, deletion, spending, credentials, and live-data mutation.

## Durable-run direction

The run service will be an event-sourced DSH service rather than a Honcho feature. A materialized run projection may be rebuilt from versioned events. Run state will reference Honcho memories and artifact IDs but will not store artifact bytes or treat semantic recall as authoritative.

The execution supervisor will own process handles, output cursors, health, wakeups, and bounded restart decisions. It will not own agent reasoning. DSH remains responsible for deciding and executing the next agent step.

## Release shape

A Recursus release will contain:

- a component lock and package-integrity manifest;
- assembled DSH profile configuration;
- inspected component artifacts;
- platform-specific installation helpers where required;
- third-party notices and source locators;
- content-free verification and evaluation evidence;
- no credentials, personal memory, developer paths, or mutable component branches.
