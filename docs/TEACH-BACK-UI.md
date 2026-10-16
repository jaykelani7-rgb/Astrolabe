# Teach-back website handoff

16 October 2026 · follow-up to integration commit `5269d66` on `walkthrough-qa`.

## Delivered

After a prediction attempt, supported checkpoints now show **Explain in your own words**. Save 10–2,000 characters, inspect the returned concept source, assess each concept as explainable, missing or uncertain, and save the self-review. Missing/uncertain concepts produce their own source-linked practice actions. A follow-up to the current checkpoint reopens its prediction form; another task opens in its walkthrough. Learners can revise their explanation and start a fresh assessment.

Saved explanations, assessments and follow-ups resume after navigation and reload in the same signed anonymous session. Nothing is automatically graded as mastery. Every supported checkpoint has a prepared concept rubric; independent human review is still pending.

Current default-snapshot support: **Will subscribers hear this?** and **Find the merge decision**. The ordering and React-initial-snapshot checkpoints explicitly say no prepared teach-back rubric exists. The backend also supports the mitt dispatch rubric, but snapshot selection is a separate unfinished website feature.

## Contracts and safeguards

- `GET /api/teach-back?taskId=...&snapshotId=...&contentVersion=...` returns availability and the latest matching saved submission, or `null`. It uses the signed session, validates task/snapshot/content version and returns `Cache-Control: no-store`. It does not expose another session's prose or an answer key.
- `POST /api/teach-back` still requires a prior prediction. It returns submission, task, snapshot and content-version identifiers plus review concepts.
- `POST /api/teach-back/review` requires every concept exactly once and rejects a stale stored content version. Self-review cannot access another session/snapshot's submission.
- Loading, draft validation, request failure and retry states are visible. Failed saves retain the current draft/assessment. Requests have 15-second timeouts; an ambiguous save timeout tells the learner to reload and check before resubmitting.
- Component identity and request generations prevent late responses from replacing another task's explanation.
- Session reset clears teach-back records along with attempts/hints. Saved answers, goals, notes and walkthrough position retain their existing behavior.

## Verification

**Final results:** 133/133 unit/service tests, 17/17 browser journeys, 16/16 production HTTP groups, TypeScript and production build all passed. `git diff --check` passed. Production HTTP evidence is retained in ignored `.data/verification/http-2026-10-16T17-00-17-002Z/report.json`. Browser checks cover desktop and 390px layouts; save failure/draft retention; loading retry; review failure/selection retention; revision; all-concepts-explainable state; current-task and different-task practice; citation navigation; reload; delayed responses; and reset.

Production HTTP checks include the new resume endpoint, private sessions, stale-version rejection, survival across a process restart and removal on reset. The isolated test server disables AI; no local/cloud model quality claim follows from these checks.

## Review it yourself

1. Open `http://127.0.0.1:3000/`, choose **Learn**, and open the first walkthrough.
2. At **Predict an unchanged reference**, make any prediction.
3. Below its feedback, save your explanation. Compare both concepts against **Check concept source**.
4. Mark one concept **I am unsure** and the other **I can explain this**. Save self-review and open the suggested source/practice.
5. Reload or leave and reopen the checkpoint. The saved explanation and review should return. Use **Revise my explanation** to replace it with a fresh revision and assessment.
6. In a fresh private browser session, this explanation should not appear. Resetting the original session clears its practice records.

The local preview still uses the existing loopback LM Studio configuration. Teach-back does not call a model.

## Remaining

Saved-goal controls and ranked contribution/remediation UI are next. Notebook/bookmark controls, snapshot selection/comparison, global code search, independent content review and participant evaluation remain as listed in `NEXT-STEPS.md`. Unsaved teach-back drafts are component-local and do not survive leaving/reloading; only explicitly saved explanations resume. The interface shows the latest saved explanation for each current task/version, not a full revision-history screen. Existing storage bounds retention to 100 teach-back records per session/snapshot. No database migration or new dependency was needed.

Initially left uncommitted for owner review. The owner subsequently authorized the assistant to commit and push this follow-up using the owner’s configured Git identity.
