# Astrolabe project audit — 16 October 2026

Current follow-up: [local retrieval and answer-quality work](AI-QUALITY-2026-10-16.md) records 132 passing service tests and 12/16 generated development answers, with four gaps. Q01 still needs correction and several explanations remain incomplete; coverage is not accuracy. The sections below retain the initial audit evidence.

The original MVP learner path is implemented; the verification/freeze gate remains open because answer quality and independent evaluation are incomplete. New backend additions extend beyond the original MVP.

Astrolabe has a working source-learning website and substantially more backend capability than the attached review describes. The main remaining work is to connect those backend capabilities into one learner journey and establish answer quality and learning outcomes. Local AI now runs on this Mac, but the current broad-query results are not reliable enough to claim general code understanding.

## Scope and source of this audit

Compared `plan.md`, `README.md`, the actual code, backend handoff, fresh checks, and the attached 11-page `Astrolabe_Hackathon_Review.docx`. The Word review assesses application commit `9df1c98c685028f728f7a4a93c84e4549676f30b`; several findings are historical. Its proposed additions are recommendations, not completed features or automatic changes to the agreed MVP. `Contract.MD` is not the execution baseline.

The attached document was read in full, including tables, and rendered for inspection. It contains no comment parts or tracked changes. Its central recommendations—reliable cross-file answers, source-linked architecture, peer evidence and a coherent learning journey—remain useful. Its 44-test count and findings about absent scope/history controls do not describe the integrated version.

## GitHub and integration status

- Fetched GitHub during this audit. `origin/main` is still `bf61b7dcee421ee41202adc9dfb7ee5b8d0960ea`; no newer main commit was available.
- Found `origin/krishna` at `c82a71b`, with backend implementation `21c8527` and a follow-up documenting UI timing defects/API contracts.
- With the owner's explicit approval, integrated `krishna` on `walkthrough-qa`. It contains the latest main redesign. The merge completed without unresolved conflicts and is deliberately **uncommitted**; the owner retains commit/push responsibility.
- Before new audit changes, the merged working tree matched `origin/krishna` exactly. Incoming changes remain staged; this audit's additional changes are available for review in the working tree.
- The earlier saved local work remains in stash `443ae4c77efbe40a63d6d316710e6285b218d577`, with an external backup under `/Users/shashwat/Documents/Codex/astrolabe-backups/20261016-173043/`. It was not blindly reapplied. Only the local-provider approach/tests were adapted to the new backend. Old retrieval, old interface and old evaluation results were not substituted for the integrated versions.
- Local skills remain ignored under `.codex/skills/` and `.agents/skills/`. No model weights, environment credentials or local database belong in Git.

## What is done versus remaining

| Area | Available in the website | Backend / remaining work |
| --- | --- | --- |
| Prepared source and provenance | Zustand v5.0.8, exact commit, MIT license, 15 real TypeScript source files, hash-checked source access. | Also supports two pinned mitt snapshots. No arbitrary URL import. |
| Explore | Filename filter, static import map, read-only local Monaco, line selection, evidence navigation; responsive panels and keyboard controls. | AST and full-text retrieval exist. A global symbol/source search interface is still missing. Static imports do not establish runtime execution. |
| Guided learning | Two Zustand guides, nine steps, Beginner/Developer variants, saved device position and visited steps. | A mitt guide exists for each snapshot. Generated/reviewable tours are not implemented. Independent human review is pending. |
| Predict Before Reveal | Four Zustand tasks, server-only rubrics, hints, attempts, exact feedback, restored answers, progress and session reset. | Learning is snapshot/content-version scoped on the backend. The website still assumes the default Zustand tasks in places. |
| Scoped Q&A | Repository, Current file, Selected lines and This walkthrough; strict evidence boundaries, retained original answer context and browser history. | Cross-file diversification/import-neighbor retrieval is integrated. Semantic claim support remains unverified; broad retrieval has measured misses. |
| Architecture | **Added in this audit:** overview with four subsystem summaries, reading order and working source links. | Authored architecture also exists for mitt. Independent claim review is pending; the map remains static imports. |
| Claim-level answers | **Added in this audit:** observed/inferred/unknown blocks, each block's references, metadata retained after reload. Prepared responses say “Prepared answer” and disclose pending human review. | Structural validation rejects unsupported IDs; valid references alone do not prove the prose is correct. |
| AI providers | **Restored/adapted in this audit:** explicit LM Studio or Gemini selection, local answer labels and honest configuration status. Prepared content works without either. | Local 7B real calls work. Significant factual/retrieval issues remain. Real Gemini calls remain unverified without its key. No automatic cloud fallback. |
| Answer history | Up to 12 browser answers retained by snapshot, including their original context/depth and new block metadata. | Signed-session server history is implemented; the interface has not switched to it. |
| Teach-back | No website control yet. | Submission after an attempt, concept rubrics, learner self-assessment and distinct follow-ups exist. This is **not** automatic mastery scoring. Listing/resume API work may be needed. |
| Goal-based contributions | Website still shows the two prepared documentation briefs and practice context. | Goals and deterministic ranking/remediation APIs exist. The catalog does not establish real upstream test/debug issue availability. |
| Notebook | No save/export controls yet. | Session bookmarks, stored-answer copies, Markdown export, pinned links and optional freshness notes exist. Bookmark list/delete controls need API work if required. |
| Snapshot selection/freshness | Website opens Zustand; no snapshot picker or comparison screen yet. | Three bundled snapshots, version-isolated learning, migration, manual same-repository hash comparison and conservative content review flags exist. |
| Evidence of learning | Practice results are visible. | Independent human claim review, held-out evaluation and the 6–8 participant comparison remain pending. No measured improvement claim is established. |
| Broader features | No arbitrary repository import, automatic code editing/execution or generated runtime traces. | Generated tours, static impact guidance and historical rationale sources are future work. They are not required to finish the original MVP. |

