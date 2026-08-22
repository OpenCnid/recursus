# Reproducible package assembly

## Current scope

This Milestone 1 slice implements the versioned source lock required by `SPEC.md` §20.2 and the provider-neutral component lifecycle contract from §20.3. It acquires exact public revisions, provisions exact package-manager entrypoints, runs component-owned restore/verification/build/pack checks, and inspects npm tarballs without extracting them. A reviewed Harness pin fixes the checkout-path leak exposed by the first Windows run; the repeated lifecycle accepted all 244 archives and generated deterministic integrity. This slice does not redistribute component archives, install a profile, contact live Codex or Honcho services, or claim Milestone 1 completion.

The authoritative files are:

- `manifests/components.json`: accepted component pins;
- `manifests/assembly.json`: extended, human-reviewable assembly source lock;
- `manifests/assembly.schema.json`: strict source-lock schema version 1;
- `manifests/package-integrity.schema.json`: deterministic package hash/size schema;
- `manifests/package-integrity.json`: deterministic SHA-256 and byte-size records for 244 accepted archives;
- `evaluations/milestone-1-package-report.json`: path-free accepted lifecycle, package, and security evidence;
- `evaluations/milestone-1-package-report-blocked-99f6f02.json`: preserved evidence for the fail-closed predecessor pin;
- `packages/assembly`: provider-neutral types, lifecycle runner, manifest validation, containment, Git acquisition, command execution, and archive inspection.

Package archives themselves remain beneath the ignored work root. No integrity file is written while any archive fails inspection. The checked-in integrity file proves accepted bytes, not redistribution permission; the Codex adapter remains blocked pending owner-selected terms, and Dovetail requires composite notice review.

## Work-root configuration

The work root is an explicit operator input and is never read from a model-selected path. It must be absolute. The schema assigns distinct relative directories for source checkouts, caches, and accepted package output.

PowerShell example:

```powershell
$env:RECURSUS_WORK_ROOT = 'D:\recursus-work'
```

POSIX example:

```sh
export RECURSUS_WORK_ROOT=/var/tmp/recursus-work
```

Run the complete package workflow from a clean checkout with the repository-pinned Node and pnpm:

```powershell
$env:RECURSUS_WORK_ROOT = 'D:\recursus-work'
pnpm assemble:packages
```

The command writes repository integrity only after every component succeeds. Accepted components are checkpointed beneath `<work-root>/evidence`, so a later transient component failure can be retried explicitly with `RECURSUS_COMPONENTS=<logical-name>` and finalized with `pnpm assemble:finalize`. Finalization re-inspects every archive and requires the checkpoint identities, hashes, sizes, content hashes, entry counts, and notice paths to match exactly.

Acquisition is idempotent only for an existing checkout whose configured origin, clean status, and `HEAD^{commit}` exactly match the lock. Any mismatch fails; the provider does not reset or overwrite the checkout. When a new acquisition fails, it removes only the partial component directory it created beneath the validated sources root. Git receives `core.longpaths=true` per command so pinned Dovetail evidence paths check out on Windows without modifying global configuration.

Each component's exact pnpm JavaScript entrypoint runs top-level lifecycle commands. An exact standalone pnpm executable is also first on `PATH` for component-owned shell-free nested commands. Known package-manager and Python caches remain beneath the work root, Git prompting is disabled, and credential-shaped environment variables are removed.

## Inspected component seams

