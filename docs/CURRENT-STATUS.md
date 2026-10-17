# Current backend and AI status — 17 October 2026

**Superseded for the combined application by [integrated verification](COMBINED-VERIFICATION-2026-10-17.md).** The UI merge connects the interfaces listed as pending below; the final integrated browser run passed 35/35, including mobile teach-back reload. This document retains the earlier backend-only and live-AI checkpoint evidence.

This is the current status record. Earlier audit, quality and recovery reports describe their own checkpoints; their missing-key, cross-file-blocked, test-count and timeout statements are historical, not the results below.

## Checkout and changes

Branch: `krishna`, separate from the UI teammate's checkout. Fetched baseline: `6fb5845844ede13395194e3534a5e96f441228da` (`origin/krishna`). Remote `main`: `bf61b7dcee421ee41202adc9dfb7ee5b8d0960ea`; remote `walkthrough-qa`: `7e3ad3df91f8abed1fa36072e2f65d480ef97062`, already integrated. No newer remote work was overwritten; no push, merge to main, deployment or PR was performed.

Local implementation commits:

- `c9c0899`: restrict architecture `publicApis` to real exports, preserving aliases, types, default exports and supported re-exports. Internal helpers remain available in source/symbol analysis but are no longer public APIs. The response shape is unchanged.
- `0f1ee65b17ae1416b7cbda5183f1daf1d992b46c`: bounded private diagnostics, observed Gemini generation repair, strict live verification and evaluation provenance. This preserves the earlier committed `APPLICATION_JSON` enum correction and valid `application/json` HTTP header.

No components, client state, mission interfaces, styles, browser tests or shared contracts were changed. Existing data and the ignored credential file are preserved.

## Observed Gemini failure and repair

Before tuning, real prepared/cache-disabled development calls reproduced two different outcomes under the original 1,800-token output setting: a specific cross-file question returned HTTP 200 / STOP (661 output tokens, 764 thought tokens, about 10.3 seconds); the broader cross-file question returned HTTP 200 / MAX_TOKENS (598 output tokens, 1,185 thought tokens, about 12.8 seconds). The second response was rejected. This establishes a token-budget failure for that reproduction; it does not establish the cause of every earlier invalid-output, timeout or 503 observation. Malformed JSON was not observed in those baseline calls.

The selected `gemini-3.8-flash` model was retained. The adapter now requests 4,096 output tokens and supported LOW thinking without returning thoughts, supplies readable paths from the existing evidence map, and bounds the response to four blocks, 1,400 characters/block and three model limitations. Retrieved source remains bounded to eight chunks/10,000 characters; the outer response remains bounded to 64,000 bytes. Scope, canonical citation checks and evidence-gap rejection remain intact. There are no hardcoded live answers or automatic provider/model switches.

The total Gemini deadline is 45 seconds, below the unchanged 75-second client deadline. At most two attempts share that deadline. A single 500 ms backoff is allowed only for HTTP 429/500/502/503/504; invalid requests, malformed responses and validation failures are not retried. An externally blocked verifier stops subsequent cases instead of repeatedly calling the provider.

Settings follow Google's [thinking documentation](https://ai.google.dev/gemini-api/docs/generate-content/thinking) and [GenerateContent contract](https://ai.google.dev/api/generate-content). The combined thinking/output budget informed the change; extending timeout alone was not the fix.

Private diagnostics distinguish HTTP, timeout, missing candidate, finish reason, oversized/empty response, invalid JSON, structured validation, citation validation and network failures. Only allowlisted operational metadata, safe model names, durations, status/finish reason, token counts, byte counts and validation codes are retained. No credentials, headers, prompts, retrieved bodies or private reasoning are recorded. Request-local capture is bounded to 128 events. Optional `MENTOR_AI_DIAGNOSTICS=1` persists two rotating files of at most 64 KiB each beneath `MENTOR_DATA_DIR/ai-diagnostics` (default `.data/ai-diagnostics`), with restrictive creation modes and symlink checks. These private files are ignored; they are not public health responses.

## Fresh verification

Run on Node `24.19.0` and npm `11.19.0`, installed pinned dependencies already present:

| Check | Actual result |
| --- | --- |
| `npm test` | 167/167 passed, 12 files |
| `npm run typecheck -- --incremental false` | Passed |
| `npm run build` | Passed, production build |
| `npm run verify:http` | 19/19 production groups passed with isolated storage, disabled provider, process restart and session isolation |
| `npm run verify:live` | All four required cases passed; two answers, two evidence gaps; three actual Gemini HTTP requests; prepared matching and cache disabled |
| Browser suite | Not rerun for this backend change. Last laptop report: 16/17, mobile teach-back readiness/reload race outstanding with UI owner |
| GitHub Actions | Backend workflow added; equivalent checks run locally. Remote workflow has not run because this work has not been pushed |

Live report: `.data/verification/live-qa-2026-10-17T06-27-29-041Z.json`, implementation checkpoint `0f1ee65b17ae1416b7cbda5183f1daf1d992b46c`. Dirty flag is true because the new workflow was untracked at capture; implementation SHA-256 hashes and exact settings are included. Source snapshot: `zustand-0ea8be27db13`, commit `0ea8be27db13019819fc1c0492e5b672dd7b6f4b`. No held-out questions were used.

The source guard answer used one real HTTP 200 / STOP request (4.22 seconds end to end), and the cross-file answer used one (5.06 seconds). Historical intent was refused before a provider call; the PostgreSQL migration question used one real request and returned an evidence gap. The verifier requires both answerable cases, evidence from both requested cross-file paths, live/uncached provenance, canonical snapshot/hash/range references and honest unsupported gaps. A single successful answer cannot pass it. Reports distinguish transport, pipeline gates and claim review.

