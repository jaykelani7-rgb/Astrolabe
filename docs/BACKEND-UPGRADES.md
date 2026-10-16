# Backend upgrade handoff

## Gemini adapter correction — 17 October 2026

Local changes on `krishna` correct `generationConfig.responseFormat.text.mimeType` from the HTTP MIME string to the API enum `APPLICATION_JSON`. The actual HTTP Content-Type remains `application/json`; schemas, citation validation, evidence-gap handling and the 12-second deadline are unchanged. The documented HTTP 400 was freshly reproduced. A new outgoing-request regression failed before the correction and passed afterward. All 151 automated tests, TypeScript, production build and 19 production HTTP groups passed.

Prepared/cache-disabled live verification was rerun through the real adapter. Gemini 3.8 and 3.7 returned intermittent high-demand 503s/timeouts; neither verifier run produced an answered result, so both exited 1. Separately, the production Astrolabe endpoint returned real uncached source answers: Gemini 3.8 answered selector callbacks and combine precedence, and Gemini 3.7 answered combine. Canonical evidence and source text matched. Implementation review found the reviewed selector/merge claims supported by the cited pinned ranges; this is a limited agent review, not independent human approval or a correctness benchmark. Fresh cross-file requests remained unavailable, so cross-file factual review is still blocked. Unsupported questions returned evidence gaps.

Only GEMINI_MODEL was changed in ignored `.env.local`, explicitly to `gemini-3.7-flash` after an availability probe; the key and other settings are preserved. It also experienced provider-side failures. No automatic fallback or timeout extension was added. Port 3310 remains running with existing preview data. The previously documented mobile teach-back reload race is unchanged; browser checks were not rerun for this server-only enum change. No push, main merge or deployment was performed. Earlier missing-key and HTTP 400 reports below are historical; current blockers are provider availability and incomplete live cross-file verification.

## Current integration — 16 October 2026

Local `krishna` was safely fast-forwarded from `c82a71bf3478bfad516725dc0b47975b2739f3ed` to the fetched `origin/walkthrough-qa` at `7e3ad3df91f8abed1fa36072e2f65d480ef97062`. That includes integration commit `5269d665a73f73945c00553a19a551a28ffe0b70` and the teammate's teach-back follow-up. No recovery patch was reapplied. The newer UI, architecture panel, claim rendering, source-loading safeguards, LM Studio adapter and teach-back resume flow are preserved. Current work is local only; no push, main merge, deployment or PR is authorized by this development request.

This update changes backend/provider/API/tests/documentation only. Source exploration, two default walkthroughs, four predictions, architecture, scoped Q&A/claim citations/browser history and two default teach-back rubrics are already connected to the website. Goals/ranking, notebook management/export, durable server answer history, additional snapshot selection/comparison and public code/symbol search still need UI integration. Earlier recovery sections below are historical, including their test counts and UI-gap descriptions. The latest verification record is `docs/BACKEND-DEVELOPMENT-2026-10-16.md`.

### AI mechanism follow-up

Development Q01/Q03/Q07/Q08/Q10 already retrieve the relevant implementations. The local one-block/70-word format could omit the identity guard, selector callback roles, listener argument order, hook API assignment direction and combine merge precedence. Both providers now receive a generic literal AST reading aid derived only from supplied excerpts, including condition/call/assignment line ranges and evidence IDs. Parsing incomplete windows fails closed. Added source text shares the existing 10,000-character budget; at most 20 syntax records and 1,800 repeated source characters are supplied. Retrieval remains at most eight evidence chunks, with strict selection/file/snapshot boundaries.

The local response permits up to three bounded blocks and asks for at most 180 words. Provider selection remains explicit (`lmstudio`, `gemini`, `disabled`); there is no fallback. Prepared aliases are unchanged. Seven new tests cover the five source mechanisms, exact-selection confinement and both provider envelopes. These checks establish source/prompt behavior, not improved model accuracy. LM Studio is unreachable in this workspace; Gemini has no configured credential. Historical model results in `AI-QUALITY-2026-10-16.md` are not results of this changed prompt. Held-out questions were not used.

