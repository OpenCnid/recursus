# DeepSeek Harness Deterministic Packaging Fix

## 1. Status and authority

This file is the normative specification for one bounded change in the owning DeepSeek Harness repository. It is a task handoff, not a replacement or amendment for Recursus `SPEC.md`.

Implementation and verification of this fix are authorized. Publishing packages or creating a release is not authorized. Do not assume authorization to commit, push, open or merge a pull request, or delete a branch in the separate session unless the operator explicitly grants that authorization there.

## 2. Goal

Make the component-owned DeepSeek Harness packaging path reproducible for an identical clean source revision and identical toolchain on the same platform. Generated package manifests, archive contents, package identities, and pack ordering must be deterministic. Preserve Harness ownership of generic build and packaging behavior; do not implement or normalize this behavior in Recursus.

The accepted Harness baseline is:

- Repository: `OpenCnid/deepseek-harness`
- Revision: `29c8342b37d76e5dd4ca8daff4beb7743b8e22a0`

## 3. Known failure evidence

On Linux, the same accepted Harness source revision was packed twice with the same toolchain in clean, isolated output locations:

- Each run produced 231 DSH, vendor, and Landlock archives.
- Only 36 corresponding archives had identical content hashes.
- 195 corresponding archives had different content hashes.
- In a representative archive, `@deepseek-ai/dsh-agent-default-model`, the only observed content difference was generated `package/package.json` `devDependencies` key ordering.
- One run emitted the order `dsh-invariants`, `dsh-llm`, `dsh-settings`, `dsh-agent`, `cordis`; the other emitted `dsh-agent`, `dsh-settings`, `dsh-invariants`, `dsh-llm`, `cordis`.

This evidence identifies a generic Harness pack determinism defect. It is sufficient reason to begin with generated package-manifest ordering, but the implementation must verify every produced archive rather than assume that key ordering is the only cause.

## 4. Scope and boundaries

Work only in a dedicated DeepSeek Harness checkout or worktree. Read and follow its repository instructions before editing.

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

Preserve all pre-existing operator changes. Keep caches, temporary worktrees, build products, and pack output under an explicit task work root. Do not leave generated edits in the Harness source tree unless they are intentional reviewed source changes.

## 5. Required investigation

Before editing:

1. Read Harness `AGENTS.md` and all directly applicable repository documentation completely.
2. Inspect Git status and confirm the exact baseline revision.
3. Inspect the package manager, lockfile, required runtime versions, build commands, package-generation code, archive tooling, workflows, tests, package contents, licenses, and notices.
4. Identify the component-owned commands that produce the 231 DSH, vendor, and Landlock archives and install them in a clean consumer.
5. Reproduce two clean, isolated pack runs with one pinned toolchain and compare package paths, identities, sizes, archive hashes, normalized entry inventories, entry metadata, and unpacked-content hashes.
6. Confirm whether any archive contains the checkout root in native, forward-slash, backslash, escaped, or encoded forms before relying on existing path-leak protection.

## 6. Implementation requirements

Implement the smallest owner-level fix that satisfies this specification.

1. Canonicalize generated `package.json` output. At minimum, dependency-like maps owned by the generator (`dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies`) must have a stable key order. Apply a consistent deterministic policy to other generated maps or manifest fields whose order can vary.
2. Use explicit deterministic serialization. Do not depend on discovery order, filesystem enumeration order, task-completion order, hash-map insertion order, locale-sensitive comparison, or host-specific absolute paths.
3. Make archive entry ordering and owned archive metadata deterministic if comparison proves they vary. Preserve required executable modes, links, and package semantics.
4. Keep package names, versions, dependency meaning, runtime behavior, licenses, notices, and public package contents unchanged except for deterministic representation or a separately justified correctness fix.
5. Keep output and temporary state isolated from the source tree. Repeated pack runs must not affect one another.
6. Fail tests with useful package- and entry-level diagnostics when determinism or path containment is violated.

## 7. Required regression coverage

Add focused tests at the lowest useful layer and one real clean-directory pack regression.

The coverage must include:

- Canonical ordering for generated dependency-like maps regardless of input or discovery order.
- Manifests containing empty maps, scoped package names, mixed key shapes, and values inserted in different orders.
- Deterministic JSON serialization, including the repository's required newline and indentation behavior.
- Two clean, isolated pack runs from the same revision with the same toolchain.
- Exact equality of the produced package path/identity set across both runs.
- All 231 expected DSH, vendor, and Landlock archives, or a precisely explained updated count caused by an intentional owning-repository change.
- Per-package equality of unpacked-content hashes; exact archive byte hashes and sizes must also match unless an unavoidable archive-format limitation is demonstrated and resolved with an explicitly specified deterministic canonical format.
- A scan of every produced tarball for the physical checkout root in native, normalized, slash-reversed, escaped, and other emitted textual forms relevant to the implementation.
- A clean packed-consumer installation using the produced archives.
- Source containment: no unexpected tracked or untracked source-tree changes after either pack run.

The double-pack regression must exercise the actual component-owned packaging path, not a mock or a Recursus reimplementation.

## 8. Acceptance criteria

This task is accepted only when all of the following have concrete evidence:

1. A clean reproduction records the pre-fix nondeterminism or a well-supported explanation shows why it can no longer be reproduced.
2. Two post-fix clean, isolated packs at the same Harness revision and toolchain produce the same package path and package identity set.
3. Every corresponding archive has identical deterministic content, and exact archive SHA-256 and size equality is demonstrated.
4. Generated package manifests use the documented canonical ordering and are stable across different insertion or discovery orders.
5. Every tarball passes the checkout-root leakage scan.
6. A clean consumer installs and exercises the packed packages using the component-owned verification path.
7. Focused tests and the broadest safe Harness-owned gates pass, including formatting, linting, type checking, unit/integration tests, coverage or snapshots, build, package, relevant web replay, and packed-install verification.
8. Package inspection confirms expected contents, modes, links, package metadata, licenses, and notices.
9. The Harness source checkout is clean apart from the intended implementation and tests; pack outputs and caches remain confined to the explicit work root.
10. Windows/Linux comparison evidence is stated truthfully. Same-platform determinism does not by itself establish cross-platform byte equality, and any remaining cross-platform difference is reported at archive and entry level.

If exact archive equality remains unmet, do not weaken the test or declare success. Report the smallest remaining nondeterministic field, the packages affected, and the proposed owning-repository correction.

## 9. Verification and evidence record

Use component-owned commands discovered from Harness documentation, package scripts, and workflows. Record:

- Baseline and resulting Git revisions.
- Operating system, architecture, package manager, runtime, compiler/build tools, and their exact versions.
- Lockfile state and dependency-restore command.
- Exact focused and broad verification commands and their exit results.
- Package count and sorted identities for each clean run.
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
