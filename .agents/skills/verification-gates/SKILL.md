---
name: verification-gates
description: Use when planning, implementing, debugging, reviewing, or declaring completion for a feature in The Lenny Growth Assistant. Enforces small phases, evidence-backed claims, and meaningful quality gates.
---

# Verification Gates

## Before editing
1. Read the relevant requirements and acceptance criteria in `IMPLEMENTATION_SPEC.md`.
2. Inspect the current implementation, git status, package manifests, and tests.
3. State the goal, invariants, files expected to change, test plan, and likely risks.
4. If the required behavior depends on a current external SDK, read current official documentation and check installed versions before writing code.

## During implementation
1. Make one cohesive change at a time.
2. Add explicit schemas and boundary validation before plumbing data through UI/services.
3. Keep external effects behind interfaces so tests can replace them.
4. Add a negative test for the most important failure mode for each critical feature.
5. Never use a broad exception handler that turns a failure into a success-shaped response.
6. Do not modify a test merely to match an implementation that violates the specification.

## Required verification before reporting completion
- [ ] Formatter and linter run; type checking where applicable.
- [ ] Relevant unit tests run.
- [ ] Relevant integration tests run, or are explicitly marked not run with the blocker stated.
- [ ] Migrations and schema consistency checked.
- [ ] Security/authorization boundary checked for changed paths.
- [ ] Logs/errors reveal enough to diagnose failures without leaking secrets or full private content.
- [ ] Documentation updated to match actual behavior.
- [ ] `git diff` reviewed for unintended changes, secrets, dead code, fake data, and stale TODOs.

## Reporting format
Report:
- Implemented behavior
- Files changed
- Commands actually run
- Tests passed/failed/not run
- Limitations and risks
- Next smallest step

Never write “all tests pass” if any required test was not run, and never infer runtime success from a successful build alone.