### New notebook UI contracts

All private calls use the existing signed HttpOnly session cookie and return `Cache-Control: no-store`; never supply a session ID. Always include the selected `snapshotId`. A bookmark preserves original answer context, response/review metadata, actual provider/model and source evidence. Editing changes only title/note; deletion does not delete the answer history. Practice reset preserves bookmarks and history.

| Method and endpoint | Request | Success |
| --- | --- | --- |
| `POST /api/notebook/bookmarks` | `{snapshotId,title,note?,answerId?,evidenceIds?,briefId?}` | `{id,snapshotId,title,note,evidenceIds,revision:1,...}` |
| `GET /api/notebook/bookmarks` | `?snapshotId=...&limit=20&offset=0` | `{snapshotId,bookmarks:[{id,snapshotId,category,createdAt,payload}],total,nextOffset}` |
| `GET /api/notebook/bookmarks/[id]` | `?snapshotId=...` | A saved record; `payload` contains editable fields, revision and immutable provenance |
| `PATCH /api/notebook/bookmarks/[id]` | `{snapshotId,revision,title?,note?}` | Updated record, incremented `payload.revision`, original `createdAt` and optional `payload.updatedAt` |
| `DELETE /api/notebook/bookmarks/[id]` | `?snapshotId=...` | `{ok:true,id,snapshotId}` |
| `GET /api/notebook` | `?snapshotId=...&againstSnapshotId=...` | Markdown attachment with original-commit permalinks and conservative freshness warnings |

Listing defaults to 20, permits 1–100 records/page and offset 0–1,000,000; `nextOffset:null` ends pagination. Legacy bookmarks without revisions read as revision 1. Title is 1–160 trimmed characters; note at most 3,000. PATCH requires at least one editable field. Use the last returned revision; a competing/stale edit returns HTTP 409 `BOOKMARK_CONFLICT`, so reload before retrying. Unknown fields (including attempts to replace source/context) return 400. A missing or foreign bookmark returns 404, including another snapshot of the same repository. JSON mutations use `Content-Type: application/json` and the generic 8,192-byte body limit (bookmark creation retains its 12,000-byte limit).

Example edit after reading a bookmark:

```json
{"snapshotId":"zustand-0ea8be27db13","revision":1,"title":"Identity guard","note":"Check the unchanged-reference path."}
```

Example list envelope (record identifiers/prose omitted here):

```json
{"snapshotId":"zustand-0ea8be27db13","bookmarks":[],"total":0,"nextOffset":null}
```

Markdown export now uses the saved brief's evidence rather than substituting a current brief with the same title. It includes stored provider/model and original question context. Old records without those fields are labelled not recorded. Comparing snapshots of different repositories returns 409. Missing cited files, changed bytes or absent citations are not labelled verified fresh.

### Public code/symbol search

`GET /api/search?snapshotId=zustand-0ea8be27db13&q=setState&mode=symbol&limit=10` searches bundled source and the existing nested-symbol index. Required query is 2–200 characters and one to eight distinct Unicode letter/number/underscore/dollar terms. Matching is case-insensitive AND substring matching; punctuation has no query/operator semantics. `mode=code|symbol|all` defaults to `all`; optional `fileId` must belong to that snapshot. No host filesystem paths or arbitrary repository URLs are accepted.

Results contain `{snapshotId,commitSha,query,mode,matches,total,nextCursor,limitations}`. Each match contains `{type,snapshotId,fileId,path,startLine,endLine,contentHash,preview,evidenceId}`; symbols add `{symbolId,name,kind,runtime}`. Ranges are inclusive, 1-based and validated through the canonical evidence mechanism. Preview is capped at 300 characters and can be shortened; fetch exact source using `GET /api/evidence/[id]?snapshotId=...`. This is static/literal search, not semantic search or execution analysis.

`limit` defaults to 10, range 1–25. Pass the opaque `nextCursor` unchanged along with the original snapshot/query/mode/file filter. It is bound to the source commit and query; a changed context or malformed cursor returns 400 `INVALID_CURSOR`. A null cursor ends pagination. More than 5,000 candidate matches returns 422 `SEARCH_TOO_BROAD`; narrow the query/file. Unknown fields, including `path`, fail validation. Responses are public but `no-store`.