Implementation review compared the returned source answer against `src/vanilla.ts:60–97`: functional partial evaluation, the identity guard and skipped reassignment/listener notification match the cited code. The cross-file answer matches `src/react.ts:53–61`, `src/vanilla.ts:99–100`, `src/vanilla.ts:60–97` and `src/react.ts:26–37`: createStore produces the API; the bound hook captures it, copies API properties onto the hook and supplies subscription/current/initial snapshot callbacks to React. The answer does not establish React internals, runtime execution or historical intent. The PostgreSQL gap is appropriate for the supplied source. This is limited agent implementation review, not independent human approval, universal correctness or a benchmark accuracy score.

The local production preview runs at **http://127.0.0.1:3310** using its existing preview database and signing directory. The configured key stays in ignored `.env.local`. Configuration status means configured; a basic provider HTTP 200 means reachable; passing full-pipeline cases means those requests passed the gates. None alone proves factual correctness or future provider availability. LM Studio was not freshly verified by this Gemini task. Earlier provider 503/timeouts remain external observations, not a current blanket live-verification block.

After the strict run passed, two fresh production `/api/questions` calls exercised the restarted website service. The source guard question returned a live Gemini answer (HTTP 200 / STOP, one canonical citation; source claims checked against vanilla lines 60–97). The cross-file question received provider HTTP 503 followed by HTTP 429 on the single permitted retry, then returned public `status: unavailable` with no citations. The route's HTTP 200 envelope is not an answered result. No further live calls were made after this external blocker. The earlier successful cross-file verifier result remains valid for that run, but current production cross-file availability is intermittent. Safe metadata is in the private preview diagnostic log; response artifact: `.data/verification/production-live-backend-completion.json`.

Storage check: the existing signing-secret hash matches the earlier laptop baseline. The default source database file hash differs from that historical baseline (720,896 bytes, last write 11:30 local, before final tests/build). No reset/deletion or rollback was performed; source-index initialization may update it, so byte-for-byte preservation is not claimed. Practice/version preservation and restart continuity passed against isolated verification data. The running preview retains its separate existing database/signing directory.

## Backend contracts and exact UI work

Existing goals, contribution remediation, notebook CRUD/export, durable history, snapshot comparison, code/symbol search, signed sessions and version isolation passed unit/integration and production HTTP checks. No demonstrated defect required rewriting those services. Their full request/response examples remain in [BACKEND-UPGRADES.md](BACKEND-UPGRADES.md); the only public metadata change here is more accurate `publicApis`, with unchanged shape.

Already connected: source explorer/map, architecture, both default walkthroughs, four predictions, hints/feedback, explicit question scopes, claim citations, browser answer history, progress/reset and the existing teach-back/self-review interfaces. Browser behavior was not freshly asserted this time.

UI teammate's remaining work:

1. Goals: `POST/GET /api/learning/goal` with selected `snapshotId`; show `/api/contributions` ranking and prerequisite remediation. Ranking is curated ordering, not mastery or a verified upstream issue.
2. Notebook: connect bookmark create/list/detail/title-note edit/delete, retain revision and recover HTTP 409 conflicts; download `/api/notebook` Markdown with pinned original references and freshness flags.
3. History: restore `/api/questions/history?snapshotId=...` with original question, context, provider/review labels and citations; current browser history alone is not durable server resumption.
4. Snapshots: wire `/api/snapshots` and same-repository `/api/snapshots/compare`. Carry snapshot/content version through requests, namespace client state and ignore responses arriving for old contexts. Historical evidence stays pinned.
5. Search: wire `/api/search` code/symbol modes and opaque query-bound cursors. Filename filtering is not code search. Navigate using returned canonical evidence.
6. Resolve the mobile teach-back reload race without skipping tests or weakening assertions: asynchronous restoration can leave Code selected while a one-time visibility check misses the relabelled Checkpoint & mentor tab. Preserve the existing screens and wait for readiness/tab selection. Two default checkpoints still explicitly lack teach-back rubrics; extending them needs coordinated content/browser expectations.

Private APIs use the signed HttpOnly, SameSite session cookie and `Cache-Control: no-store`; same-origin browser fetch preserves it, cross-origin clients need credentials and an allowed deployment policy. Never accept a client session ID. Attempts/hints/progress must use the task's selected `snapshotId`/`contentVersion`; stale versions fail before practice mutation. Bookmark edits cannot replace provenance. Reset clears practice, preserving saved notebook/history/preferences. Cookie/key plus database preservation supports restart continuity.

## Setup, automation and pending independent evidence

Use Node 24 LTS (freshly checked 24.19.0; minimum 22.13.0 for native SQLite/FTS5) and npm 11.19.0 for the reproduced setup: `npm ci`, `npm run setup`, then the checks above. Existing `.nvmrc` selects an earlier compatible Node 24 release; that exact patch was not freshly tested here. Run build and HTTP servers sequentially. The new `.github/workflows/backend-checks.yml` installs pinned npm/dependencies, sets isolated storage and disabled live credentials, and runs setup, TypeScript, tests, build and HTTP verification. Browser CI remains a separate UI responsibility; this is not a claim that the whole website is green.

Independent reviewers still need to record each generated claim, cited source range, support/contradiction/uncertainty and reviewer identity/date; check unsupported questions and runtime/history boundaries, and assess held-out questions without tuning on them. Participant study work still needs consent, real anonymized observations, task outcomes, timing, feedback and documented analysis. No human review, mastery score or participant result has been fabricated.
