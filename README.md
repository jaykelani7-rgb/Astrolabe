# Astrolabe

**Your codebase mentor.**

Current backend verification, limitations and UI handoff: [17 October status](docs/CURRENT-STATUS.md). Older audit/evaluation reports describe historical checkpoints.

A working local learning workspace for an unfamiliar codebase. Explore real source, follow a flow, predict what happens before seeing feedback, verify the explanation against exact source lines, and leave with a small contribution brief.

The prepared repository is [pmndrs/zustand](https://github.com/pmndrs/zustand), tag **v5.0.8**, pinned to **`0ea8be27db13019819fc1c0492e5b672dd7b6f4b`**. All 15 TypeScript source files and the upstream MIT license are bundled. The app never installs dependencies or executes code from the repository being studied.

## Start locally

Use **Node.js 24 LTS** (freshly checked 24.19.0; minimum 22.13 with native `node:sqlite` and FTS5), **npm 11.19.0** for the reproduced setup, and a current browser.

```sh
npm ci
npm run setup
npm run dev
```

Open **http://127.0.0.1:3000**. The setup command prepares local Monaco editor assets, verifies the bundled source hashes and license, and builds the SQLite search index. No AI credential or network is required after dependency installation. Installation also prepares Monaco automatically when npm lifecycle scripts are enabled.

For a production-mode local demonstration:

```sh
npm run build
npm start
```

Run these from the project root. Do not run development and production servers from the same build directory at the same time. The default server binds to loopback; this is a local prototype, not a hosted service.

## What works

- A useful notebook overview with a recommended starting file, real progress, and Start/Continue learning. A compact navigation rail connects Overview, Explore, Learn, and My progress. The repository header preserves provenance and honest answer-availability labels.
- A searchable file inventory, clickable React Flow module map, and read-only Monaco source viewer. Desktop panels collapse and resize by pointer or keyboard, and focus mode expands the editor. Smaller screens use Files, Code and Mentor tabs. The editor assets and workers are served locally.
- An AST index of imports, re-exports and top-level symbols using ts-morph. The map distinguishes type-only imports and lists external or unresolved references. It represents **static imports**, not runtime execution.
- Exact, inclusive, 1-based evidence ranges with snapshot-scoped identifiers, source hashes and validation.
- Two source-checked walkthroughs: **From state update to subscribers** (five steps) and **From a store to a React selection** (four steps), each with Beginner and Developer explanations using the same evidence.
- Four prediction tasks: two choices, one ordering exercise, and one source-range exercise. An attempt is required before feedback. Scoring and rubrics stay on the server.
- One continuous Learn flow: checkpoints open alongside their walkthrough, restore submitted answers and feedback, and return with Continue walkthrough. Steps visited on this device are separate from server-scored checkpoints solved.
- Recorded hints, retries, first-attempt correctness, completion, topics to revisit, and two explicitly prepared documentation contribution briefs.
- Contextual Q&A with explicit Repository, Current file and Selected lines scopes, plus This walkthrough in Learn. Repository scope omits the open-file filter. This walkthrough uses reviewed source targets across its flow, prioritizing the active step, without adding the open-file filter. Answers keep their original question, scope, depth and readable source citations when source changes. A compact history retains up to 12 answers for this snapshot, with a Latest answer action.
- Source retrieval, structured Gemini output, citation validation, timeout handling and explicit evidence-gap/unavailable states. A small set of prepared answers is visibly labeled **Prepared answer**, and live output is labeled **Live AI answer**.
- Signed anonymous session cookies, persistent SQLite attempts and session-scoped reset. Reset your practice data from **My progress → Reset this learning session**.

“Reviewed” identifies versioned, source-checked prepared material. Implementation agents checked its source references; **independent human claim review is still pending**. Citation integrity is not proof that an explanation is semantically correct.

## Optional live AI

Copy `.env.example` to `.env.local` and add your own server-side credential:

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.8-flash
```

Restart the server after changing environment variables. The key stays server-side and is sent to Google in the request header. The adapter sends the question and bounded retrieved source excerpts to Gemini. Source text is treated as untrusted data. Gemini has a 45-second total budget with at most one bounded retry for transient HTTP failures. The latest prepared/cache-disabled Gemini run passed both required source/cross-file answers and both unsupported-question gaps; see [current evidence and limits](docs/CURRENT-STATUS.md). This establishes those pipeline outcomes, not universal answer correctness. Local-provider observations below are historical; independent human review remains pending.

Try these prepared questions with an explicit scope:

| Scope            | Source or flow                    | Question                          |
| ---------------- | --------------------------------- | --------------------------------- |
| Current file     | `src/vanilla.ts`                  | How does setState update state?   |
| Current file     | `src/vanilla.ts`                  | How do I unsubscribe?             |
| Current file     | `src/react.ts`                    | How does useStore use a selector? |
| This walkthrough | From a store to a React selection | What is getInitialState?          |
| Repository       | Whole snapshot                    | What is getInitialState?          |

An unrelated question can produce an evidence gap; lexical matches alone do not establish topic relevance. For example, a PostgreSQL migration question can match Zustand persist migration text and still needs a provider to refuse it. A plausible source question that has no matching prepared answer reports live AI unavailable without a key. Prepared matches and live retrieval respect the selected file and exact line range; the app does not silently broaden that scope. A prepared explanation is available only when every one of its cited targets fits the chosen context. For example, the unsubscribe explanation needs both lines60–64 and88–92, so selecting only88–92 cannot reveal that full prepared explanation. Expand the scope deliberately if needed.

## Data and restart behavior

- `data/snapshot/`: versioned, hash-checked source, manifest and upstream license. The snapshot is deliberately restricted to `src/**`; dependencies, tests, build artifacts and secrets are excluded.
- `data/mentor.sqlite`: local source/evidence/FTS5 index and attempts, created automatically and ignored by version control. WAL mode and a busy timeout support local concurrent requests.
- `.data/session-secret`: locally generated signing key, persisted with restricted permissions and ignored by version control. Keeping this file and the database preserves session identity and results across server restarts.
- Session cookies last seven days. A new browser profile gets a separate session. The reset action deletes only that session's attempts, hints and teach-back submissions. Saved answers, bookmarks, goals and walkthrough position remain.
- `MENTOR_DB_PATH` can override the database file; `MENTOR_DATA_DIR` can override the signing-key directory; `MENTOR_SESSION_SECRET` can supply a stable signing secret of at least 32 characters. Do not commit secrets.

The repository-preparation command verifies and indexes the already bundled pinned snapshot. It is not an arbitrary-URL ingestion command. `manifest.json` records archive/source hashes, exact commit and provenance; [the upstream license](data/snapshot/LICENSE) is preserved.

## Verify

```sh
npm run typecheck
npm test
npm run build
npm run evaluate:qa
```

Browser journey checks use Playwright:

```sh
npx playwright install chromium
npm run test:e2e
```

The test server uses an isolated database and blank AI key. To test a running local server instead:

```sh
MENTOR_E2E_URL=http://127.0.0.1:3000 npm run test:e2e
```

Browser tests exercise the map, both walkthroughs, explanation-depth changes, every task, incorrect/correct attempts, hints, evidence navigation, reviewed Q&A, evidence gaps, results, reset and cross-session isolation. Test videos and reports are written to `test-results/` and `playwright-report/`. See [evaluation results](docs/EVALUATION.md), [setup verification](docs/SETUP-CHECK.md), and [the demonstration script](docs/DEMO.md).

The Q&A evaluation contains 24 questions: 16 development questions and eight reserved held-out questions. The default command evaluates only the development split. Do not tune on the held-out split. Independent human claim-support review, Gemini quality/latency checks, and the proposed 6–8 participant study remain pending. Local-provider observations are recorded separately in the current audit. Offline latency measurements cover local prepared/retrieval behavior, not live AI latency.

## Application structure

| Area                                                                   | Responsibility                                                                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/app/`, `src/components/workspace/`, `src/lib/client/workspace.ts` | Small shell, notebook overview, panel layout, file/flow navigation and snapshot-scoped interface state |
| `src/contracts/`                                                       | Shared TypeScript records and request validation                                                       |
| `src/lib/repository/`, `src/lib/evidence/`                             | Snapshot inventory, AST relationships, source and evidence access                                      |
| `src/lib/db/`                                                          | Native SQLite/FTS5 schema, source index, attempt and hint persistence                                  |
| `src/lib/ai/`, `src/lib/retrieval/`                                    | Gemini adapter, prepared matches, bounded retrieval and citation validation                            |
| `content/`, `src/lib/learning/`                                        | Versioned content, server-only rubrics, scoring, summaries and session cookies                         |
| `src/features/missions/`                                               | Prediction and results interfaces                                                                      |
| `tests/`, `docs/`                                                      | Unit/integration/browser checks, evaluation data and demo instructions                                 |

The build was divided among three subagents for repository/evidence, retrieval/Q&A, and learning/evaluation; the integration agent owns shared configuration/contracts and the main UI. Work was partitioned by file ownership within the shared workspace. No deadline or named teammate availability was assumed.

## API

All route handlers run in the Node.js runtime. Errors use `{ "error": { "code": "...", "message": "...", "details": "optional" } }`.

| Endpoint                                | Behavior                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET /api/repository`                   | Snapshot metadata and source-file inventory                                                       |
| `GET /api/repository/map`               | Static relationships and unresolved references                                                    |
| `GET /api/repository/source?fileId=...` | Allowlisted source; accepts snapshot/range validation parameters                                  |
| `GET /api/evidence/[id]`                | Verified evidence record and text                                                                 |
| `GET /api/guides`                       | Walkthroughs and public tasks, without rubrics                                                    |
| `GET /api/tasks/[id]`                   | Public task prompt and context                                                                    |
| `GET /api/tasks/[id]/progress`          | This session's submitted answer/feedback and recorded hints; explanations require a prior attempt |
| `POST /api/tasks/[id]/attempt`          | Validated answer, server score and released explanation                                           |
| `POST /api/tasks/[id]/hint`             | Hint and recorded hint count                                                                      |
| `GET /api/results`                      | Current session summary and contribution briefs                                                   |
| `POST /api/questions`                   | Contextual Q&A response with explicit status and mode                                             |
| `GET /api/questions/status`             | Prepared availability and whether the selected live provider is configured; provider health remains unverified    |
| `GET /api/teach-back?taskId=...&snapshotId=...&contentVersion=...` | Current-version rubric availability and latest session-private saved explanation/review |
| `POST /api/teach-back` | Save an explanation after a prediction; return self-review concepts |
| `POST /api/teach-back/review` | Record every concept assessment and return source-linked practice |
| `POST /api/session/reset`               | Clear only the current session's practice data                                                    |

Question bodies are limited to 4 KB; general JSON requests are bounded to 8 KB. Q&A accepts either source context (`fileId` with optional `startLine`/`endLine`) or walkthrough context (`guideId` with optional `stepId`), never both. Empty file IDs and orphan/unknown steps fail explicitly. Walkthrough evidence is resolved from the pinned reviewed guide on the server. Snapshot mismatches, absent files/evidence, malformed answers, invalid ranges and provider failure return explicit outcomes. The local prototype prevents accidental answer reveal, not inspection by someone who controls its source or database.

## Backend upgrade APIs

See [the backend handoff](docs/BACKEND-UPGRADES.md) for claim-linked responses, architecture, signed-session server history, teach-back, goal-based briefs, notebook export and snapshot comparison. The upstream UI redesign and walkthrough Q&A are preserved; teach-back is now connected after supported predictions; goals, notebooks and snapshot controls still need interface integration. Zustand remains the default, and two pinned mitt snapshots provide separate learning packs. Run `npm run verify:live` for provider verification.

## Boundaries

This is a local prototype with a default Zustand interface and backend support for prepared Zustand/mitt snapshots. Manual backend snapshot comparison is available; general URL ingestion, private repositories, uploads, additional languages, authentication, code execution/editing, fully personalised learning paths and production hosting remain outside scope. Import resolution covers static ES imports and re-exports in the bundled TypeScript files; dynamic imports, CommonJS and dependency implementations are omitted. Four small practice tasks do not measure professional readiness. Human review and a participant study are future evaluation work, not completed findings.

## Interface state and redesign verification

Astrolabe uses warm notebook surfaces with a coordinated dark source editor. The original build checks remain in `docs/SETUP-CHECK.md` and `docs/EVALUATION.md`; [redesign regressions and screenshots](docs/REDESIGN-CHECKS.md) record the latest interface verification.

Lightweight browser state is namespaced under `astrolabe:workspace:<snapshotId>` and `astrolabe:mentor-history:v1:<snapshotId>`. It stores the selected file/range, walkthrough position, visited steps, question drafts/history and depth. Panel and navigation preferences use `astrolabe:preferences`. Invalid or stale records are ignored. No API keys or task rubrics are stored in the browser. Question history concerns the public snapshot and is separate from anonymous server scoring.

Reset confirms deletion of the current session's attempts, hints and teach-back submissions. It preserves saved answers, bookmarks, goals and walkthrough position. It preserves browser question history, visited-step records and layout preferences, as stated in the interface. Browser Back/Forward switches normal navigation views while keeping source context. Select Clear selection above the source to remove line scope. Changing explanation depth affects the current explanation and future questions; existing answers keep their original depth and offer an explicit rerun.

## Walkthrough branch integration

Fetched `origin/walkthrough-qa` at `e9a21e6` and combined its walkthrough-aware Q&A with the local Astrolabe redesign. In Learn, choose **This walkthrough** while following **From a store to a React selection**, then ask **What is getInitialState?**. It can cite both React and vanilla targets from the same reviewed flow. Its original guide and step remain attached to the answer; history, retries and deliberate depth reruns replay that original context even after navigation.

The integration preserves the redesign rather than replacing it with the branch's older interface. [Branch verification and fixes](docs/BRANCH-CHECKS.md) records the original-branch checks, scope-boundary defects found, regression coverage and final build. Live Gemini availability still requires separate verification with a supplied server credential.


## Current integration and audit — 16 October 2026

The local `walkthrough-qa` integration includes `main` through `bf61b7d` and the authorized `krishna` backend through `c82a71b`. The owner committed and pushed that integration as `5269d66`. Follow-up feature changes remain for owner review and commit. See [the current team audit](docs/TEAM-PROGRESS.md) and [ordered next steps and ownership](docs/NEXT-STEPS.md).

The overview now exposes an authored architecture summary and reading order, with source navigation. Q&A renders observed/inferred/unknown blocks with each block's source links and retains this metadata in browser history. Prepared answers explicitly say independent human review is pending. File/selection questions wait for pending source navigation to finish. The browser suite includes delayed-navigation regression coverage.

The backend also supports two pinned mitt snapshots, snapshot-isolated learning, saved answer history, learner goals, contribution ranking, teach-back self-assessment, notebooks and manual freshness comparison. Architecture, answer blocks and teach-back now have website controls. After attempting a supported prediction, save an explanation, assess every concept and follow its source-linked practice. Saved explanations and reviews resume in the same anonymous session. Goals, ranked contributions, notebooks and snapshot selection/comparison still need website controls. The website continues to open the Zustand snapshot. See [teach-back verification and limits](docs/TEACH-BACK-UI.md). See [the backend contract](docs/BACKEND-UPGRADES.md).

### Local AI on this Mac

The local provider supports an existing LM Studio server. Choose one provider explicitly; local failure never silently sends source to Gemini:

```dotenv
AI_PROVIDER=lmstudio
LMSTUDIO_BASE_URL=http://127.0.0.1:1234/v1
LMSTUDIO_MODEL=astrolabe-coder
```

Place this in ignored `.env.local`. The adapter permits loopback HTTP only and rejects redirects. It requests bounded structured blocks and passes every returned reference through the same snapshot/scope checks as Gemini. The local timeout is 60 seconds; the question composer allows 75 seconds. These checks do not validate factual claims.

The existing model is Qwen2.5-Coder-7B-Instruct Q4_K_M, loaded under `astrolabe-coder`. Model files remain outside the repository. With LM Studio's `lms` CLI installed, start it using:

```sh
lms daemon up
lms load qwen2.5-coder-7b-instruct --identifier astrolabe-coder --context-length 8192 --parallel 1 --ttl 3600 --yes
lms server start --port 1234 --bind 127.0.0.1
```

The requested context limit may differ from the runtime's reported limit; inspect the actual loaded-model settings if memory use matters. Restart Astrolabe after changing `.env.local`. `AI_PROVIDER=disabled` keeps only prepared content available; `AI_PROVIDER=gemini` selects the cloud adapter and requires its key.

`npm run verify:live` now checks the selected provider with prepared matching and cache disabled. It records actual provider calls separately from questions refused before generation. `npm run evaluate:qa -- --live` requires the selected provider's environment to be loaded explicitly when invoked directly; timestamped live reports go under `.data/verification/` and preserve the committed offline baseline. Do not tune on held-out questions. Current local-model quality and verification results are recorded in the audit rather than inferred from configuration.


### Source retrieval and AI quality follow-up

The index now includes nested declarations and distinguishes function implementations from overload signatures. Retrieval prioritizes named definitions and explicit modules while preserving selection, file, walkthrough and snapshot boundaries. [The quality follow-up](docs/AI-QUALITY-2026-10-16.md) records 132 service tests, 13 browser journeys, 16 production API groups and a prepared-disabled local evaluation: 12 answers, four gaps, no invalid references. This is not an accuracy score: Q01 still needs correction and several mechanism explanations remain incomplete. The tested 9B model did not resolve the pilot errors; the 7B model remains selected with short answers.
