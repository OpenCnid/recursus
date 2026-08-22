# DeepSeek Harness Deterministic Packaging Fix

## 1. Status and authority

This file is the normative specification for one bounded change in the owning DeepSeek Harness repository. It is a task handoff, not a replacement or amendment for Recursus `SPEC.md`.

Its canonical repository-relative location is `handoffs/harness-pack-determinism/SPEC.md` in the Recursus checkout. The Recursus checkout is context-only and read-only for this task; it is not the Harness workspace or task work root.

Implementation and verification of this fix are authorized. Publishing packages or creating a release is not authorized. Do not assume authorization to commit, push, open or merge a pull request, or delete a branch in the separate session unless the operator explicitly grants that authorization there.

## 2. Goal

Make the component-owned DeepSeek Harness packaging path reproducible for an identical clean source revision and identical toolchain on the same platform. Generated package manifests, archive contents, package identities, and pack ordering must be deterministic. Preserve Harness ownership of generic build and packaging behavior; do not implement or normalize this behavior in Recursus.

The accepted Harness baseline is:

- Repository: `OpenCnid/deepseek-harness`
- Revision: `29c8342b37d76e5dd4ca8daff4beb7743b8e22a0`
- Version: `dsh-v0.1.0-rc.7`
- Node.js: exactly `24.19.0` for reproduction and acceptance; the repository supports `^22.19.0 || >=24.0.0`, which MAY be exercised as a separate optional matrix
- Package manager: `pnpm@11.7.0`
- `pnpm-lock.yaml` SHA-256: `f517dc3978d57531cda747df62a2abdde1df5b9f25415fcf1fc5d51f8b7547ea`
- Expected archive split: exactly 221 DSH, 9 vendor, and 1 Landlock archive

The prior reproduction ran on Ubuntu 24.04 under WSL x64. Before packing, record the npm version bundled with the selected Node.js `24.19.0` distribution and require that exact npm version in every reproduction and acceptance run because npm pack behavior contributes to archive bytes. The broader prior gate used CMake `3.31.6`, Bubblewrap `0.9.0`, Playwright `1.61.1`, and Chromium revision `1228`; record the versions actually used again, but do not treat them as packaging pins unless the owning commands require that constraint.

## 3. Known failure evidence

On Linux, the same accepted Harness source revision was packed twice with the same toolchain in clean, isolated output locations:

- Each run produced 231 DSH, vendor, and Landlock archives.
- Only 36 corresponding archives had identical content hashes.
- 195 corresponding archives had different content hashes.
- In a representative archive, `@deepseek-ai/dsh-agent-default-model`, the only observed content difference was generated `package/package.json` `devDependencies` key ordering.
- One run emitted the order `dsh-invariants`, `dsh-llm`, `dsh-settings`, `dsh-agent`, `cordis`; the other emitted `dsh-agent`, `dsh-settings`, `dsh-invariants`, `dsh-llm`, `cordis`.

This evidence identifies a generic Harness pack determinism defect. It is sufficient reason to begin with generated package-manifest ordering, but the implementation must verify every produced archive rather than assume that key ordering is the only cause.

## 4. Scope and boundaries

Work only in dedicated DeepSeek Harness checkouts or worktrees. Read and follow its repository instructions before editing. The sole permitted Recursus interaction is reading this handoff specification. Treat the existing Recursus checkout as read-only: do not edit it, generate files beneath it, change its Git state, or use it as a cache, output, source, or task work root.

In scope:

- Reproducing the same-platform repeat-pack failure at the accepted revision.
- Finding the component-owned package-manifest generation and archive creation seams.
- Canonicalizing generated manifest data and serialization where Harness owns it.
- Making archive metadata and traversal order deterministic where required.
- Adding focused and clean-directory regression coverage for every Harness-produced archive.
- Running Harness-owned build, test, pack, web replay, and packed-consumer verification that applies.
- Recording exact evidence about repeatability and any remaining cross-platform differences.

Out of scope:

- Editing Recursus implementation, manifests, pins, or accepted package-integrity records in this task.
- Vendoring Harness source into Recursus or adding Recursus-side byte rewriting or normalization.
- Redesigning Harness runtime boundaries or unrelated APIs.
- Changing component revisions merely to make evidence agree.
- Publishing packages, creating a release, or modifying live provider data.
- Claiming Windows/Linux byte equality without a completed comparison proving it.

