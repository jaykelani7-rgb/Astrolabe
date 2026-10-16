# Backend upgrade handoff

This branch extends the existing prototype without editing UI components, pages, CSS or browser tests. The default Zustand journey and the original top-level Q&A response fields remain compatible. New capabilities are available through APIs; the UI owner must connect them before claiming an end-to-end screen feature.

## Implemented capabilities

- Explicit selection, file and repository question scopes. Repository retrieval diversifies files, considers bounded direct import neighbors, suppresses redundant ranges and retains the eight-chunk/10,000-character budget.
- Live structured answer blocks with observed, inferred or unknown status and per-block evidence IDs. Missing or invented references fail closed. `answer` and `citations` remain present for the existing interface.
- Additive `reviewState: authored | generated` metadata. Existing prepared `mode: reviewed` is retained for compatibility; the UI should display authored/prepared, not independently human-reviewed. No independent human review is claimed.
- Signed-session answer history retaining the original question, context, model, response and citations. Source navigation does not delete the stored answer. The upstream redesign already preserves browser history. This adds signed-session server history without replacing that UI behavior.
- Authored, cited architecture overviews and suggested reading orders for Zustand and mitt.
- Transactional migration of attempts and hints into snapshot/content-version namespaces. Existing records are retained under the original Zustand v1 content. No destructive reset is needed.
- A second real public repository, developit/mitt, at two exact upstream commits. Both source files match their upstream Git blob hashes. License and provenance are bundled. Each snapshot has its own authored guide, two prediction tasks and a documentation brief.
- Teach-back after a prediction, with concept rubrics, persisted explanations, explicit learner self-assessment and concept-specific follow-up recommendations. No keyword-based mastery score is fabricated.
- Saved learning goals and deterministic contribution ranking. Missing prerequisites produce remediation; unsupported test/debug contributions are not invented when upstream tests are absent.
- Session-scoped bookmarks, Markdown notebook export, pinned source permalinks, saved walkthrough position and freshness warnings against another snapshot.
- Manual snapshot comparison with changed/added/deleted files and dependent authored-content review flags. Old citations remain attached to their original commit. Formatting changes conservatively count as potentially stale.
- A non-overwriting live-provider verification command and a participant-data analysis command.

## Scope contract

`POST /api/questions` accepts the existing body plus optional `scope`:

```json
{
  "snapshotId": "zustand-0ea8be27db13",
  "question": "How do useStore and createStore connect?",
  "scope": "repository",
  "depth": "developer"
}
```

- `selection` requires a file ID and both inclusive 1-based line boundaries; it retrieves only that range.
- `file` requires a file ID and stays inside it, including prepared-answer references.
- `repository` searches the snapshot globally; a supplied file ID is a ranking hint. Source selections do not restrict it.
- Omitted scope preserves the upstream behavior: exact selection when line boundaries exist, file scope for a file ID alone, walkthrough context for a guide ID, and repository scope otherwise. The frontend may omit file/guide context for repository scope, as the upstream redesign already does, or explicitly send `scope: repository`.

A successful response retains `answer`, `citations`, `mode` and `limitations`, and adds `blocks`, `reviewState` and `answerId`. Each source-based block has evidence IDs from the supplied context. Unknown blocks have no evidence. Citation structure is not a semantic fact checker; human claim review remains necessary.

## API inventory for the UI owner

