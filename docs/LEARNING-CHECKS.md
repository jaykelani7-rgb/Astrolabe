# Learning and browser verification

Observed on 15 October 2026 against pinned Zustand commit `0ea8be27db13019819fc1c0492e5b672dd7b6f4b`.

## Learning checks

`npm test -- tests/learning.test.ts` passed all **5 tests**. The checks cover both guides and every referenced source range; four correct and incorrect rubrics; absence of private answer/rubric/feedback fields from initial public payloads; malformed JSON, oversized requests, unknown choices, repeated ordering IDs, invalid ranges, and snapshot mismatch; retry and cumulative hint accounting; forged-session rejection; and session-scoped reset isolation.

The four tasks are same-reference notification (choice), state update sequencing (ordering), the merge/replacement assignment at vanilla lines 75–78 (range), and React's selected initial snapshot (choice). Range scoring accepts property order differences but requires the exact inclusive range. Completion means a task has had at least one correct attempt; the summary also retains first-attempt correctness, total attempts, hints, and latest result.

The anonymous session cookie is signed, HttpOnly, and SameSite=Lax. A persistent local signing secret keeps the same browser session usable after restart. Sessions are for the local prototype, not authentication. Hints are counted by request, so fetching a hint again after reopening a task records another request. Reset clears only the caller's attempts and hints.

## Browser checks

The final run used installed Google Chrome via:

```sh
MENTOR_E2E_URL=http://127.0.0.1:3000 MENTOR_E2E_CHANNEL=chrome npm run test:e2e
```

All **4 browser tests passed** in **19.4 seconds**, with no reported browser page errors in the full journey:

1. Pinned repository, module-map click, every step in both walkthroughs at both explanation depths, evidence targets, all four task interactions, an incorrect/correct retry with one hint, prepared Q&A, strict question validation after an evidence click, an unsupported-question evidence gap, task results, both briefs, and reset.
2. All external network requests blocked: the locally bundled Monaco editor initializes; guides, task scoring, feedback, and evidence remain usable.
3. A 390-pixel viewport: navigation opens the explorer and tasks, a task can be submitted, and the page has no horizontal overflow.
4. Two independent browser sessions: attempts remain isolated, another session cannot reset them, and wrong-snapshot attempts fail explicitly.

The browser range task was exercised through its explicit line-entry controls. The source viewer's selection-to-range integration is implemented, but this run does not independently prove every mouse/keyboard selection gesture.

## Recorded artifacts

- `docs/demo.webm`: actual application footage from the passing full journey; automated and unnarrated.
- `docs/preview.png`: desktop overview.
- `docs/preview-prediction.png`: desktop source and feedback.
- `docs/preview-results.png`: results and a brief with rationale tied to actual task results.
- `docs/preview-mobile.png`, `docs/preview-mobile-prediction.png`: 390-pixel views.

The desktop prediction, desktop results, and mobile prediction captures were visually inspected. The footage shows browser verification at automated speed, not a five-minute presentation. See `docs/DEMO.md` for the live demonstration sequence.

Independent human review of every prepared explanation/rubric, live Gemini quality checks, held-out evaluation, and the proposed peer participant study remain pending. Passing software checks and structurally valid source references do not establish learning effectiveness or professional readiness.