| Component | Package manager | Owned verification/build seam | Pack/profile seam | License finding |
| --- | --- | --- | --- | --- |
| DeepSeek Harness `6002995` | pnpm `11.7.0` | serialized `check:ci:windows-complete`, release-family verification, `build` | 221 DSH, 9 vendor, and 1 Landlock tarball; public profile/bundle metadata | MIT with root and generated third-party notices |
| Codex adapter `5232102` | pnpm `11.19.0` | typecheck, lint, tests, build | one npm tarball and `cordis.patch.yml`; registers `openai-codex` through `ctx.llm` and `ctx.credentials` | redistribution blocked pending owner-selected license |
| RLM `4772c12` | pnpm `9.14.4`, uv, Python 3.11 | `check`, build, component package check | five tarballs and `packages/bundle/dsh.bundle.patch`; provider-neutral `ctx.rlm` plus Jupyter provider and tool | MIT; Prime and DSH notices preserved |
| Honcho `8362732` | pnpm `11.7.0` | `verify`, build, six-package inspection/install check | six tarballs; provider contract, SDK provider, artifact service, consumers, and bundle remain separate | Apache-2.0; Honcho SDK exactly `2.3.0` |
| Dovetail `fec14d7` | pnpm `11.19.0` | typecheck, lint, tests, materialization/package verification, build | one npm tarball and `cordis.patch.yml`; mounts DSH's filesystem skill provider | composite; per-skill closure required and package remains private |

The source lock records exact lockfile SHA-256 values inspected at those revisions. The Codex adapter locks Pi to `0.84.2`; Honcho locks the official SDK to `2.3.0`; the inspected RLM compute boundary remains `79b6b28e16c7305e8e791f2d8c9d2935e75ade60`; and Dovetail source remains `69f89e3322847fb11665980c16598494a9eacca0`.

## Verification

Default repository checks use only synthetic repositories and data:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
node scripts/verify.mjs
```

The opt-in pinned integration fetches only the public Codex adapter revision into the configured work root. It proves the real GitHub acquisition/reuse/revision seam, not Codex provider behavior.

The accepted Windows package run produced 244 archives: Harness 231, Codex 1, RLM 5, Honcho 6, and Dovetail 1. The prior Harness pin failed closed on 29 `package/lib/client.js` files whose `dsh-css` virtual-module comments retained the absolute source path. The owning fix now derives repository-relative virtual IDs and scans each DSH/vendor tarball before publication handoff; reviewed Harness PR #1 returned as Recursus pin `600299571a9d807a475ca87f366bd22761dd938e`. The repeated full Harness lifecycle accepted all 231 Harness archives. Finalization independently re-inspected all 244 archives, matched them to component checkpoints, and generated package integrity with no timestamp or host path. The 13 unchanged non-Harness archives were recovered through the documented checkpoint path after their archive SHA-256, size, identity, entry count, and notices matched and only the inspector's derived content digest representation had changed.

RLM's aggregate `check` and Dovetail's aggregate `verify` assume build artifacts already exist, so their adapters invoke the same component-owned granular checks before build and their build-dependent E2E/package checks after build. Honcho's package checker is invoked directly with the exact pnpm module in `npm_execpath`. Harness's own packed-consumer verifier is recorded as Linux-only, matching its public Ubuntu release workflow.

## Security, privacy, and limitations

- Acquisition and dependency restore perform public GitHub/package-registry egress. They read no provider credential and record no raw command output, environment dump, or absolute path as evidence.
- Absolute checkout paths remain local process state. Inspection rejects the exact work root in native, slash-normalized, and escaped forms. Package integrity contains only relative package paths, SHA-256 values, and byte sizes.
- The runtime and component build commands use operator-granted host access. Path checks do not make them a sandbox.
- Package inspection rejects undeclared output, archive traversal and links, source-control metadata, generated residue, credentials, developer-specific paths, corrupt headers, oversized input, and missing declared notices.
- Local acceptance does not override component redistribution status.
- No profile build, install, update, verify, or removal behavior exists yet.
- No disabled-provider, deterministic assembled smoke, or opt-in live Codex/Honcho acceptance has run.
- Windows acquisition/build/package/inspection is verified locally. Harness's Linux-only packed-consumer check and complete Linux assembly evidence remain required Milestone 1 items.

The next implementation step is `SPEC.md` §20.4: add bounded build/install/update/verify/remove commands for an explicitly named isolated Recursus DSH profile, with exact-profile containment and idempotence tests. Linux build/package verification and the assembled smoke matrix in §20.5 remain required before Milestone 1 can be complete.
