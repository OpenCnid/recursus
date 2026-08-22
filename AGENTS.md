# Agent instructions

These instructions apply to the entire Recursus repository.

## Product boundary

- DeepSeek Harness remains the sole agent runtime and control plane.
- Recursus owns integration, durable run services, supervision, verification, coordination, context selection, routing, packaging, and release evidence.
- Component implementations remain in their owning repositories.
- Do not copy component source or history here merely to simplify development.
- Honcho is fallible memory, never active run truth, current-code truth, or policy.
- Exact result bytes belong in the project-local artifact store.
- Full host access is intentional; describe it accurately and preserve exact-target and irreversible-action safeguards.

## Development method

1. Read `README.md`, `SPEC.md`, `GAMEPLAN.md`, `docs/ARCHITECTURE.md`, and `THIRD_PARTY_NOTICES.md` before architectural changes.
2. Tie work to one game-plan milestone and concrete acceptance criteria.
3. Preserve exact component revisions until an explicit compatibility update.
4. Make generic component changes in the component repository first, then update the reviewed Recursus pin.
5. Keep service definitions and provider implementations separable.
6. Prefer versioned, provider-neutral contracts and standard-library utilities.
7. Add focused tests plus the smallest real assembled integration that proves the behavior.
8. Run `node scripts/verify.mjs` before committing foundation changes.
9. Inspect staged files explicitly; do not stage unrelated changes.
10. Do not commit credentials, personal memory, live provider content, developer paths, or generated component worktrees.

## Licensing and credit

- The root MIT license covers original Recursus work only.
- Preserve every external license, notice, source locator, and revision.
- Do not describe public visibility as a license grant.
- Do not redistribute a component whose owner has not selected compatible terms.
- Credit upstream work specifically without implying endorsement.

## Completion

Do not mark work complete while required tests, compatibility checks, package inspection, provenance, or CI remain failing. Report every unmet criterion and the exact next change required.