### Snapshot/content-version and goal contracts

Source, symbols, evidence, guides and retrieval caches use immutable snapshot/file identities. Attempts and hints use the selected task's `snapshotId` and `contentVersion`; content packs currently version as `zustand-learning-v1` or `<mitt-snapshotId>-learning-v1`. Teach-back requires both identifiers and rejects old content. History/bookmarks preserve original context and evidence; goals and saved position are session/snapshot scoped. New content versions intentionally do not silently regrade old attempts. Existing migration preserves legacy attempts under the original Zustand version.

Send `contentVersion` from the public task in attempt JSON and on hint/progress query strings. Hints and progress now reject a provided stale version with 409 before reading/recording practice. With an explicit matching version they also return snapshot/content-version metadata. Requests omitting it retain the original response shape/default-current-version behavior for compatibility. Snapshot omission on legacy endpoints still defaults to Zustand; new notebook management and search require an explicit snapshot. UI code must supply the selected identity consistently and ignore late responses for old context.

`GET /api/snapshots` and `POST /api/snapshots/compare` with `{fromSnapshotId,toSnapshotId}` already support selection/manual comparison for the three prepared snapshots. Comparison requires the same repository and returns changed-file/dependent-content flags. No extra backend comparison endpoint is needed. Old citations continue to use their original snapshot and commit, never the newly selected source.

Goal example: `POST /api/learning/goal` with `{"snapshotId":"zustand-0ea8be27db13","goal":"debug"}` returns the same pair; `GET /api/learning/goal?snapshotId=...` returns that pair or `goal:null`. `GET /api/contributions?snapshotId=...` uses the saved goal (or documentation); optional `goal=architecture|debug|tests|documentation` overrides ranking without saving. Each recommendation includes curated brief/evidence, `goalMatch`, `status`, `reason`, `remediationTaskIds` and a deterministic ordering `score`. That score is not learner readiness. Current briefs are documentation proposals, not verified upstream opportunities; test/debug goals disclose this limitation.

### Teach-back rubric assessment

The two remaining default checkpoints (`update-order`, `react-initial-snapshot`) have source targets adequate for future concept rubrics (guard → assignment → listener arguments; initial-state selector callback). They remain explicitly unavailable in this update. The existing browser journey asserts the unavailable-rubric behavior when practicing update order, so adding a rubric would require a coordinated content/UI-test contract change. No assertions were changed to conceal that mismatch. Existing resume/self-review/follow-ups remain intact, with no automatic mastery grading or claimed human approval.

### Exact next UI work

1. Add saved goal controls → ranked curated recommendations → prerequisite task practice. Display recommendation limitations and distinguish ordering scores from assessment.
2. Add bookmark save/list/read/title-note edit/delete controls with revision-conflict recovery, private Markdown download and source freshness states. Preserve saved response context/provider/review labels.
3. Load durable signed-session `/api/questions/history?snapshotId=...` records and render their original contexts/citations; the current 12-entry browser history alone is not server resumption.
4. Add snapshot selection and same-repository comparison; propagate snapshot/content version through all API calls, namespace local state and reject late responses. Keep historical citations pinned.
5. Add code/symbol search controls using the bounded query/cursor contract and canonical evidence navigation; current filename filtering is narrower.
6. Investigate the mobile teach-back reload race with the existing assertions preserved: restoration can leave Code selected while a one-time visibility check misses the asynchronously relabelled Checkpoint & mentor tab. Coordinate readiness/tab selection; do not treat a hidden panel as missing persisted data. Existing architecture, claim rendering, loading guards and teach-back screens should be retained.

## Historical recovery implementation and verification

