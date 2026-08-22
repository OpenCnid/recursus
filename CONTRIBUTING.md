# Contributing

Recursus is in its foundation stage. Start with an issue tied to a milestone in `GAMEPLAN.md` and describe the acceptance evidence before implementation.

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

Run:

```sh
node scripts/verify.mjs
```

Keep commits reviewable, preserve unrelated work, and do not publish packages or releases without explicit approval.
