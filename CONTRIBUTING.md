# Contributing

Recursus is implementing Milestone 1. Start with an issue tied to a milestone in `GAMEPLAN.md` and describe the acceptance evidence before implementation.

## Where changes belong

- Runtime assembly, durable-run services, supervision, completion contracts, coordination, context compilation, routing, and release integration belong here.
- Generic model-provider changes belong in `deepseek-openai-codex`.
- Generic kernel, snapshot, or recursive-agent changes belong in `deepseek-rlm`.
- Generic memory and artifact changes belong in `deepseek-honcho`.
- Generic workflow/skill changes belong in `deepseek-dovetail` or its recorded upstream.
- Generic DSH control-plane changes belong in the DSH fork and should remain upstream-ready.

After a component change merges, update the Recursus component pin in a separate integration pull request with compatibility evidence.

## Pull requests

Every pull request should state:

- milestone and objective;
- affected component revisions;
- authority and licensing impact;
- tests and real integration evidence;
- remaining limitations;
- whether package, notice, or provenance output changed.

For assembly changes, use Node.js `22.19.0` or a supported Node.js 24 release and pnpm `11.19.0`, then run:

```sh
pnpm install --frozen-lockfile
pnpm check
```

Run the opt-in public-pin acquisition separately with an absolute ignored work root. It performs public GitHub egress but uses no provider credential:

```powershell
$env:RECURSUS_RUN_PINNED_INTEGRATION = '1'
$env:RECURSUS_INTEGRATION_WORK_ROOT = (Resolve-Path artifacts).Path + '\integration-work'
pnpm test:integration
```

Run real component assembly separately because it performs public dependency egress and the pinned component test suites are intentionally broad:

```powershell
$env:RECURSUS_WORK_ROOT = (Resolve-Path artifacts).Path + '\assembly-work'
pnpm assemble:packages
```

If a later component fails after earlier components checkpoint successfully, retry only the failed logical component with `RECURSUS_COMPONENTS`, then run `pnpm assemble:finalize`. Never recover or finalize a package directory that did not visibly complete the common lifecycle; finalization re-inspects bytes but does not replace component-owned verification.

Keep commits reviewable, preserve unrelated work, and do not publish packages or releases without explicit approval.