The sections below describe the earlier recovery checkpoint; use the current integration above and latest verification record for present status.

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
| `GET /api/tasks/[id]/progress?snapshotId=...`            | `{feedback,hintsUsed,hint?}`; feedback is null until this session attempts the selected task/version                                   |
| `POST /api/tasks/[id]/attempt`                           | Existing body; additionally accepts `contentVersion`, and echoes version/snapshot metadata in feedback                              |
| `POST /api/tasks/[id]/hint?snapshotId=...`               | Hint in the selected snapshot/content version                                                                                       |
| `GET /api/results?snapshotId=...`                        | Snapshot-isolated practice summary                                                                                                  |
| `POST /api/questions`                                    | Scoped question and persisted answer                                                                                                |
| `GET /api/questions/status`                             | `{preparedAvailable,liveConfigured,liveStatus:"unverified"}`; configuration is not provider health                                     |
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

## Integration recipes and response shapes

Examples below describe the implemented contract, not a live Gemini result. Read IDs from the API rather than creating them on the client. JSON response examples show selected fields; preserve the full response, including limitations and evidence, in history.

### Source scope, claim blocks and history

Repository question:

```json
{"snapshotId":"zustand-0ea8be27db13","question":"How does setState work?","scope":"repository","depth":"beginner"}
```

File and selection questions use the returned file ID. This is the pinned vanilla file's actual ID:

```json
{"snapshotId":"zustand-0ea8be27db13","question":"How does setState update state?","scope":"selection","fileId":"file_2a08e62fa7ce2a79a93d","startLine":66,"endLine":81,"depth":"developer"}
```

For file scope use `scope:"file"` and omit range boundaries. For a walkthrough, omit source fields entirely:

```json
{"snapshotId":"zustand-0ea8be27db13","question":"What is getInitialState?","scope":"walkthrough","guideId":"store-to-react","stepId":"react-import","depth":"beginner"}
```

An answered prepared response has `status:"answered"`, `mode:"reviewed"`, `reviewState:"authored"`, a server `answerId`, the legacy `answer` string, `blocks:[{text,kind,evidenceIds}]`, `citations:[{evidenceId,snapshotId,fileId,startLine,endLine,contentHash,text}]` and `limitations:string[]`. Live answered blocks use `reviewState:"generated"`; `kind` is observed, inferred or unknown. Resolve each block's IDs through the returned citations and open `/api/evidence/<id>?snapshotId=<original-snapshot>`. Unknown blocks must have no evidence IDs. Neither observed labels nor valid links prove the claims correct.

Q&A may return HTTP 200 with `status:"evidence_gap"` or `status:"unavailable"`; both have empty citations. An evidence gap has an unknown block. Unavailable responses currently omit `blocks` and `reviewState`, so render those fields conditionally. Do not manufacture a successful answer or an authored label for unavailable output. Malformed context returns HTTP 400; an unknown snapshot returns HTTP 409. For example:

```json
{"error":{"code":"SNAPSHOT_MISMATCH","message":"This content belongs to a different repository snapshot."}}
```

`GET /api/questions/history` returns `{answers:[{id,snapshotId,category:"answer",createdAt,payload:{question,context,response,model}}]}` in oldest-first order, retaining at most 100 answers per session/snapshot. Use the record's `id` as its answer ID; the nested response was stored before `answerId` was added to the POST response. `model` records configured model metadata, not proof of a provider request or success. Preserve `payload.context` when replaying a question or changing explanation depth. Existing browser history is separate, holds 12 entries, and its current parser does not retain all added metadata across reloads; integrating server history and block metadata is UI work.

### Prediction, versions and teach-back

`GET /api/guides?snapshotId=...` returns `{guides,tasks,reviewState:"authored",humanReview:"pending"}`. Each public task carries `snapshotId` and `contentVersion`. The default is `zustand-learning-v1`; the mitt versions are `mitt-f9a0b5397edf-learning-v1` and `mitt-05f4ce67e8f1-learning-v1`. Guides and results do not currently carry a top-level content version. Attempts may omit the version for legacy compatibility; new clients should always send the task's returned version:

```json
{"snapshotId":"zustand-0ea8be27db13","contentVersion":"zustand-learning-v1","answer":"skip"}
```

