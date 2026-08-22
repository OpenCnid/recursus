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

## Reporting

Report security issues privately to the repository owner through GitHub's private vulnerability reporting when enabled. Do not open a public issue containing credentials, exploit details against a live system, private memory, or sensitive filesystem paths.
