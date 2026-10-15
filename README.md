# Codebase Mentor

A working local learning workspace for an unfamiliar codebase. Explore real source, follow a flow, predict what happens before seeing feedback, verify the explanation against exact source lines, and leave with a small contribution brief.

The prepared repository is [pmndrs/zustand](https://github.com/pmndrs/zustand), tag **v5.0.8**, pinned to **`0ea8be27db13019819fc1c0492e5b672dd7b6f4b`**. All 15 TypeScript source files and the upstream MIT license are bundled. The app never installs dependencies or executes code from the repository being studied.

## Start locally

Use **Node.js 24 LTS** (minimum 22.13 with native `node:sqlite` and FTS5), npm, and a current browser.

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

- A start workspace showing repository provenance and the pinned commit.
- A searchable file inventory, clickable React Flow module map, and read-only Monaco source viewer. The viewer's editor assets and workers are served locally.
- An AST index of imports, re-exports and top-level symbols using ts-morph. The map distinguishes type-only imports and lists external or unresolved references. It represents **static imports**, not runtime execution.
- Exact, inclusive, 1-based evidence ranges with snapshot-scoped identifiers, source hashes and validation.
- Two source-checked walkthroughs: **From state update to subscribers** (five steps) and **From a store to a React selection** (four steps), each with Beginner and Developer explanations using the same evidence.
- Four prediction tasks: two choices, one ordering exercise, and one source-range exercise. An attempt is required before feedback. Scoring and rubrics stay on the server.
- Recorded hints, retries, first-attempt correctness, completion, topics to revisit, and two bounded documentation contribution briefs.
- Contextual Q&A with source retrieval, structured Gemini output, citation validation, timeout handling and explicit evidence-gap/unavailable states. A small set of prepared answers is visibly labeled **Reviewed answer**, and live output is labeled **Live AI answer**.
- Signed anonymous session cookies, persistent SQLite attempts and session-scoped reset. Reset your practice data from **Your progress → Reset this learning session**.

“Reviewed” identifies versioned, source-checked prepared material. Implementation agents checked its source references; **independent human claim review is still pending**. Citation integrity is not proof that an explanation is semantically correct.

## Optional live AI

Copy `.env.example` to `.env.local` and add your own server-side credential:

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.8-flash
```

Restart the server after changing environment variables. The key stays server-side and is sent to Google in the request header. The adapter sends the question and bounded retrieved source excerpts to Gemini. Source text is treated as untrusted data. Provider requests time out after 12 seconds. No live provider call has been verified in this build because no credential was supplied.

Try these prepared questions while viewing the relevant file (clear unrelated line selections first):

| Source | Question |
| --- | --- |
| `src/vanilla.ts` | How does setState update state? |
| `src/vanilla.ts` | How do I unsubscribe? |
| `src/react.ts` | How does useStore use a selector? |
| `src/vanilla.ts` or `src/react.ts` | What is getInitialState? |

A question about an absent PostgreSQL migration engine produces an evidence gap. A plausible source question that has no matching prepared answer reports live AI unavailable without a key. Prepared matches respect the selected file and range; the app does not silently substitute an answer about unrelated source.

## Data and restart behavior

- `data/snapshot/`: versioned, hash-checked source, manifest and upstream license. The snapshot is deliberately restricted to `src/**`; dependencies, tests, build artifacts and secrets are excluded.
- `data/mentor.sqlite`: local source/evidence/FTS5 index and attempts, created automatically and ignored by version control. WAL mode and a busy timeout support local concurrent requests.
- `.data/session-secret`: locally generated signing key, persisted with restricted permissions and ignored by version control. Keeping this file and the database preserves session identity and results across server restarts.
- Session cookies last seven days. A new browser profile gets a separate session. The reset action deletes only that session's attempts and hints.
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

The Q&A evaluation contains 24 questions: 16 development questions and eight reserved held-out questions. The default command evaluates only the development split. Do not tune on the held-out split. Independent human claim-support review, live-provider quality/latency checks, and the proposed 6–8 participant study remain pending. Offline latency measurements cover local prepared/retrieval behavior, not live AI latency.

## Application structure

| Area | Responsibility |
| --- | --- |
| `src/app/`, `src/components/` | Application shell, exploration, guides, source and Q&A interface |
| `src/contracts/` | Shared TypeScript records and request validation |
| `src/lib/repository/`, `src/lib/evidence/` | Snapshot inventory, AST relationships, source and evidence access |
| `src/lib/db/` | Native SQLite/FTS5 schema, source index, attempt and hint persistence |
| `src/lib/ai/`, `src/lib/retrieval/` | Gemini adapter, prepared matches, bounded retrieval and citation validation |
| `content/`, `src/lib/learning/` | Versioned content, server-only rubrics, scoring, summaries and session cookies |
| `src/features/missions/` | Prediction and results interfaces |
| `tests/`, `docs/` | Unit/integration/browser checks, evaluation data and demo instructions |

The build was divided among three subagents for repository/evidence, retrieval/Q&A, and learning/evaluation; the integration agent owns shared configuration/contracts and the main UI. Work was partitioned by file ownership within the shared workspace. No deadline or named teammate availability was assumed.

## API

All route handlers run in the Node.js runtime. Errors use `{ "error": { "code": "...", "message": "...", "details": "optional" } }`.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/repository` | Snapshot metadata and source-file inventory |
| `GET /api/repository/map` | Static relationships and unresolved references |
| `GET /api/repository/source?fileId=...` | Allowlisted source; accepts snapshot/range validation parameters |
| `GET /api/evidence/[id]` | Verified evidence record and text |
| `GET /api/guides` | Walkthroughs and public tasks, without rubrics |
| `GET /api/tasks/[id]` | Public task prompt and context |
| `POST /api/tasks/[id]/attempt` | Validated answer, server score and released explanation |
| `POST /api/tasks/[id]/hint` | Hint and recorded hint count |
| `GET /api/results` | Current session summary and contribution briefs |
| `POST /api/questions` | Contextual Q&A response with explicit status and mode |
| `POST /api/session/reset` | Clear only the current session's practice data |

Question bodies are limited to 4 KB; general JSON requests are bounded to 8 KB. Snapshot mismatches, absent files/evidence, malformed answers, invalid ranges and provider failure return explicit outcomes. The local prototype prevents accidental answer reveal, not inspection by someone who controls its source or database.

## Boundaries

This is a single-repository local prototype. Private repositories, uploads, additional languages, authentication, code execution/editing, version comparison, personalized learning paths and production hosting are outside scope. Import resolution covers static ES imports and re-exports in the bundled TypeScript files; dynamic imports, CommonJS and dependency implementations are omitted. Four small practice tasks do not measure professional readiness. Human review and a participant study are future evaluation work, not completed findings.
