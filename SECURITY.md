# Security and operating model

## Full-access runtime

Recursus is designed for an operator who intentionally grants the agent normal host access. It is not a security sandbox and does not claim containment of Python, shell commands, subprocesses, files, or network activity.

This posture prioritizes capability and does not eliminate operational safety:

- resolve destructive targets exactly;
- preserve unrelated and uncommitted user work;
- prefer recoverable operations;
- keep credentials in host-owned providers and out of model/kernel context;
- use deterministic identities or reconciliation for retried external mutations;
- require explicit authority for publishing, spending, deletion, live-data mutation, or credential changes;
- verify completion through current files, tests, and CI.

## Secrets

Do not commit API keys, OAuth tokens, browser state, Honcho credentials, private memory, environment dumps, or provider error bodies that may contain sensitive values. Release packages and evidence reports must be scanned for credentials and absolute developer paths.

Component-specific credential handling remains governed by each component's security documentation. Recursus assembly must not weaken those boundaries.

## Memory and artifacts

Honcho recall is untrusted context. Current files, tests, explicit corrections, DSH policy, and durable run state take precedence.

Artifact roots, RLM session roots, Honcho outboxes, and run-state stores may contain sensitive local data. Keep them outside source control and define backup, retention, export, and deletion ownership before production use.

## Assembly acquisition

Component acquisition accepts only the immutable Git commits and credential-free GitHub HTTPS repositories in the validated assembly source lock. The operator supplies an absolute Recursus work root. Managed source, cache, and package paths are resolved as path components beneath that root; traversal, drive-qualified relative paths, prefix collisions, symlinks at managed boundaries, dirty reused checkouts, wrong origins, and wrong commits fail closed.

GitHub receives ordinary public Git fetch traffic during acquisition. No Codex, Honcho, or other provider credential is read or sent. The acquisition result keeps the absolute checkout path only as process-local state for later lifecycle phases; retained evidence contains the repository, revision, relative managed path, and reuse status.

Dependency restore, build, test, and package commands run with the host access granted by the operator. Their known npm, pnpm, uv, pip, XDG, and exact-tool caches are redirected beneath the work root; Git prompts are disabled; credential-shaped environment variables are removed from component command environments. These controls do not make the build a sandbox.

Package output begins empty and may contain only declared tarballs and declared release metadata. Inspection parses archives without extracting them and rejects traversal, links, source-control metadata, generated residue, credential-shaped content, developer-specific absolute paths, the exact configured work root in native, slash-normalized, or escaped form, missing notices, duplicate entries, corrupt headers, and oversized input. Retained lifecycle evidence stores counts and hashes, not raw command output. Package integrity is emitted only when every component passes. Windows evidence records 244 accepted archives with no credential, developer-path, source-control-metadata, or package-boundary finding. Linux finalization failed closed before evidence was accepted because repeated Harness packs did not reproduce identical contents.

## Isolated profile lifecycle

Locked distributions are input-addressed beneath the operator's work root and contain only re-inspected accepted archives, the checked path-free profile lock, and a deterministic manifest. Profile operations require an explicit absolute DSH home and portable profile name. Reserved Windows device names, traversal, separators, symlinked managed roots, unowned profiles, mismatched ownership markers, package identity drift, lockfile drift, archive drift, and physical paths in generated text fail closed.

Profile installation uses exact pnpm `11.19.0` with lifecycle caches beneath the work root. Credential-shaped environment variables are removed before package-manager execution. Generated configuration records only the host-owned references `DEEPSEEK_API_KEY`, `OPENAI_CODEX_OAUTH`, and `HONCHO_API_KEY`; it never resolves or copies their values. Honcho packages are present but unmounted by default, and the profile does not create or modify the host credential store.

The profile CLI emits bounded JSON evidence. Expected failures expose only a stable Recursus error code and sanitized message; raw package-manager output, environment values, stack traces, and physical paths are not retained.

Update moves only a marker-owned exact profile to a validated sibling backup, installs at the final profile path, and rolls back on failure. Removal requires realpath containment and the matching Recursus marker before recursively deleting that one profile. It does not delete the DSH home, other profiles, settings, credential files, source repositories, component or lifecycle caches, memory, or artifact roots.

## Assembled smoke and live acceptance

The default assembled smoke does not contact Codex or Honcho. It uses deterministic doubles for those provider boundaries while exercising the installed DSH authorization and audit path, persistent RLM kernel, exact local artifact store, and packaged Dovetail skill provider. Reports record hashes and bounded status fields rather than prompts, model output, memory content, environment values, or physical paths.

Live provider acceptance is separately opt-in. The worker environment removes credential-shaped variables before packaged computation starts. The Codex check reads a host-owned authorization file only when explicitly named, keeps the decoded token in memory, bounds the synthetic request by model, reasoning effort, output tokens, and timeout, and never serializes credential material. The Honcho check admits only its explicitly required host key, removes it from the worker environment before RLM starts, exposes it briefly while the Honcho provider captures its configuration, and then removes it again. It sanitizes a fixed synthetic record, creates a uniquely fenced synthetic workspace, searches only that workspace, deletes its sessions and workspace, and verifies the workspace is absent. Content-free recovery manifests are stored under the ignored work root so an interrupted cleanup can be reconciled without retaining the synthetic memory text or credential value. Live provider failures must be treated as compatibility evidence, not copied wholesale into reports.

## Reporting

Report security issues privately to the repository owner through GitHub's private vulnerability reporting when enabled. Do not open a public issue containing credentials, exploit details against a live system, private memory, or sensitive filesystem paths.
