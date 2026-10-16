# Clean setup and restart check

Observed on 15 October 2026. This is a record of executed checks, not a claim about other machines or production hosting.

## Environment

| Item | Observed value |
| --- | --- |
| Platform | macOS / Darwin arm64 |
| Node.js | 24.13.1 |
| npm | 11.8.0 |
| SQLite | 3.51.2, native `node:sqlite`, FTS5 available |
| Application | Next.js 16.4.1, React 19.3.1 |
| Analyzed repository | pmndrs/zustand, release v5.0.8 |
| Source commit | `0ea8be27db13019819fc1c0492e5b672dd7b6f4b` |

## Installation and build

A fresh temporary application copy excluded `node_modules`, `.next`, generated Monaco assets, SQLite files, session-signing files, environment files containing credentials, test outputs, and TypeScript build caches. The lockfile and bundled source snapshot were retained. This exercises installation and initialization without carrying application state or built dependencies from the development checkout.

The following commands passed in that copy:

```sh
npm ci --offline --no-audit --no-fund
node scripts/setup-monaco.mjs
npm run prepare:repository
npm run build
npm run start -- --port 3197
```

`npm ci` restored 105 packages from the existing npm download cache. Its postinstall step also generated the local Monaco assets. Running the setup step explicitly succeeded again. The preparation step reported 15 real source files, 1,409 lines, 102 top-level symbols, 21 import/re-export relationships, and 7 external dependency references. It created a new `data/mentor.sqlite` database and successfully queried source text with FTS5.

The production build compiled and completed its TypeScript checks. After integration fixes landed, the application source was refreshed in the same isolated installation and a second production build passed. Generated browser JavaScript was scanned for reviewed rubric explanations, `GEMINI_API_KEY`, HMAC signing code, and rubric identifiers; none of those inspected server-only strings were present.

## Actual HTTP checks and restart

The production application was started on `127.0.0.1:3197`. The checks used its real API and signed anonymous-session cookie.

| Check | Observed result |
| --- | --- |
| New database/session | Zero attempts and zero completed tasks |
| Initial public task | Prompt, choices, and evidence IDs; no answer or explanation field |
| Hint request | One hint recorded |
| Known incorrect answer | Scored incorrect |
| Known correct answer after retry | Scored correct, attempt number 2, one hint recorded |
| Results | One completed checkpoint, two total attempts, one hint |
| Independent second session | Zero attempts; first session's results were absent |
| Known prepared question | `answered`, explicitly `mode: reviewed`, source citations supplied |
| Unsupported repository question | Explicit `evidence_gap` |
| Supported nonprepared question without a Gemini key | Explicit `unavailable`, with missing-credential explanation |
| Local source-editor asset | `/monaco/vs/loader.js` returned HTTP 200 |
| Process stopped and restarted | Existing cookie remained valid; two attempts, one hint, and one completion were preserved |
| Reset after restart | The test session returned to zero attempts and zero hints |

The isolated server was stopped and its temporary installation removed after the checks. Its test sessions did not modify the development application's database.

## Additional persistence and source checks

The repository suite now has nine passing tests. Besides canonical source/range and FTS5 checks, it exercises missing-file, traversal-shaped file IDs, out-of-range requests, and stale snapshot errors through the actual route handlers. A separate fresh process rejects modified snapshot bytes. Two simultaneous writer processes inserted 24 attempts into the same task/session with every attempt number from 1 through 24 appearing exactly once.

## Limits of these observations

- Installation used a warm npm cache. An empty-cache registry download was not tested in the isolated copy.
- Only this macOS arm64 environment and Node 24.13.1 were exercised. The declared Node 22.13 minimum, Windows, and Linux were not independently tested here.
- Node emitted its experimental SQLite warning; the tested SQLite operations and FTS5 queries still passed.
- This host's execution sandbox blocks loopback listening and connecting by default. Local HTTP checks passed after those operations were authorized. Source preparation and production builds passed without socket escalation.
- A real Gemini credential and live provider response were not exercised in this setup check. Missing-key behavior and the prepared mode were exercised.
- The HTTP restart check covers backend behavior and locally served editor assets. The separate browser journey checks cover UI interactions.
- Independent human claim review, held-out reviewer assessment, and participant studies remain separate work. These setup checks do not establish semantic correctness of AI answers or professional readiness.
