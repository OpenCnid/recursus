# Recursus assembly contracts

This private package owns the provider-neutral Milestone 1 assembly manifest, adapter lifecycle, work-root containment, and read-only Git acquisition behavior. It does not contain component source, start an agent loop, install a DSH profile, or hold credentials.

The common lifecycle is `inspect → acquire → verify revision → restore dependencies → verify source → build → pack → inspect package`. Concrete build and pack adapters must use the commands recorded from each component at its exact revision in [`../../manifests/assembly.json`](../../manifests/assembly.json).

Callers must provide an absolute Recursus work root. Source checkouts, caches, and package output are resolved as path components beneath that root. Acquisition rejects traversal, symlinks at managed directory boundaries, dirty reused checkouts, origin mismatches, and revision mismatches.

The package returns absolute checkout paths only as process-local state needed by later lifecycle steps. Publishable evidence uses the relative work path and immutable revision returned separately; it must never serialize the absolute work root.
