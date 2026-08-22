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

Package output begins empty and may contain only declared tarballs and declared release metadata. Inspection parses archives without extracting them and rejects traversal, links, source-control metadata, generated residue, credential-shaped content, developer-specific absolute paths, the exact configured work root in native, slash-normalized, or escaped form, missing notices, duplicate entries, corrupt headers, and oversized input. Retained lifecycle evidence stores counts and hashes, not raw command output. Package integrity is emitted only when every component passes. The current Windows evidence records 244 accepted archives with no credential, developer-path, source-control-metadata, or package-boundary finding.

## Reporting

Report security issues privately to the repository owner through GitHub's private vulnerability reporting when enabled. Do not open a public issue containing credentials, exploit details against a live system, private memory, or sensitive filesystem paths.
