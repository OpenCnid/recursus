# Next Codex session prompt

Copy the prompt below into a fresh Codex session. It is intentionally scoped to the first unfinished Recursus milestone.

---

Work only in the current Recursus checkout—the repository containing `SPEC.md`. Treat that checkout as the workspace and repository root. Do not edit sibling component checkouts unless a failing integration test proves that a generic component change is required; if that happens, stop and report the evidence and proposed owning-repository change before editing it.

Continue building Recursus from its accepted public foundation. Start by reading `AGENTS.md`, `README.md`, `GAMEPLAN.md`, `SPEC.md`, `docs/ARCHITECTURE.md`, `THIRD_PARTY_NOTICES.md`, and `manifests/components.json` completely. Treat `SPEC.md` as normative and `GAMEPLAN.md` as the delivery sequence. Inspect the repository, Git status, existing tests and verification, exact component pins, and each pinned component's public build/package/plugin seams before editing.

Milestone 0 is complete at foundation commit `d8425e54102d3d144f2b1f6f125c0581cee952ed`. Do not rebuild the foundation or copy code/history from the private predecessor. Continue Milestone 1: Windows assembly, the §20.4 profile lifecycle, and the default plus opted-in §20.5 assembled smoke are accepted at the pins below. Linux component-owned verification and packaging produced all 244 expected identities, but strict finalization failed closed because two clean Harness packs at the same revision and toolchain reproduced only 36 of 231 content hashes; 195 differed. A sample generated `package.json` differed only in `devDependencies` key order. The first unmet criterion remains §20.6.

Use these immutable component revisions unless a failing real compatibility test proves a pin must change:

- DeepSeek Harness: `29c8342b37d76e5dd4ca8daff4beb7743b8e22a0` (`dsh-v0.1.0-rc.7` package set plus reviewed portable-bundle and public-session seam fixes)
- OpenAI Codex adapter: `5232102d0cc8bd55d5bf27b6eb203efbf6ada8a9`
- DeepSeek RLM: `4772c12b0630706f14d16e70be0ad67bff116690`
- DeepSeek Honcho: `83627329867a562959cf992d0ce56d78a273971a`
- DeepSeek Dovetail: `fec14d795edb5e52c02e2ccc49d9af6004fddee0`
- Honcho SDK: exact version `2.3.0`
- Pi provider substrate: exact version `0.84.2`
- inspected RLM compute boundary: `79b6b28e16c7305e8e791f2d8c9d2935e75ade60`
- pinned Dovetail source: `69f89e3322847fb11665980c16598494a9eacca0`

Architecture boundaries are fixed:

- DSH is the sole control plane and owns agent loops, sessions, ToolRuntime policy, approvals, lineage, cancellation, and lifecycle.
- Recursus owns assembly, durable run services, supervision, verification, coordination, context selection, routing, packaging, and release evidence.
- RLM owns persistent Python computation.
- Honcho is fallible semantic memory, never active run truth or exact artifact storage.
- Exact artifact bytes remain in the project-local artifact store.
- Component implementations remain in their owning repositories; generic changes go there first and return through a reviewed Recursus pin.
- The runtime intentionally uses the host access granted by the operator. Do not redesign it as a sandbox. Preserve exact-target validation, credentials boundaries, explicit irreversible-action gates, and evidence-based completion.

Development requirements:

1. Update a milestone-based working plan tied to specific `SPEC.md` acceptance criteria.
2. Inspect exact pinned types, implementations, tests, licenses, package managers, locks, build commands, pack contents, and DSH extension seams before relying on them.
3. Keep adapter/service definitions provider-neutral and separate from concrete implementations.
4. Use component-owned build and verification commands. Do not vendor component source or rewrite it merely to simplify assembly.
5. Make acquisition fail closed on revision mismatch. Keep all worktrees/caches under an explicit Recursus work root and all release output free of credentials and developer absolute paths.
6. Add focused unit, invalid-input, containment, deterministic-output, and cross-platform path tests, plus the smallest real pinned integration that proves the slice.
7. Update documentation, configuration examples, security/privacy notes, attribution, provenance, and evaluation evidence to match verified behavior.
8. Run formatting, lint, type checking, focused tests, `node scripts/verify.mjs`, the broadest safe repository verification, secret/path scans, diff inspection, and package inspection that apply to the slice.
9. Preserve all user changes. Do not commit, push, publish, merge, delete branches, modify live provider data, or create a release without explicit operator authorization.

Before concluding, report what was implemented, exact files/packages changed, checks and results, evidence for each reached acceptance criterion, every unmet criterion, and the next exact implementation step. Do not claim Milestone 1 complete until every criterion in section 20 of `SPEC.md` has concrete evidence.

Begin only after the owning DeepSeek Harness determinism fix has landed and a reviewed commit is available. Inspect that change and its clean double-pack evidence, update the Recursus Harness pin, then rebuild and inspect all packages twice on Linux and once on Windows. Record truthful platform evidence without assuming cross-platform tarball byte equality. Run the Linux profile lifecycle and default assembled smoke against accepted Linux bytes, then close the remaining §20.6 notice, secret, physical-path, package, and clean-machine evidence. If the owning fix is not yet reviewed, stop and report that exact prerequisite instead of editing component implementation in Recursus.

---