## Attached review: recommendation-by-recommendation

| Review item | Current assessment and next action |
| --- | --- |
| F1: repository-wide Q&A + stable evidence | Scope controls/history were already fixed on main. Krishna improves cross-file retrieval. This audit fixes stale-range submission while evidence loads. Quality review of actual retrieved context remains P0. |
| F2: cited architecture | Backend was done; this audit adds the website overview. Have a teammate verify each summary and source target. |
| F3: observed/inferred/unknown claims | Backend schema was done; this audit connects block rendering and retained history. Factual review is still separate. |
| F4: teach-back | Backend supports learner self-assessment, not automatic scoring. Next main UI feature: prediction → explanation → self-review → targeted follow-up. |
| F5: goal-based contribution planner | Backend done for curated documentation briefs; goal selector/recommendation UI missing. Integrate after teach-back. |
| F6: notebook export | Backend done; save/export/resume controls missing. Add listing endpoints only as needed. |
| F7: ingestion/generality | A second prepared real repository exists, including two versions. Public URL ingestion and a complete snapshot-selecting website do not. |
| F8: generated flows | Not implemented. Keep authored flows until generation and review are verifiable. |
| F9: freshness | Manual comparison/dependency flags exist on the backend. Comparison and stale-note UI missing; no background updater/webhook. |
| F10/F11: impact and historical rationale | Not implemented as user features. Source alone cannot establish historical intent. Defer behind reliability and the learning journey. |
| Peer comparison | Still pending. Use real, anonymous observations, matched different tasks and counterbalanced order; never fabricate participant data. |

## Work completed during this audit

1. Integrated the authorized `krishna` backend while preserving the redesigned main interface and leaving Git commits/pushes to the owner.
2. Added source-loading awareness to the question composer. File/line scopes and new source-scoped submission wait until pending evidence navigation completes. Source selection edits are guarded during loading. Saved line scope also waits for its source during reload, preventing an unintended reset to Repository scope.
3. Preserved exact line-range and mobile keyboard assertions in the browser suite, with explicit readiness checks. Added a deliberately delayed evidence request test proving a new request uses the new range.
4. Connected authored architecture summaries and reading order to source navigation. Added loading, mismatch and retry states.
5. Connected claim blocks and their own evidence links, retained block/provider metadata in history, removed duplicate citation controls and made pending independent review visible.
6. Corrected reset wording: attempts, hints and teach-back are cleared for this session; saved answers, notes, goals and position remain.
7. Adapted the saved local AI provider to the new structured-block backend. Local requests are limited to loopback HTTP, redirects are rejected, responses are size/time bounded, model/provider cache keys are separate, and no local error silently falls back to cloud.
8. Added local provider safety/failure/cache checks and provider-aware real verification. Live evaluation writes a new timestamped report and preserves the committed offline baseline. Offline browser/API checks explicitly disable AI.
9. Wrote `NEXT-STEPS.md` with assignments, ordering, dependencies and acceptance checks. Updated README setup/status descriptions.

## Fresh verification

| Check | Observed result |
| --- | --- |
| Integrated baseline service tests | 107/107 passed before audit changes. |
| Service tests with local provider | 120/120 passed across six files. Includes endpoint restrictions, oversized/truncated output, timeout, no cloud fallback, citation validation and cache isolation. |
| TypeScript / production build | Passed. All integrated API routes compile. |
| Production API checks | 16/16 groups passed, including three snapshots, evidence, attempts, private/tampered sessions, goals, self-assessment, notebooks, comparison, process restart and reset. |
| Browser regression checks | 13/13 passed on the final provider-aware production build (21.6 seconds). Covers desktop/mobile journeys, both earlier timing defects, delayed evidence navigation, architecture and block/history behavior. |
| Local model smoke | Four questions, **three actual local provider calls**, one structurally accepted answer and three evidence gaps. One gap was rejected before generation. Prepared matching and cache disabled. Independent review pending. |
| Local development evaluation | **16 development questions, eight live answers, eight gaps, zero unavailable, zero invalid references** among eight cited responses. Median local latency **8,283.70 ms**; p95 **11,199.50 ms** across all question outcomes. This is response coverage/reference integrity, **not accuracy**. Eight held-out questions excluded. |
| Gemini / human / peer evaluation | Not completed; local calls do not establish Gemini performance or learning effectiveness. |