| Endpoint                                                 | Contract                                                                                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/snapshots`                                     | Lists the bundled ready snapshots                                                                                                   |
| `GET /api/repository?snapshotId=...`                     | Metadata and files for a selected snapshot                                                                                          |
| `GET /api/repository/map?snapshotId=...`                 | Selected snapshot's static imports                                                                                                  |
| `GET /api/repository/source?fileId=...&snapshotId=...`   | Selected source; IDs cannot cross snapshots                                                                                         |
| `GET /api/evidence/[id]?snapshotId=...`                  | Exact historical evidence                                                                                                           |
| `GET /api/architecture?snapshotId=...`                   | Authored responsibilities, evidence and reading order                                                                               |
| `GET /api/guides?snapshotId=...`                         | Public guides/tasks, content versions and review metadata                                                                           |
| `GET /api/tasks/[id]?snapshotId=...`                     | Public task without an answer key                                                                                                   |
| `POST /api/tasks/[id]/attempt`                           | Existing body; additionally accepts `contentVersion`, and echoes version/snapshot metadata in feedback                              |
| `POST /api/tasks/[id]/hint?snapshotId=...`               | Hint in the selected snapshot/content version                                                                                       |
| `GET /api/results?snapshotId=...`                        | Snapshot-isolated practice summary                                                                                                  |
| `POST /api/questions`                                    | Scoped question and persisted answer                                                                                                |
| `GET /api/questions/history?snapshotId=...`              | Signed-session answers with original context; no other session's answers                                                            |
| `GET /api/contributions?snapshotId=...&goal=...`         | Ranked briefs with prerequisite/remediation explanations                                                                            |
| `POST /api/learning/goal`                                | `{snapshotId, goal}`; goal is architecture, debug, tests or documentation                                                           |
| `GET /api/learning/goal?snapshotId=...`                  | Saved goal or null                                                                                                                  |
| `POST /api/teach-back`                                   | `{snapshotId, taskId, contentVersion, text}` after an attempt                                                                       |
| `POST /api/teach-back/review`                            | `{snapshotId, submissionId, assessments:[{conceptId,state}]}`; assess each concept exactly once as understood, missing or uncertain |
| `POST /api/notebook/bookmarks`                           | `{snapshotId,title,note?,answerId?,evidenceIds?,briefId?}`; answer IDs must belong to the signed session                            |
| `GET /api/notebook?snapshotId=...&againstSnapshotId=...` | Markdown download; second ID optional for source freshness                                                                          |
| `POST /api/progress`                                     | `{snapshotId,guideId,stepId}` validated against that snapshot                                                                       |
| `GET /api/progress?snapshotId=...`                       | Saved walkthrough position                                                                                                          |
| `POST /api/snapshots/compare`                            | `{fromSnapshotId,toSnapshotId}` for the same upstream repository                                                                    |
| `POST /api/session/reset`                                | Clears this signed session's practice and teach-back; saved notes, answers, goals and position remain                               |

All new handlers use the Node runtime. Session data uses `Cache-Control: no-store`. The existing error envelope remains unchanged. Empty/wrong snapshot IDs and mismatched content versions must not be silently substituted.

## UI work intentionally untouched

The upstream UI already supplies source/walkthrough scope controls and navigation history. The UI owner can render claim-block citations/review status, optionally connect signed-session server history, show architecture/teach-back/goals/notebook controls, and expose snapshot selection/comparison. Existing hardcoded filenames and range inputs should use returned metadata. The upstream mission component now restores feedback through its progress endpoint. Continue to ignore any response whose task/snapshot/version is no longer active; no UI logic was rewritten here.

Backend response metadata makes those checks possible but does not repair an unmodified component. No layout, font or styling edits are included in this branch.

## Verify locally

```sh
npm ci
npm run setup
npm run typecheck
npm test
npm run build
npm run verify:http
npm run verify:live
```

`verify:live` explicitly loads `.env.local` if present, disables prepared matching/cache and writes a timestamped report under `.data/verification/`. If no key exists, it writes a blocked record, makes no provider request and exits 2. It never prints the credential. Live results still need independent source review.

`verify:http` starts a loopback production server on an available port with a separate database and signing-key directory under `.data/verification/http-<timestamp>/`. It disables live AI, waits for readiness, runs HTTP assertions, restarts the process to check durable sessions, and stops its server. Its JSON report and server log remain in that directory. Build first; the command never contacts Gemini or resets the normal demonstration database.

For development evaluation, preserve the original committed offline report. The existing `evaluate:qa` command writes a reusable development report; do not mistake it for live-provider evidence. Held-out questions are not used to tune these changes.

## Peer study preparation

Use 6–8 peers unfamiliar with the source. Each participant completes one ordinary-browsing trial and one mentor trial using different matched task variants. Counterbalance condition order. Keep the snapshot, time limit and scoring rubric fixed. Record anonymous IDs, familiarity, order, condition, task variant, elapsed seconds, correctness, hints, evidence found and explanation score.

The analysis input is an object with `rubricVersion`, a reviewer identifier and `trials`. Each trial contains:

```json
{
  "participantId": "anonymous-id",
  "familiarity": "none",
  "condition": "browsing",
  "order": 1,
  "taskVariant": "variant-a",
  "snapshotId": "zustand-0ea8be27db13",
  "elapsedSeconds": 120,
  "correct": false,
  "hints": 0,
  "evidenceFound": false,
  "explanationScore": 0
}
```

This is a schema example, not collected participant data. Use explanation scores 0–3 against a fixed rubric: 0 incorrect/unexplained, 1 partial concept, 2 correct main behavior with a missing boundary, 3 correct behavior and relevant boundary with source support. A reviewer applies it; code cannot establish task equivalence.

Run `npm run evaluate:peers -- input.json output.json`. The command rejects incomplete pairs, repeated task variants and mixed snapshots, and reports counts/medians with small-sample limitations. Store only consented anonymous observations. No learning-effectiveness result is claimed until real trials are collected.

## Remaining external verification

Real Gemini success, independent human review and participant outcomes cannot be completed without the corresponding credential/reviewers/participants. Browser verification was rerun during recovery, with the failures below preserved. The backend tests and build are separate evidence and do not replace those checks.

## Recovery verification — 2026-10-16

- Recovered in a new Windows checkout on `codex/backend-mentor-recovery`. Fetched `origin/main` remained at `bf61b7dcee421ee41202adc9dfb7ee5b8d0960ea`. The supplied handoff patch passed `git apply --check` and applied cleanly. The original Linux checkout, checkpoint `3881207` and pending merge were unavailable; no merge was fabricated or replayed.
- Read this handoff, `AGENTS.md`, `plan.md`, `README.md` and the installed Next.js route-handler guidance. Components, pages, styles, mission interfaces, client workspace code and browser test sources remain identical to upstream.
- Fixed two Windows verification issues: `.gitattributes` prevents conversion of immutable snapshot bytes, and the repository tampering test passes a `file:` URL to Node's `--import` loader. Runtime integrity validation remains strict. Restored source bytes match every bundled manifest.
- `npm ci` and `npm run setup`: passed with Node 24.20.0 / npm 11.19.0. Pinned dependencies were retained. npm reported two low-severity dependency advisories; no forced dependency upgrade was applied.
- `npm test`: **107/107 passed** in five files, including legacy SQLite migration, concurrent writers, snapshot/version isolation, retrieval boundaries, citation rejection and signed-session history.
- `npm run typecheck`: passed. `npm run build`: passed with Next.js 16.4.1.
- `node scripts/verify-http.mjs` (`npm run verify:http`): **16/16 assertion groups passed** against the production server. Covered all three snapshots, source/map/evidence/architecture/public task routes, invalid input, hints, attempts, original answer context, independent and tampered sessions, self-assessment, goals, bookmarks, Markdown export, comparison, process restart persistence and session-specific reset. This completes the previously interrupted production HTTP smoke verification.
- Development Q&A evaluation: **16 questions**, four authored prepared answers, three evidence gaps, nine unavailable responses, **zero live answers** and zero invalid references among the four referenced responses. Eight held-out questions were excluded. The previously committed offline report was preserved; recovery measurements are separate artifacts. Local timing is not provider latency.
- Chromium installation succeeded. The unchanged Playwright suite finished **8/10 passed**. The full browser suite is **not green**. Failure 1: `journey.spec.ts:151` observed a request carrying lines 88–92 after the test clicked the 66–81 citation. Failure 2: `walkthrough-scope.spec.ts:115` could not focus the mobile "This walkthrough" radio after ArrowRight; the captured page had the Files & flow panel active. These require UI/test-owner investigation. No UI fix, test relaxation or claim that these failures predate recovery is included. Traces, screenshots and videos were retained.
- `npm run verify:live`: wrote `status: blocked`, `reason: missing_server_credential`, `liveRequests: 0`. No real Gemini success or latency was verified.

Lexical retrieval is not a semantic support test. In production HTTP verification, the PostgreSQL migration question matched Zustand's persisted-state migration text and returned `unavailable` with no citations because Gemini was absent. The unrelated Kubernetes question returned `evidence_gap`. Neither outcome establishes factual correctness. Independent human review, real participant trials and live-provider verification remain pending. Teach-back remains learner self-assessment, not an automatic mastery score. New API capabilities still need UI integration by the UI owner.

## Delivery boundary

The recovered changes are local on `codex/backend-mentor-recovery`; the supplied patch originated from `codex/backend-mentor-upgrades`. Do not push or publish until the owner explicitly instructs it after reviewing the completion report. Public arbitrary-URL ingestion, generated tours, automatic patching and code execution remain outside this branch; the second repository is explicitly prepared and pinned.
