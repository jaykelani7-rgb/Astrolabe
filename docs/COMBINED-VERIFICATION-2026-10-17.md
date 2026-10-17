# Integrated application verification — 17 October 2026

Verified local `krishna` after merge `6090c8bd78ee39edfafcbf200409924459edb397`. Both backend `acf8634e85b14ae75a734349671769bb24ceaf8e` and UI `3507f93cb728163f57f593e2907c410d5484d0a7` were confirmed ancestors of HEAD. The starting working tree was clean. This report supersedes the interface-gap and browser-failure statements in the earlier backend checkpoint; earlier live-provider observations remain historical.

## Final results

| Check | Observed result |
| --- | --- |
| `npm test` with disabled provider and blank key | 167/167 passed, 12 files |
| `npm run typecheck -- --incremental false` | Passed, including after restoring the tracked generated declaration file |
| `npm run build` | Passed, integrated production build |
| `npm run verify:http` | 19/19 groups passed, isolated database/signing directory, including process restart |
| Focused claim/history/walkthrough browser regressions | 3/3 passed |
| Full Playwright browser suite | 35/35 passed, no retries, no skipped or flaky tests, about 1.7 minutes |
| Production preview on port 3310 | Homepage HTTP 200; actual Gemini configuration restored, configured=true, health remains unverified |
| Live Gemini requests | **Zero** during this verification; live verifier/evaluation commands were not run |
| Protected storage/configuration | Starting and ending SHA-256 hashes match for `.env.local`, `data/mentor.sqlite`, `.data/session-secret`, existing preview database and preview session secret |

Tooling: Node 24.19.0, npm 11.19.0, installed pinned dependencies. The downloaded Playwright Chromium executable was absent; the suite used installed Chrome through the supported `MENTOR_E2E_CHANNEL=chrome` option. Optional video recording was disabled; failure traces/screenshots and JSON reports were retained privately. Browser assertions, timeouts and retry settings were not weakened.

Final HTTP artifact: `.data/verification/http-2026-10-17T07-10-33-750Z/report.json`. Final browser artifact: `.data/verification/combined-6090c8b/verified/browser-report.json`; focused report and fresh screenshots are in that same private verification directory. Earlier failed-run artifacts remain available separately. Test-written tracked screenshots and `next-env.d.ts` were restored to the initially clean committed versions; fresh screenshots were copied to ignored verification storage.

## Demonstrated defects and corrections

- The unit test `clearly reports missing credentials without falling back to an invented answer` inherited `AI_PROVIDER=disabled`. It expected `no server-side Gemini credential` but received `Live AI is disabled. Prepared questions, walkthroughs and tasks remain available.` The test now explicitly selects Gemini while retaining an empty key and all existing assertions. It makes no live request and also works under the disabled-provider CI environment.
- Three older browser scope checks rejected the newly explicit outbound `scope` field (`repository` or `walkthrough`); the selected-lines check also expected the older key set. Their exact object/key assertions now require the correct scope, with added file/selection value checks. Explicit scope was preserved in the application.
- `legacy history remains readable and stale walkthrough IDs fail explicitly without losing the draft or answer` expected the selected repository context, but received `This walkthrough · Beginner answerRetired walkthrough · Step: Retired step`. History reconciliation keyed different legacy entries solely by their shared answer ID, collapsing their original contexts. `QuestionPanel.mergeHistory` now matches legacy IDs using both answer identity and original request context, preserving unmatched legacy rows and the selected row. Canonical IDs retain the original POST metadata and claim blocks; server rows still establish chronology. The existing legacy and claim-kind browser assertions pass unchanged.
- `walkthrough questions retain their original flow and step through citations, navigation, history and depth replay` subsequently exposed a strict locator collision: `.mentor-context-notice` matched both the scope fallback notice and the new pinned-provenance paragraph. Its locator now targets the composer status message while preserving the expected fallback text. No provenance display was removed.

The first browser run was 31/35. An intermediate history implementation exposed a claim-preservation regression (`Expected: 3`, `Received: 1`) and was corrected before the final rebuild. The final focused and full runs pass the original claim-count assertions. No known failure was skipped or labelled passed.

## Verified connected interfaces

The production-backed browser suite exercises source exploration and canonical navigation, architecture reading order, both walkthroughs, predictions, hints/feedback, progress/reset, explicit question scopes, per-claim citations, original-context history, signed-session privacy and durable restoration, teach-back self-review/reload/recovery, goals and curated recommendations/prerequisite practice, notebook bookmark CRUD/conflict recovery/pagination/personal drafts/export, snapshot selection/comparison and pinned freshness, and code/symbol search with pagination. It also checks delayed-response isolation, desktop/mobile layouts and the former mobile teach-back reload race. These interfaces are now integrated; the earlier backend-only UI handoff list is historical for this merged checkout.

This coverage is not exhaustive proof of all UI behavior. Teach-back remains learner self-assessment, contribution ranking is curated ordering rather than mastery, and conservative freshness is not semantic change analysis. Independent human claim review and participant studies remain pending.

## Running demo and limitations

The integrated production demo is left at **http://127.0.0.1:3310/** using the actual ignored `.env.local` and the same pre-existing preview database/signing directory. Only this checkout's recorded preview was stopped before each rebuild; isolated HTTP/browser servers were stopped after verification. No test-only `AI_PROVIDER=disabled`, blank credential or fixed test signing secret was carried into the actual preview. The real default database and both signing secrets were preserved without reset or replacement.

No provider availability or answer correctness claim is made from this run: Gemini was deliberately not contacted. Historical provider 503/429 observations in the backend checkpoint are not fresh failures here. Missing bundled Chromium was handled using installed Chrome and did not block the suite. There is no remaining observed integration failure in the completed checks.

Only the history integration defect, test configuration/contract alignment and this handoff were changed. No new feature, push, deployment, PR or merge into main was performed. The local follow-up commit containing this report records the final code/tests; its exact SHA is returned in the completion message.