The original friend review reported 44 tests and could not run browser assertions because Chromium was missing. Those results are historical; they should not replace the fresh results above. Early browser failures during this audit exposed duplicate controls in the initial block display; those were corrected before the successful full run.

## Local AI: the important remaining issue

Qwen2.5-Coder-7B-Instruct Q4_K_M is loaded in the existing LM Studio service as `astrolabe-coder`. The load reported about 4.36 GiB. The API is bound to `127.0.0.1:1234`; model files are outside the repository. This is local inference, not a cloud-key workaround. Configuration labels remain “unverified” because the status endpoint does not perform a health request.

The current development run exposed concrete failures:

- **Q01:** selected middleware context and claimed an asynchronous updater/Immer behavior instead of accurately explaining vanilla `setState`.
- **Q02/Q05/Q09:** returned evidence gaps for supported questions; retrieval or the model missed relevant unsubscribe, functional-partial and index-export source.
- **Q03:** mixed the ordinary `useStore` path with `useSyncExternalStoreWithSelector` from the separate traditional entry point.
- **Q07:** incorrectly attributed previous/current listener arguments to React snapshot wiring.
- **Q08:** reversed the direction of attaching the API: source uses `Object.assign(useBoundStore, api)`, not assigning the hook onto `api`.
- **Q11:** described the default equality function using the wrong selector condition.
- **Q06:** structured output was withheld. Rejecting malformed output is correct, but it does not complete the supported answer.

These are implementation-review findings, not an independent accuracy score. The earlier stashed 12-answer run used a different schema/retrieval implementation and is not the result for this integration. Do not reuse its coverage/latency as current evidence.

Keep authored prepared material available for the reliable demo path. Next C task: inspect retrieved paths/ranges for these development IDs, improve bounded symbol/alias selection without broadening file/line scope, then rerun and independently review the claims. A larger model or an agreeing second model is not proof of truth.

## Website functioning, in order

1. Astrolabe validates a bundled pinned snapshot and loads metadata, source, the static import map and authored learning content.
2. The overview offers an architecture reading order and a starting guide. Clicking evidence opens the actual file and range from the same commit.
3. The learner follows a guide and predicts a result. The server scores an attempt using a private rubric, saves hints/retries, and then releases feedback and references.
4. A question uses an explicit repository/file/line/walkthrough context. The server resolves evidence, matches a known prepared answer or calls the selected provider, validates structured claims and references, and returns an answer, gap or unavailable state.
5. The answer retains its original context as the learner inspects source. New file/line questions wait for that navigation to finish. Browser history preserves metadata across reloads.
6. Results summarize practice and show bounded documentation briefs. The newer backend can continue with self-review, goals and notebooks once their website controls are connected.
7. Reset clears only this session's practice/teach-back records. Historical saved notes/answers and other sessions remain.

## Next delivery decision

See `NEXT-STEPS.md`. The recommended immediate split is: **you own integration, local answer quality and website QA; your teammate connects teach-back and goal-based contribution guidance using the existing APIs**. Both supply independent content review and participant observations. Finish that coherent journey before optional arbitrary ingestion or generated tours.

No commit or push was made during this audit. Do not run another pull over the pending merge; review and commit the integrated changes first, or deliberately back them up before changing Git strategy.

## Verification records

Fresh raw reports are preserved outside Git under `/Users/shashwat/Documents/Codex/2026-10-16/astrolabe-audit/`. They include the local smoke responses, the 16-question development responses and the final production HTTP report. The development response report SHA-256 is `4cb44bf16d50b65867374db1b1171453d8686f831b8ea8a811d5f70319739f64`. Do not substitute this record for independent reviewer notes.

Manual website check: a fresh Selected lines question about subscribe cleanup produced a Local AI answer with two source-linked blocks. Both references opened the pinned 60–95 range, the answer remained visible after navigation, and provider/block metadata survived reload. This successful narrow example does not override the broad-query failures above. The final delayed-reload regression checks that saved line scope remains selected after source loading. Test Chromium is installed under `/private/tmp/astrolabe-playwright`; set `PLAYWRIGHT_BROWSERS_PATH` to that directory for the current installation, or use the README's normal browser install command. The final website is left at `http://127.0.0.1:3000` with the local provider selected.
