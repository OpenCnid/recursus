# Prompt for a fresh Codex session

The normative task specification already exists on this Windows host at the exact literal path `D:\deepseek-recursus\recursus\handoffs\harness-pack-determinism\SPEC.md`; from WSL the same file is `/mnt/d/deepseek-recursus/recursus/handoffs/harness-pack-determinism/SPEC.md`. Its expected SHA-256 is `7beea307670e3e18568f9c25ebf9a055286e54088a8e2bb6993bcfbab0bdb1f5`. Before cloning a repository, creating a work root, or running any project command, verify that digest and read the entire file using one of those exact paths. That handoff specification—not `D:\deepseek-recursus\recursus\SPEC.md`, not a `SPEC.md` found in DeepSeek Harness, and not this prompt alone—is normative for the task.

If neither exact path is readable, or if its digest differs, stop before cloning or editing anything and report both paths plus the observed digest when available. Do not substitute another file named `SPEC.md`, infer the missing specification from this prompt, or fetch a mutable replacement.

The only permitted interaction with the existing Recursus checkout is reading the handoff specification at the path above. Treat all of `D:\deepseek-recursus\recursus` as read-only: do not edit it, generate files beneath it, change its Git state, or use it as the Harness work root, source, cache, temporary, dependency, build, or output directory.

After reading the handoff, perform the packaging reproduction and acceptance work in Linux/WSL. Create a new explicit Linux-native task root that is not on `/mnt/<drive>`, DrvFS, or any other Windows-mounted filesystem; verify it is new and not Recursus-contained before writing. Keep the backing clone, worktrees, dependencies, caches, temporary directories, build products, and package output beneath it. Do not run Linux evidence against a Windows checkout or reuse Windows-owned `node_modules`, caches, or build output.

Clone `https://github.com/OpenCnid/deepseek-harness` beneath that task root and create a dedicated implementation worktree from accepted baseline revision `29c8342b37d76e5dd4ca8daff4beb7743b8e22a0` (`dsh-v0.1.0-rc.7`). Use exactly Node.js `24.19.0` and pnpm `11.7.0` for the pre-fix reproduction and both post-fix acceptance runs. Before any pack, record the npm version bundled with that exact Node.js distribution and require the same npm version in every comparison. The repository supports other Node.js versions, which may be an optional matrix but must not replace the fixed comparison. Confirm `pnpm-lock.yaml` SHA-256 `f517dc3978d57531cda747df62a2abdde1df5b9f25415fcf1fc5d51f8b7547ea`. Work only in Harness worktrees; do not edit any sibling component repository.

Read Harness `AGENTS.md` and every selected, directly applicable repository document completely. Follow its Agent Note/documentation requirements unless its own rules demonstrably classify the fix as mechanical. Inspect Git status, confirm the exact baseline and lock digest, and reinspect the component-owned restore, Linux gate, DSH/vendor release verification, build, DSH/vendor pack, Landlock build/pack, archive-inspection, web replay, and three-output packed-consumer commands before relying on them.

Reproduce the reported failure before editing: on the same Linux source revision and pinned toolchain, run the real component-owned packaging path twice from distinct clean source paths with separate dependency/cache, temporary, and output roots. Compare exactly 221 DSH, 9 vendor, and 1 Landlock archive, including family-relative order, both `publish-order.txt` files, identities, archive hashes and sizes, normalized unpacked-content digests, entry inventories and metadata, and leakage of every physical root used by either run. Known evidence from the prior Recursus investigation is that only 36 content hashes matched while 195 differed; a representative `@deepseek-ai/dsh-agent-default-model` archive differed only in generated `package.json` `devDependencies` key ordering.

Find the owning generation or packaging seam and implement the smallest generic Harness fix. Canonicalize generated manifest maps and deterministic JSON serialization, and address archive order or metadata only where comparison proves it necessary. Do not vendor component source, add Recursus-side normalization, change runtime architecture, or hide a remaining mismatch by weakening the comparison.

Add focused tests for ordering and invalid or varied inputs, plus a clean-directory double-pack regression wired into an executed top-level Harness artifact or release gate. It must exercise the actual Harness packaging path from two distinct source paths, compare family order and `publish-order.txt` byte-for-byte, prove exact content and archive-byte equality, scan every DSH/vendor/Landlock tarball for every source/task/cache/temp/output root in relevant native and encoded forms, install all three output families in a clean consumer, and prove neither source tree was contaminated by a pack run. Reuse and extend the baseline `scripts/release/tarball.ts` and its pack-time scan rather than creating an unrelated Recursus implementation.

If commit authorization has not been granted, create two clean baseline worktrees and apply identical baseline-plus-patch bytes to each. Record a binary patch digest and a deterministic source-tree content digest covering sorted repository-relative paths, file type, executable mode, symlink target, and bytes for every baseline tracked file plus each intended changed or new file; exclude `.git`, dependencies, caches, generated build products, temporary files, and outputs. If a commit is later authorized, both runs may instead use the same resulting post-fix commit. Exact archive SHA-256 and byte-size equality is mandatory—tar, gzip, timestamp, ownership, traversal-order, or header differences remain failures and must not be waived.

Run focused verification first, then the broadest safe component-owned gates: formatting, linting, type checking, unit/integration tests, coverage or snapshots, build, package, applicable web replay, package inspection, license/notice checks, and packed-consumer installation. Use the repository's own commands and preserve all existing operator changes. Do not publish packages, create a release, or modify live provider data.

Implementation and local verification are authorized. Do not commit, push, open or merge a pull request, or delete a branch unless the operator explicitly authorizes those Git operations in this new session.

Before concluding, report:

- The exact root cause and smallest implemented fix.
- Every changed file and package.
- Baseline and resulting revision or uncommitted status.
- The exact toolchain and component-owned commands used.
- Pre-fix and post-fix two-run package counts, order, `publish-order.txt`, source-identity, and hash results.
- Checkout-root scan, package inspection, packed-consumer, license, and full-gate results.
- Any skipped check and every unmet acceptance criterion.
- Whether Windows/Linux archive equality was actually tested; report `not tested` if it was not and do not infer it from Linux repeatability.
- The exact next step.

If the fix is later reviewed and merged with separate operator authorization, provide the immutable Harness revision for Recursus to review. Returning that reviewed pin to Recursus and resuming Recursus Linux assembly are later tasks, not part of this session.