Send that body to `POST /api/tasks/same-reference/attempt`. Feedback includes `{taskId,snapshotId,contentVersion,correct,attemptNumber,hintsUsed,submittedAnswer,explanation:{beginner,developer},evidenceIds}`. An incorrect answer is still recorded; explanation text is released after an attempt. Invalid choices fail with HTTP 400 `INVALID_ANSWER`; a supplied stale version fails with HTTP 409 `CONTENT_VERSION_MISMATCH` and creates no attempt. Task progress returns null feedback before an attempt. Hints use a POST with the snapshot in the query and return `{hint,hintsUsed}`; hint/progress endpoints resolve the active content version and do not accept a caller-selected version. Discard any late response after the active snapshot/task/version changes.

After an attempt, submit an explanation:

```json
{"snapshotId":"zustand-0ea8be27db13","taskId":"same-reference","contentVersion":"zustand-learning-v1","text":"The identity guard skips notification when the updater returns the same object reference."}
```

`POST /api/teach-back` returns a submission `id`, `taskId`, `contentVersion`, the text, `status:"needs_review"`, rubric `concepts` initially `unassessed`, `evidenceIds`, review method and limitations. It requires a prior attempt (HTTP 409 `ATTEMPT_REQUIRED` otherwise). Rubrics currently exist for `same-reference`, `merge-change-point` and `mitt-dispatch-order`; other tasks return HTTP 404 `TEACH_BACK_UNAVAILABLE`.

Use the returned submission UUID and assess each returned concept exactly once:

```json
{"snapshotId":"zustand-0ea8be27db13","submissionId":"<returned-submission-UUID>","assessments":[{"conceptId":"identity_guard","state":"understood"},{"conceptId":"guarded_notification","state":"uncertain"}]}
```

`POST /api/teach-back/review` returns `status:"self_reviewed"`, `reviewMethod:"learner_self_assessment"`, assessed concepts and `followUps:[{conceptId,prompt,taskId,evidenceIds}]`. This illustrative UUID placeholder must be replaced by the actual response ID. No mastery score is returned. Submissions are signed-session private. There is currently no submission-list endpoint; retain the returned IDs in the client if review must resume.

### Goals, progress, architecture, notebook and comparison

- `POST /api/learning/goal` with `{"snapshotId":"zustand-0ea8be27db13","goal":"debug"}` returns the same snapshot and goal. GET returns `{snapshotId,goal}` with null for no goal. Valid goals are architecture, debug, tests and documentation.
- `GET /api/contributions?snapshotId=...` uses the saved goal, or documentation by default; `goal=...` overrides ranking without saving it. Response: `{snapshotId,goal,recommendations,limitations}`. Recommendations extend public briefs with `goalMatch`, `status`, `remediationTaskIds`, `reason` and deterministic `score`. This ranking score is not a learner mastery score. The current catalog contains documentation briefs only.
- `POST /api/progress` with `{"snapshotId":"zustand-0ea8be27db13","guideId":"state-to-subscribers","stepId":"predict-identity"}` returns the validated input. GET returns `{progress:null}` or `{progress:{id,snapshotId,category:"progress",payload:{snapshotId,guideId,stepId},createdAt}}`. Apply it only to its original snapshot; saved server position and current browser visited-step state are distinct.
- `GET /api/architecture?snapshotId=...` returns `{snapshotId,commitSha,reviewState,humanReview,modules,readingOrder,relationships,unresolved,limitations}`. Each module has `fileId`, evidence IDs and public symbol ranges. Reading order entries are module IDs. Relationships are static imports, not runtime execution.
- `POST /api/notebook/bookmarks` accepts `{"snapshotId":"zustand-0ea8be27db13","title":"State notes","note":"Revisit identity.","evidenceIds":["ev_490bbe887bbd98f44380886cad8498fd"]}` and returns `{id,snapshotId,title,note,evidenceIds,...}`. Optional `answerId` must come from this session/snapshot; optional `briefId` must exist there. A bookmark copies the saved answer so later history eviction does not erase it. There is no bookmark-list/delete endpoint yet.
- `GET /api/notebook?snapshotId=...` downloads `text/markdown; charset=utf-8` with `Content-Disposition: attachment; filename=astrolabe-notebook.md`. Preserve response text rather than calling `.json()`. Optional `againstSnapshotId` adds conservative freshness annotations for another snapshot of the same repository. Original commit links remain pinned.
- `POST /api/snapshots/compare` with `{"fromSnapshotId":"mitt-f9a0b5397edf","toSnapshotId":"mitt-05f4ce67e8f1"}` returns `{fromSnapshotId,toSnapshotId,changes,content,limitations}`. File changes include path/kind/beforeHash/afterHash; content entries include contentId/kind/state/affectedPaths/reviewState. Changed cited files mark dependent content `needs_review`, including formatting-only changes. Different repositories fail with HTTP 409 `REPOSITORY_MISMATCH`; there is no automatic line remapping.

