# Reproducible package assembly

## Current scope

Milestone 1 implements the versioned source lock required by `SPEC.md` §20.2, the provider-neutral component lifecycle contract from §20.3, the bounded profile lifecycle from §20.4, and the assembled smoke matrix from §20.5. It acquires exact public revisions, provisions exact package-manager entrypoints, runs component-owned restore/verification/build/pack checks, inspects npm tarballs without extracting them, builds a locked local distribution, installs or removes one explicitly named DSH profile, and verifies the installed public component seams. Windows accepts 244 archives, the isolated profile lifecycle, and the default plus explicitly opted-in smoke. Linux produced all 244 expected package identities, but Harness pack contents were not deterministic, so Linux finalization and §20.6 remain incomplete. No component archive is redistributed by this repository.

The authoritative files are:

- `manifests/components.json`: accepted component pins;
- `manifests/assembly.json`: extended, human-reviewable assembly source lock;
- `manifests/assembly.schema.json`: strict source-lock schema version 1;
- `manifests/package-integrity.schema.json`: deterministic package hash/size schema;
- `manifests/package-integrity.json`: deterministic SHA-256 and byte-size records for 244 accepted archives;
- `manifests/profile-lock.yaml`: exact pnpm `11.19.0` resolution for the assembled profile, pinned by the assembly source lock;
- `evaluations/milestone-1-package-report.json`: path-free accepted lifecycle, package, and security evidence;
- `evaluations/milestone-1-profile-lifecycle-report.json`: path-free §20.4 distribution, profile, containment, and smoke evidence;
- `evaluations/milestone-1-assembled-smoke-disabled-report.json`: Windows default deterministic smoke evidence;
- `evaluations/milestone-1-assembled-smoke-report.json`: explicitly opted-in Windows Codex and Honcho acceptance evidence;
- `evaluations/milestone-1-package-report-blocked-99f6f02.json`: preserved evidence for the fail-closed predecessor pin;
- `packages/assembly`: provider-neutral types, lifecycle runner, manifest validation, containment, Git acquisition, command execution, archive inspection, profile lifecycle, and bounded smoke orchestration.

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

## Locked distribution and profile commands

The profile CLI requires an explicit absolute work root, DSH home, and profile name. Its package-manager module defaults to the exact pnpm that launched the repository script; direct callers can provide `RECURSUS_PNPM_MODULE` or `--pnpm-module`.

PowerShell:

```powershell
$workRoot = 'D:\recursus-work'
$dshHome = 'D:\dsh-home'
pnpm profile build --work-root $workRoot
pnpm profile install --work-root $workRoot --dsh-home $dshHome --name recursus
pnpm profile update --work-root $workRoot --dsh-home $dshHome --name recursus
pnpm profile verify --work-root $workRoot --dsh-home $dshHome --name recursus
pnpm profile remove --work-root $workRoot --dsh-home $dshHome --name recursus
```

POSIX:

```sh
work_root=/var/tmp/recursus-work
dsh_home="$HOME/.dsh"
pnpm profile build --work-root "$work_root"
pnpm profile install --work-root "$work_root" --dsh-home "$dsh_home" --name recursus
pnpm profile update --work-root "$work_root" --dsh-home "$dsh_home" --name recursus
pnpm profile verify --work-root "$work_root" --dsh-home "$dsh_home" --name recursus
pnpm profile remove --work-root "$work_root" --dsh-home "$dsh_home" --name recursus
```

Build re-inspects all hashes and package identities before copying accepted bytes and the checked profile lock into an input-addressed directory beneath `<work-root>/distributions`. The distribution manifest contains only relative archive paths, revisions, hashes, byte sizes, bundle names, credential-reference names, and the profile-lock hash. Repeating a build verifies and reuses the same bytes; different source-lock input receives a different directory. Install uses `--frozen-lockfile`, so registry range changes cannot alter a clean-machine profile.

The installed profile contains all 244 archives as local direct dependencies and pnpm workspace overrides. Its ordered DSH bundles are `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-headless`, `deepseek-openai-codex`, `@deepseek-rlm/dsh-rlm-bundle`, and `deepseek-dovetail`. The Honcho bundle is installed but intentionally absent from that list until its provider is configured, so disabled memory cannot prevent startup. The profile names `DEEPSEEK_API_KEY`, `OPENAI_CODEX_OAUTH`, and `HONCHO_API_KEY` as host-owned references and never reads or serializes their values.

Install and update verify exact pnpm `11.19.0`, scrub credential-shaped environment variables, redirect caches beneath the work root, reject physical paths in generated text, and validate every installed package identity. A matching installation returns unchanged without running pnpm. Update requires the Recursus ownership marker, builds the replacement at the exact final path, and restores the prior profile if installation fails. Removal likewise requires the marker plus realpath containment and deletes only the named profile; it deliberately retains all caches.

## Inspected component seams

| Component | Package manager | Owned verification/build seam | Pack/profile seam | License finding |
| --- | --- | --- | --- | --- |
| DeepSeek Harness `29c8342` | pnpm `11.7.0` | serialized Windows and Linux primary CI, release-family verification, `build` | 221 DSH, 9 vendor, and 1 Landlock tarball; public profile/bundle/session metadata | MIT with root and generated third-party notices |
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

