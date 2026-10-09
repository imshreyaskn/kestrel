---
trigger: model_decision
description: Apply after implementation or when reviewing a patch, pull request, bug fix, refactor, or test change.
---

# Skeptical Diff Review

Review the actual complete diff against the acceptance criteria. Assume the implementation may be wrong until supported by evidence.

Look for:
1. Symptom suppression instead of root-cause correction.
2. Incomplete vertical slices, placeholder behavior, dead endpoints, disconnected UI controls, fake persistence, or mocked-away functionality.
3. Tests that assert too little, skip the defect, weaken existing expectations, or merely mirror the implementation.
4. Unnecessary changes, overengineering, duplicated business logic, wrong abstraction boundaries, and dependency churn.
5. Missing input validation, authorization, error semantics, cleanup, timeouts, transaction safety, concurrency controls, or observability where relevant.
6. API/schema/type mismatches and unupdated consumers.
7. Unhandled edge cases and compatibility regressions.
8. Dead code, stale comments, debug prints, accidental formatting, secrets, and unrelated files.
9. Claims in the final report that are not supported by command output or observed runtime behavior.

For each finding, state severity, file/area, concrete failure scenario, and why it matters. Distinguish proven defects from questions or speculative concerns. Fix confirmed defects when in scope, then rerun relevant checks. If a fix expands scope or introduces risk, stop and ask the user.

Do not approve a patch because it compiles, because tests are green, or because the implementation looks plausible.