Preserve all pre-existing operator changes. Keep the backing clone, source worktrees, caches, temporary files, dependencies, build products, and pack output under a new explicit task work root outside the Recursus checkout. The determinism reproduction and acceptance runs MUST use a Linux-native filesystem and Linux-owned dependencies and outputs; the task root MUST NOT be on `/mnt/<drive>`, DrvFS, or another Windows-mounted checkout. Do not reuse a Windows checkout, `node_modules`, cache, or build tree through WSL. Do not leave generated edits in the Harness source tree unless they are intentional reviewed source changes.

## 5. Required investigation

Before editing:

1. Read Harness `AGENTS.md` and each selected, directly applicable repository document completely. Follow its Agent Note and documentation requirements unless its own rules demonstrably classify the change as mechanical.
2. Inspect Git status and confirm the exact baseline revision.
3. Inspect the package manager, lockfile, required runtime versions, build commands, package-generation code, archive tooling, workflows, tests, package contents, licenses, and notices.
4. Reinspect the component-owned commands. The recorded starting seams are `pnpm install --frozen-lockfile`; `pnpm run check:ci:linux-primary`; `pnpm run release:verify --family dsh`; `pnpm run release:verify --family vendor`; `pnpm run build`; `pnpm run release:pack --family dsh --out <dsh-output>`; `pnpm run release:pack --family vendor --out <vendor-output>`; `pnpm --dir native/landlock-run run build:ts`; `pnpm --dir native/landlock-run/packages/entry pack --pack-destination <landlock-output>`; and `pnpm run release:verify-packed-install --family dsh --from <dsh-output> --from <vendor-output> --from <landlock-output>`.
5. Confirm that the baseline already contains `scripts/release/tarball.ts`, its focused tests, and DSH/vendor pack-time physical-root scanning. Extend and reuse that owner seam; the separately packed Landlock archive MUST receive equivalent coverage.
6. Reproduce two clean, isolated pack runs with one pinned toolchain and compare package paths, identities, family-relative order, `publish-order.txt`, sizes, archive hashes, normalized entry inventories, entry metadata, and unpacked-content hashes.
7. Confirm whether any archive contains any physical source, task, dependency/cache, temporary, or output root in native, slash-normalized, slash-reversed, JSON-escaped, file-URL, percent-encoded, or other emitted textual forms relevant to the implementation.

## 6. Implementation requirements

Implement the smallest owner-level fix that satisfies this specification.

1. Canonicalize generated `package.json` output. At minimum, dependency-like maps owned by the generator (`dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies`) must have a stable key order. Apply a consistent deterministic policy to other generated maps or manifest fields whose order can vary.
2. Use explicit deterministic serialization. Do not depend on discovery order, filesystem enumeration order, task-completion order, hash-map insertion order, locale-sensitive comparison, or host-specific absolute paths.
3. Make archive entry ordering and owned archive metadata deterministic if comparison proves they vary. Preserve required executable modes, links, and package semantics.
4. Keep package names, versions, dependency meaning, runtime behavior, licenses, notices, and public package contents unchanged except for deterministic representation or a separately justified correctness fix.
5. Keep output and temporary state isolated from the source tree. Repeated pack runs must not affect one another.
6. Fail tests with useful package- and entry-level diagnostics when determinism or path containment is violated.

## 7. Required regression coverage

Add focused tests at the lowest useful layer and one real clean-directory pack regression wired into an executed top-level Harness artifact or release gate. An orphan script or uninvoked expensive test does not satisfy this requirement.

The coverage must include:

- Canonical ordering for generated dependency-like maps regardless of input or discovery order.
- Manifests containing empty maps, scoped package names, mixed key shapes, and values inserted in different orders.
- Deterministic JSON serialization, including the repository's required newline and indentation behavior.
- Two clean, isolated Linux pack runs from distinct source paths with separate dependency/cache, temporary, and output roots but identical baseline-plus-patch source bytes and the same toolchain. If committing is not authorized, prove source identity with a recorded binary patch digest and deterministic source-tree content digest applied to both clean baseline worktrees. The content digest MUST cover sorted repository-relative paths, file type, executable mode, symlink target, and bytes for every baseline tracked file plus every intended changed or new file, while excluding `.git`, dependencies, caches, generated builds, temporary files, and outputs. If committing is authorized, both worktrees may use the same resulting post-fix commit.
- Exact equality of the produced package path/identity set and family-relative pack order across both runs. The corresponding DSH and vendor `publish-order.txt` files MUST match byte-for-byte.
- Exactly 221 DSH, 9 vendor, and 1 Landlock archive. A package-count change is outside this bounded fix and requires separate review.
- Per-package equality of unpacked-content digests computed from sorted entry path, type, mode, link target, and content bytes. Compare archive uid, gid, mtime, traversal order, and header metadata separately for diagnosis. Exact archive SHA-256 and byte-size equality is unconditional; archive-format nondeterminism remains a failure requiring an owner-level correction.
- A scan of every produced tarball for both source roots and every physical task, dependency/cache, temporary, and output root in native, normalized, slash-reversed, JSON-escaped, file-URL, percent-encoded, and other emitted textual forms relevant to the implementation. Diagnostics and committed evidence MUST identify packages and relative entries without reproducing absolute roots.
- A clean packed-consumer installation using the produced archives.
- Source containment: no unexpected tracked or untracked source-tree changes after either pack run.

The double-pack regression must exercise the actual component-owned packaging path, not a mock or a Recursus reimplementation.

## 8. Acceptance criteria

This task is accepted only when all of the following have concrete evidence:

1. A clean reproduction records the pre-fix nondeterminism or a well-supported explanation shows why it can no longer be reproduced.
2. Two post-fix clean, isolated packs from the same resulting post-fix commit, or from two source trees proven to contain identical baseline-plus-patch bytes when commits are not authorized, use the identical toolchain and produce the same package path and package identity set.
3. Both runs produce exactly 221 DSH, 9 vendor, and 1 Landlock archive in the same family-relative order; DSH and vendor `publish-order.txt` files match byte-for-byte.
4. Every corresponding archive has identical deterministic content, exact archive SHA-256, and byte size.
5. Generated package manifests use the documented canonical ordering and are stable across different insertion or discovery orders.
6. Every tarball passes scanning for every physical source, task, cache, temporary, and output root used by either run.
7. A clean consumer installs and exercises the packed packages using the component-owned verification path and all three output families.
8. Focused tests and the broadest safe Harness-owned gates pass, including formatting, linting, type checking, unit/integration tests, coverage or snapshots, build, package, relevant web replay, and packed-install verification.
9. Package inspection confirms expected contents, modes, links, package metadata, licenses, and notices.
10. The Harness source checkouts contain no unexpected tracked or untracked changes beyond the intended implementation and tests; pack outputs and caches remain confined to the explicit task work root.
11. Linux same-platform determinism is proven. Windows/Linux equality is not an acceptance condition for this Harness task: report it as `not tested` when no comparison ran, or report archive- and entry-level differences when it did. Never infer cross-platform equality from Linux repeatability.

If exact archive equality remains unmet, do not weaken the test or declare success. Report the smallest remaining nondeterministic field, the packages affected, and the proposed owning-repository correction.

## 9. Verification and evidence record

Use component-owned commands discovered from Harness documentation, package scripts, and workflows. Record:

- Baseline and resulting Git revisions.
- Operating system, architecture, exact Node.js `24.19.0`, its observed bundled npm version, pnpm `11.7.0`, compiler/build tools, and their exact versions.
- Lockfile state and dependency-restore command.
- Exact focused and broad verification commands and their exit results.
- Package counts, sorted identities, family-relative order, and `publish-order.txt` hashes for each clean run.
- The post-fix commit or the binary patch and source-tree content digests proving both uncommitted worktrees contained identical source bytes.
- Per-run work-root isolation and source-tree status.
- Per-package archive SHA-256, byte size, unpacked-content hash, and path-leak result.
- Packed-consumer install result.
- License and notice inspection result.
- Any skipped test with its exact reason.
- Every unmet acceptance criterion.

Do not include credentials, developer absolute paths, or sensitive environment values in committed fixtures, reports, logs, packages, or pull-request text.

## 10. Handoff back to Recursus

After the owning Harness change is reviewed and merged under separate operator authorization, Recursus can review and adopt the resulting immutable Harness revision. Only then should Recursus resume Linux assembly, generate or accept platform integrity evidence, run Linux profile and assembled-smoke verification, and evaluate the remaining Milestone 1 criteria.

The Harness task must report the reviewed revision and evidence but must not edit Recursus or advance its pin itself.
