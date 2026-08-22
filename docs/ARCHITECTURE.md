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

## Assembly layer

The assembly layer is a Recursus-owned integration package, not another DSH runtime. Its versioned source lock records immutable component inputs and public build/package/profile seams. The generated integrity document records SHA-256 and byte size only after package bytes pass inspection; it deliberately has no timestamp or host path.

Every component adapter follows one provider-neutral lifecycle:

```text
inspect → acquire → verify revision → restore dependencies → verify source → build → pack → inspect package
```

The lifecycle runner owns order and bounded evidence. Acquisition, command execution, and package inspection remain separate implementations. Git acquisition works only beneath an absolute operator-configured Recursus work root, enables Windows long-path checkout per command, reuses a checkout only when its origin, cleanliness, and commit all match, and removes only a partial checkout created by the failed acquisition call. Exact pnpm JavaScript entrypoints drive top-level commands while exact standalone executables remain on `PATH` for component-owned shell-free nested calls.

The current Milestone 1 assembly executes all recorded component restore, verification, build, pack, and package-check commands, then rejects undeclared output, unsafe archive boundaries, credentials, developer paths, the configured work root, generated residue, source-control metadata, and missing notices. The first Windows run rejected 29 Harness client bundles that retained the absolute build path in CSS virtual-module comments. That generic fix returned through reviewed Harness PR #1. The subsequent public-session seam required by the assembled smoke returned through reviewed Harness PR #2 and Recursus pin `29c8342b37d76e5dd4ca8daff4beb7743b8e22a0`. Windows accepted all 244 archives and the profile/smoke evidence. Linux built all 244 identities, but two clean Harness packs at the same revision and toolchain produced different contents for 195 of 231 archives. Linux finalization therefore failed closed, and §20.6 remains incomplete pending an owning Harness determinism fix and reviewed Recursus pin.

The profile layer re-inspects those accepted bytes into an input-addressed locked distribution, then installs one explicit DSH profile through the public `dsh.profile.bundles` and `pnpm-workspace.yaml` seams. Recursus owns the distribution manifest, local archive closure, ownership marker, idempotent reconciliation, verification, rollback, and exact-profile removal. DSH still owns profile composition and runtime boot. Codex, RLM, and Dovetail contribute ordered bundle patches. Honcho's package is installed but unmounted by default so a missing or failed semantic-memory provider cannot block the control plane. Credential configuration contains names resolved by DSH's host credential service, never values.

The assembled smoke runner is a bounded Recursus verifier, not an agent loop. It loads one installed profile and uses public DSH/Cordis services to prove authorization and event recording, persistent RLM computation, exact project-local artifact resolution, disabled Honcho startup, and Dovetail skill discovery. Default CI substitutes deterministic Codex and enabled-memory doubles. Separately opted-in acceptance uses the packaged Codex and Honcho providers, records only bounded compatibility results, and removes its uniquely fenced Honcho test workspace. DSH remains the authority for sessions, approvals, ToolRuntime policy, and lifecycle throughout.