### Session and request handling

Use same-origin fetch (default cookie handling) or `credentials:"same-origin"`; do not read or generate session IDs in client code. Successful session endpoints issue `mentor_session=<signed-token>` when needed: HttpOnly, SameSite=Lax, Path=/, Max-Age=604800, and Secure for HTTPS. Invalid/tampered cookies establish a fresh anonymous session. Keep database and signing secret stable across restarts. Browser cookie expiry is seven days; this prototype does not provide account login or a server-side token-expiry/revocation service.

Session endpoint success responses use `Cache-Control: no-store`. Do not persist session responses in a shared cache. Errors use `{error:{code,message,details?}}`; check HTTP status before interpreting the payload. Generic JSON request limit is 8,192 bytes, Q&A 4,096 bytes and bookmarks 12,000 bytes. Use `Content-Type: application/json`; hints and reset do not parse a JSON body. The Gemini timeout is 12 seconds. `liveConfigured:true` reports configuration only.

`POST /api/session/reset` returns `{"ok":true}`. It clears attempts, hints and teach-back across this session's snapshots. It preserves saved answer history, bookmarks, goals, walkthrough position and all other sessions. It does not clear browser localStorage. Explain this accurately in reset UI.

Snapshot selection must come from `/api/snapshots`. Omitted optional query IDs select Zustand; empty or wrong IDs fail. Include the selected snapshot explicitly on every source/evidence/learning/history/notebook request. File/evidence IDs cannot cross snapshots. Never substitute current source for an old answer's citations. The default UI currently omits these query IDs and therefore remains a Zustand interface.

### Exact UI-owner work remaining

1. Resolve the two pre-existing asynchronous UI/test synchronization failures described below, preserving the range and keyboard assertions. Expose/await completed evidence navigation before submitting a selected-range question; avoid focus transfer from a disabled control while source is loading. The current UI allows a stale source range to be sent during citation loading.
2. Connect snapshot selection to every API and namespace browser state by snapshot/content version; replace hardcoded source filenames/ranges with returned metadata. Reject late responses for obsolete context.
3. Render observed/inferred/unknown blocks with their own citations, authored/generated labels and limitations. Keep existing mode compatibility while explaining that authored material has no completed independent human review. Preserve the added metadata in browser history or use signed-session history.
4. Connect architecture/reading order, saved goals and contribution remediation, teach-back submission/self-review/follow-ups, bookmarks/Markdown export, saved walkthrough position and manual snapshot comparison/freshness. These backend APIs do not yet establish completed screen features.
5. Add accurate reset wording and blocked/unavailable/validation states. A saved answer uses its original context and commit; citation integrity and self-assessment are not proof of correctness or mastery. Server bookmark deletion/listing and teach-back listing would require further backend API work if the UI needs them.

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

`npm run verify` is the requested alias for `verify:live`; it also disables prepared matching and cache. Blocked records explicitly include `preparedMatching:false`, `cache:false` and `liveRequests:0`. No credential was configured during the follow-up, so live evidence and uncertainty inspection remain blocked. Mock-provider schema/citation tests are separate checks, not real-provider verification.

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

## Follow-up investigation — 2026-10-16

