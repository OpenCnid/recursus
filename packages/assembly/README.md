# Recursus assembly contracts

This private package owns the provider-neutral Milestone 1 assembly manifest, adapter lifecycle, work-root containment, read-only Git acquisition, locked distribution, isolated DSH profile lifecycle, and bounded assembled-smoke orchestration. It does not contain component source, replace DSH's agent loop, or retain credentials.

The common lifecycle is `inspect → acquire → verify revision → restore dependencies → verify source → build → pack → inspect package`. Concrete build and pack adapters must use the commands recorded from each component at its exact revision in [`../../manifests/assembly.json`](../../manifests/assembly.json).

Callers must provide an absolute Recursus work root. Source checkouts, caches, and package output are resolved as path components beneath that root. Acquisition rejects traversal, symlinks at managed directory boundaries, dirty reused checkouts, origin mismatches, and revision mismatches.

The package returns absolute checkout paths only as process-local state needed by later lifecycle steps. Publishable evidence uses the relative work path and immutable revision returned separately; it must never serialize the absolute work root.

`buildLockedDistribution` re-inspects every accepted archive, verifies the source-locked profile lock, and copies exact bytes into an input-addressed directory below the work root. `installRecursusProfile`, `updateRecursusProfile`, `verifyRecursusProfile`, and `removeRecursusProfile` accept one explicit profile name and DSH home. The generated profile uses DSH's public bundle manifest and pnpm workspace seam, records host credential identifiers without resolving values, and installs with exact pnpm `11.19.0` in frozen-lockfile mode. Removal requires a matching ownership marker and realpath containment before it deletes only that profile.

`runAssembledSmoke` starts a bounded worker from one installed profile and reaches components only through their supported DSH/Cordis seams. Its default path uses local deterministic doubles for model and memory behavior while exercising real packaged DSH authorization/audit events, the persistent Jupyter RLM provider, project-local artifact storage, and packaged Dovetail skill discovery. Live Codex and Honcho paths require separate explicit flags. The Codex credential is loaded into an ephemeral provider without being written to evidence; the Honcho check uses a unique synthetic fence, sanitizes the input, removes the test workspace, and verifies its absence. Reports contain only bounded statuses, revisions, counts, and hashes.