The opt-in real profile integration consumes the already accepted archives and contacts only the public npm registry for third-party dependencies:

```powershell
$env:RECURSUS_RUN_PROFILE_INTEGRATION = '1'
$env:RECURSUS_INTEGRATION_WORK_ROOT = 'D:\recursus-work'
$env:RECURSUS_PROFILE_PNPM_MODULE = 'D:\path\to\pnpm\bin\pnpm.cjs'
pnpm test:profile-integration
```

It installs all 244 accepted packages, proves repeated install/update are unchanged, verifies every archive and installed package, composes the default DSH configuration, proves the installed Honcho bundle is unmounted, removes the exact profile, and confirms unrelated profiles, settings, credentials, repositories, caches, memory, and artifacts survive.

The opt-in pinned integration fetches only the public Codex adapter revision into the configured work root. It proves the real GitHub acquisition/reuse/revision seam, not Codex provider behavior.

The assembled smoke runner consumes one installed profile:

```sh
node scripts/run-assembled-smoke.mjs \
  --work-root /var/tmp/recursus-work \
  --dsh-home /var/tmp/recursus-dsh-home \
  --name recursus \
  --output evaluations/local-smoke-report.json
```

The default command never calls Codex or Honcho. Live checks additionally require `--live-codex`, `--codex-auth-file <absolute-host-path>`, or `--live-honcho`, plus the corresponding host credential. They use bounded synthetic input and should run only in an isolated acceptance environment. The runner refuses to overwrite a report.

The accepted Windows package run produced 244 archives: Harness 231, Codex 1, RLM 5, Honcho 6, and Dovetail 1. The prior Harness pin failed closed on 29 `package/lib/client.js` files whose `dsh-css` virtual-module comments retained the absolute source path. The owning fix derives repository-relative virtual IDs and scans each DSH/vendor tarball before publication handoff; reviewed Harness PR #1 returned through a Recursus pin. A later assembled-smoke integration required an owning public session-log seam; reviewed Harness PR #2 returned as pin `29c8342b37d76e5dd4ca8daff4beb7743b8e22a0`. Windows finalization independently re-inspected all 244 archives, matched them to component checkpoints, and generated package integrity with no timestamp or host path.

Linux component verification, build, package inspection, the Harness packed-consumer check, RLM Python tests, and Dovetail packaged validation all completed and produced the same 244 package paths and identities. Strict comparison against the Windows-accepted bytes failed, and a same-platform reproduction isolated the owner-level defect: two clean Harness packs at the same revision and toolchain had only 36 identical content hashes while 195 differed. One sampled `@deepseek-ai/dsh-agent-default-model` archive differed only in the key order of generated `package.json` `devDependencies`. Recursus did not normalize or accept those bytes. The next step is an owning Harness canonical-manifest and repeat-pack regression fix, returned through a reviewed pin, before Linux package, profile, and smoke evidence can be accepted.

RLM's aggregate `check` and Dovetail's aggregate `verify` assume build artifacts already exist, so their adapters invoke the same component-owned granular checks before build and their build-dependent E2E/package checks after build. Honcho's package checker is invoked directly with the exact pnpm module in `npm_execpath`. Harness's own packed-consumer verifier is recorded as Linux-only, matching its public Ubuntu release workflow.

The pinned Harness web replay ran with component-pinned Playwright Chromium, headless shell, and FFmpeg. The Linux replay passed 75 files and 253 tests, with one platform suite and 15 tests skipped by its declared conditions. The broader Linux Harness checks also exercised Bubblewrap and the packed-consumer verifier; its native fallback used work-root-local build tooling. These passing component checks establish compatibility, but they do not override the failed deterministic package comparison.

## Security, privacy, and limitations

- Acquisition and dependency restore perform public GitHub/package-registry egress. They read no provider credential and record no raw command output, environment dump, or absolute path as evidence.
- Absolute checkout paths remain local process state. Inspection rejects the exact work root in native, slash-normalized, and escaped forms. Package integrity contains only relative package paths, SHA-256 values, and byte sizes.
- The runtime and component build commands use operator-granted host access. Path checks do not make them a sandbox.
- Package inspection rejects undeclared output, archive traversal and links, source-control metadata, generated residue, credentials, developer-specific paths, corrupt headers, oversized input, and missing declared notices.
- Local acceptance does not override component redistribution status. The Codex adapter remains blocked from redistribution pending owner-selected terms, and Dovetail remains subject to composite review.
- Windows profile evidence proves local installation and compatibility; Linux profile evidence remains pending accepted deterministic packages. Neither is publication or a release.
- Live Codex and Honcho acceptance is intentionally absent from default CI and requires explicit credentials and flags.
- No DeepSeek model-provider live call is required by §20.5 and none was made by the assembled smoke.

Milestone 1 is not complete. The next delivery step is to land the owning Harness deterministic-pack fix and regression test, return it through a reviewed Recursus pin, then produce accepted Linux package, profile, default-smoke, notice, secret, path, and clean-machine evidence for `SPEC.md` §20.6.