Continued from clean checkpoint `21c8527` on `codex/backend-mentor-recovery`. Both affected tests were rerun unchanged against the recovery branch and an isolated copy of upstream `bf61b7d`, with the same Node 24.20.0, pinned dependency versions, Chromium 156 / Playwright 1.64.1, fresh browser contexts, separate databases, blank provider keys and the existing assertion timeouts. API routes were warmed before the comparison; no assertions, UI code or browser tests were changed.

Both original failures reproduced identically on both branches. They are **pre-existing UI/test synchronization defects**, exposed by asynchronous source/evidence loading; neither is a backend regression. Development compilation affects timing but does not explain away the unsupported focus/range assumptions.

1. **`explicit question scopes preserve answers, original context and history while inspecting citations`**, `tests/e2e/journey.spec.ts:151`:

   ```text
   Error: expect(received).toMatchObject(expected)
   Expected: { fileId: "file_2a08e62fa7ce2a79a93d", startLine: 66, endLine: 81 }
   Received: { fileId: "file_2a08e62fa7ce2a79a93d", startLine: 88, endLine: 92 }
   ```

   Root cause: `useWorkspace.openEvidence` awaits evidence and source HTTP requests before `openFile` updates `range`. The citation click returns before that work finishes. The test immediately checks Selected lines and submits; `QuestionPanel` constructs the request from the still-current 88–92 range, without receiving a source-loading guard. In the original trace, the 66–81 evidence request started at monotonic 70,129.668 ms and took 729.483 ms; the question POST began at 70,341.350 ms, while navigation was pending. The server received the stale range; it did not rewrite the requested range. UI work: coordinate pending evidence navigation and submission; test-owner work: synchronize with completed source/context navigation while retaining the exact outgoing-range assertion.

2. **`four scope controls fit mobile, support keyboard selection and retain walkthrough answers after source inspection`**, `tests/e2e/walkthrough-scope.spec.ts:115`:

   ```text
   Error: expect(locator).toBeFocused() failed
   Locator: locator('.mentor-scope-options').getByRole('radio', { name: 'This walkthrough', exact: true })
   Expected: focused
   Timeout: 5000ms
   Error: element(s) not found
   ```

   Root cause: the helper checks the guide title, which updates before source/range loading completes. At `.focus()` the Selected lines radio is still disabled (`disabled` is present in the trace snapshot), so focus stays on the Mentor workspace tab. ArrowRight reaches that tab's `onKeyDown`, cycles to Files & flow and hides the mentor panel; the expected walkthrough radio is no longer visible to the role locator. The source eventually completes and enables Selected lines, after the wrong keyboard target has already handled the key. UI/test-owner work: coordinate source readiness and valid focus before keyboard traversal, preserving the focus and checked assertions. This is not a provider, database or backend-response failure.

An initial cold recovery run also timed out at the overview heading while the page still said “Opening the prepared repository…”; that is a separate dev-startup timing condition. An initial baseline fixture could not load hash-checked sources because Windows archive conversion changed line endings; the baseline's source/license bytes were restored directly from the upstream Git blobs and verified against its manifest before the valid comparison above. A temporary dependency junction was rejected by Turbopack; it was replaced by an independent installation of the same pinned versions. These setup attempts were not used to classify the original failures.

Follow-up changes: added `npm run verify` as an alias for the existing prepared-disabled live verifier, made disabled prepared/cache flags explicit in missing-key records, and expanded this API handoff. No backend runtime regression was found or patched. Follow-up results: **107/107 automated tests passed**, TypeScript passed, production build passed and the rebuilt production server passed **16/16 HTTP check groups**, including process restart. `npm run verify` recorded missing credential, zero live requests, prepared matching disabled and cache disabled. The affected browser reruns remain **0/2 passing** on both branches; the prior full suite result remains 8/10, not a newly rerun full-suite result. Human review, peer study and real-provider evidence/uncertainty inspection remain pending.

## Delivery boundary

The recovered changes are local on `codex/backend-mentor-recovery`; the supplied patch originated from `codex/backend-mentor-upgrades`. Do not push or publish until the owner explicitly instructs it after reviewing the completion report. Public arbitrary-URL ingestion, generated tours, automatic patching and code execution remain outside this branch; the second repository is explicitly prepared and pinned.
