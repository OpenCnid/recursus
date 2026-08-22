# Prompt for a fresh Codex session

Work on the bounded DeepSeek Harness deterministic-packaging task described in the supplied `SPEC.md`. That task specification is normative for this session and is not a replacement for Recursus `SPEC.md`.

First clone `https://github.com/OpenCnid/deepseek-harness` and create a dedicated Git worktree from the accepted baseline revision `29c8342b37d76e5dd4ca8daff4beb7743b8e22a0`. Keep the checkout, caches, temporary directories, build products, and package output under one explicit task work root. Work only in the Harness checkout; do not edit Recursus or any other sibling component repository.

Before making changes, read the adjacent handoff `SPEC.md` completely. Then read Harness `AGENTS.md` and all directly applicable repository documentation, package scripts, workflows, locks, build/package code, tests, license files, and notice files completely enough to follow the owning repository's exact requirements. Inspect Git status, confirm the exact baseline revision, and identify the component-owned restore, build, test, web replay, pack, archive-inspection, and packed-consumer commands.

Reproduce the reported failure before editing: on the same Linux source revision and pinned toolchain, run the real component-owned packaging path twice in clean, isolated locations and compare all 231 DSH, vendor, and Landlock archives. Record package identities, archive hashes and sizes, unpacked-content hashes, entry inventories and metadata, and any checkout-root leakage. Known evidence from the prior Recursus investigation is that only 36 content hashes matched while 195 differed; a representative `@deepseek-ai/dsh-agent-default-model` archive differed only in generated `package.json` `devDependencies` key ordering.

Find the owning generation or packaging seam and implement the smallest generic Harness fix. Canonicalize generated manifest maps and deterministic JSON serialization, and address archive order or metadata only where comparison proves it necessary. Do not vendor component source, add Recursus-side normalization, change runtime architecture, or hide a remaining mismatch by weakening the comparison.

Add focused tests for ordering and invalid or varied inputs, plus a clean-directory double-pack regression that exercises the actual Harness packaging path. The regression must compare the complete package identity set, deterministic content and exact archive bytes, scan every tarball for the checkout root in relevant native, normalized, slash-reversed, and escaped forms, install the packed packages in a clean consumer, and prove the source checkout was not contaminated by either run.

Run focused verification first, then the broadest safe component-owned gates: formatting, linting, type checking, unit/integration tests, coverage or snapshots, build, package, applicable web replay, package inspection, license/notice checks, and packed-consumer installation. Use the repository's own commands and preserve all existing operator changes. Do not publish packages, create a release, or modify live provider data.

Implementation and local verification are authorized. Do not commit, push, open or merge a pull request, or delete a branch unless the operator explicitly authorizes those Git operations in this new session.

Before concluding, report:

- The exact root cause and smallest implemented fix.
- Every changed file and package.
- Baseline and resulting revision or uncommitted status.
- The exact toolchain and component-owned commands used.
- Pre-fix and post-fix two-run package counts and hash results.
- Checkout-root scan, package inspection, packed-consumer, license, and full-gate results.
- Any skipped check and every unmet acceptance criterion.
- Whether Windows/Linux archive equality was actually tested; do not infer it from Linux repeatability.
- The exact next step.

If the fix is later reviewed and merged with separate operator authorization, provide the immutable Harness revision for Recursus to review. Returning that reviewed pin to Recursus and resuming Recursus Linux assembly are later tasks, not part of this session.
