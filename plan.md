# Codebase Mentor — Prototype Implementation Plan

Status: proposed execution plan, not a record of completed features.  
Team: four members, each using a separate Codex session.  
Planning basis: the agreed hackathon MVP and submission deck.  
Schedule: milestone-based until the team confirms its deadline and available hours.

## 1. What we are building

Build a working learning tool for understanding an unfamiliar codebase. A learner explores modules, follows two reviewed flows, attempts four short tasks, checks explanations against source evidence, asks contextual questions, and receives a small first-contribution brief.

The main demonstration is **understanding through prediction and source verification**. The module map and Q&A support that experience.

The prototype is complete only when this journey works end to end on real source files. Attractive screens with disconnected mock responses do not satisfy the completion criteria.

### Required scope

- One public JavaScript/TypeScript repository at one pinned commit.
- A file/module map showing supported static import relationships.
- A read-only source viewer with file and line highlighting.
- Two manually reviewed walkthroughs connected to exact source ranges.
- Four tasks using the Predict Before Reveal interaction.
- Contextual Q&A with citations and an explicit insufficient-evidence state.
- Beginner and Developer explanation variants for the reviewed content.
- A results page with task-level feedback and two reviewed contribution briefs.
- A prepared mode that keeps reviewed guides and tasks usable without an AI API.
- Measured prototype checks and an honest summary of remaining limitations.

### Deferred scope

Private repositories, arbitrary repository uploads, additional languages, repository version comparison, personalised learning paths, voice, automatic code changes, authentication and a production deployment platform are outside the initial build. A map of static imports must not be presented as a runtime execution trace. Task results must not be presented as a validated measure of professional readiness.

## 2. Decisions to make together before coding

1. Confirm which member owns A, B, C and D below. Suggested: Krishna takes A if he wants to lead integration and the demonstration.
2. Confirm the deadline and each member's available hours. Convert the milestones into dates only after that.
3. Select one small, permissively licensed JS/TS repository with two understandable flows and suitable code for four tasks. Prefer clear imports, limited generated code and manageable source size. Record its URL, license and exact commit SHA.
4. Confirm that all members can run the same Node.js version and the chosen SQLite driver locally.
5. Confirm that one server-side AI credential is available. If it is not, keep live Q&A explicitly unavailable while reviewed guides still work. Do not disguise prepared answers as live generation.

These choices belong in the repository README so every Codex session sees the same decisions. No specific repository, implementation progress or deadline is assumed by this plan.

## 3. Learner workflow

### Screen 1 — Start

Show the prepared repository name, pinned commit, supported language and available walkthroughs. The learner clicks **Explore repository**. For this MVP, repository preparation happens before the demo; there is no promise to ingest any URL entered by a judge.

### Screen 2 — Explore

Show a file tree, a simplified module map and the selected source file. Clicking a supported module or file opens its source. Clearly label import relationships and any omitted or unresolved relationships.

### Screen 3 — Guided walkthrough

The learner selects one of two flows. Each step opens a reviewed file/range and explains its role. Previous/Next changes the focus. A visual pointer highlights the current target without taking control away from the learner. Beginner/Developer changes the explanation depth while preserving the source target.

### Screen 4 — Predict Before Reveal

At a task checkpoint, show the question and relevant source. The learner selects a range, orders steps or chooses a change point. The answer stays hidden until the learner submits an attempt. The server scores the submitted answer against a reviewed rubric.

After submission, show the result, explanation and evidence links. Wrong answers receive a useful hint or explanation. Record hints and attempts so the summary does not imply that a correct answer was unaided.

### Screen 5 — Evidence and contextual Q&A

An evidence link opens the cited file/range from the same snapshot. The learner can ask about the current file, selected range or walkthrough. The backend retrieves relevant source, requests a structured answer and validates its references.

The UI distinguishes reviewed content from live AI output. When supporting evidence is missing, show a clear evidence gap rather than an invented answer. Structurally valid citations do not prove that an explanation is correct.

### Screen 6 — Results and first contribution

After the tasks, show completion, first-attempt results, hints used and topics to revisit. Present two manually reviewed contribution briefs with context, files to inspect and verification steps. Explain which task results inform each suggestion. The learner reviews a possible change; the tool does not edit or execute the repository.

## 4. Preparation and backend workflow

1. **Prepare the snapshot:** obtain the agreed public commit and store an immutable local source copy. Exclude secrets, dependencies, build output, binary files and files outside the allowed source roots. Preserve license and provenance.
2. **Index source:** inventory files, parse supported imports and symbols, and assign stable evidence IDs to source ranges. Store search text in SQLite FTS5. Mark unresolved imports honestly.
3. **Review learning content:** author two guides, four tasks and two contribution briefs against those evidence IDs. Review every explanation and answer key against the pinned code.
4. **Serve source and map:** return only allowed snapshot files and valid ranges. Accept file IDs rather than arbitrary filesystem paths.
5. **Answer questions:** retrieve source chunks, send only the selected context to the model, parse structured output, validate references, then return the answer or an evidence gap.
6. **Handle attempts:** validate the task and session, score on the server, save the attempt, then release feedback. Persist results for the demo session and support a clean reset.

Do not install dependencies or run scripts from the repository being analysed. Parsing source is sufficient for the planned MVP. Keep AI keys on the server. Treat repository text as source material, not instructions for the assistant or application.

## 5. Architecture

Use one application repository with Next.js, React and TypeScript. Use Next.js route handlers for the backend, running in the Node.js environment required by the filesystem and SQLite components.

| Part | Planned implementation | Reason |
|---|---|---|
| Application and API | Next.js + TypeScript | One codebase and shared contracts |
| Module map | React Flow | Clickable file/module relationships |
| Source viewer | Monaco, read-only | Line selection and range highlighting |
| Static analysis | ts-morph | Supported imports and source symbols |
| Storage/search | SQLite + FTS5 | Local index, evidence and attempt storage |
| Contract validation | Zod | Validate requests and structured responses |
| AI | One Gemini server adapter | Keep provider-specific code isolated |
| Prepared mode | Reviewed local guides/tasks | Demonstration works without live AI |
| Verification | Vitest + Playwright | Core logic and learner journey checks |

A selects and pins compatible dependency versions once. B verifies that the SQLite build actually supports FTS5. Do not have four Codex sessions independently install different package versions. Ollama is optional work after the full MVP passes.

Default delivery is a local Node.js demonstration with persistent local files and SQLite. If hosted delivery is required, decide the host and storage strategy before deployment; do not assume local SQLite will persist on an ephemeral server.

## 6. Four-member ownership

| Member | Main responsibility | Owned implementation areas | Completion evidence |
|---|---|---|---|
| A — UI and integration lead | Application shell, Explore/Guide interfaces, navigation and source/evidence interaction | `src/app/` pages/layouts, `src/components/`, `src/lib/client/`, shared contracts, root configuration | Learner completes the integrated journey without manual page or database fixes |
| B — Repository and evidence backend | Snapshot preparation, parser, map, source access, search index and persistence layer | `src/lib/repository/`, `src/lib/evidence/`, `src/lib/db/`, repository API routes, preparation scripts | Real pinned source loads, map resolves supported imports, evidence ranges are stable and correct |
| C — Retrieval and AI | Context selection, provider adapter, structured Q&A validation, cache and failure handling | `src/lib/ai/`, `src/lib/retrieval/`, question API route | Supported question has inspectable citations; unsupported question and API failure produce honest states |
| D — Learning and evaluation | Reviewed flows/tasks/briefs, scoring, result logic, mission UI and end-to-end evaluation | `content/`, `src/lib/learning/`, learning API routes, `src/features/missions/`, `tests/e2e/` | Four tasks score correctly; answers stay server-side until feedback; reviewed content matches source; evaluation is reproducible |

All four members write focused checks for their own logic. D coordinates cross-feature testing; D is not responsible for discovering every defect alone.

### Shared-file rules

- A owns `package.json`, lockfile, TypeScript/lint/build configuration and `src/contracts/`.
- B owns database schema and migrations. D specifies attempt-storage needs early; B implements the schema once.
- D's mission/results components live in `src/features/missions/`. A mounts them in the application pages instead of both members editing the same page.
- Only A merges to `main`. Each member works in a separate branch and clone/worktree, not the same mutable checkout.
- Proposed contract changes must be coordinated before callers or implementers change behavior. Use additive changes where possible and update fixtures together.

## 7. Contract and API agreement

Freeze a small `src/contracts/` package before parallel feature work. A owns the files; B, C and D review their respective contracts.

### Shared records

| Record | Minimum fields and rules |
|---|---|
| Snapshot | `snapshotId`, repository URL/name, full commit SHA, license, preparation status |
| SourceFile | `fileId`, `snapshotId`, relative path, language, line count |
| Evidence | `evidenceId`, `snapshotId`, `fileId`, inclusive 1-based `startLine`/`endLine`, source-content hash |
| Map | Nodes with IDs and file IDs; edges with `from`, `to`, `kind: import`; unresolved relationships separately |
| Guide | ID, snapshot ID, title, ordered steps, reviewed explanation variants and evidence IDs |
| PublicTask | ID, prompt, task type, choices/selectable targets and source context; no answer key |
| Attempt | Session ID, task ID, submitted answer, attempt number, hints used and server timestamp |
| Feedback | Result, reviewed explanation, supporting evidence IDs and permitted next step |
| Q&A response | `status`, `mode`, answer, citations, limitations; mode is `live` or explicitly `reviewed` |
| ContributionBrief | ID, goal, prerequisites, source targets, bounded suggested change and verification steps |

Evidence identity is scoped to a snapshot. An old evidence ID must never silently resolve against different source. Reviewed guide text and rubrics remain versioned with that snapshot.

### Endpoints

| Endpoint | Owner | Purpose |
|---|---|---|
| `GET /api/repository` | B | Prepared snapshot metadata |
| `GET /api/repository/map` | B | Module map and unresolved imports |
| `GET /api/repository/source?fileId=...` | B | Allowed source content |
| `GET /api/evidence/[id]` | B | Validated evidence and source target |
| `GET /api/guides` | D | Public guides and reviewed source links |
| `GET /api/tasks/[id]` | D | Task prompt without the answer key |
| `POST /api/tasks/[id]/attempt` | D | Validate/score attempt and return feedback |
| `GET /api/results` | D | Current session summary and contribution briefs |
| `POST /api/questions` | C | Question plus snapshot/file/range context |
| `POST /api/session/reset` | D | Reset this demo session's attempts |

Use a server-issued anonymous session cookie for the local demo. Keep correct answers in server-only modules and out of task payloads/client bundles. The MVP prevents accidental answer reveal; it does not claim to resist a determined user inspecting a local installation.

Agree on one error envelope: `error.code`, a readable `error.message`, and optional details. Define invalid input, missing file/evidence, snapshot mismatch, insufficient evidence and AI unavailable as explicit outcomes. Bound request sizes and AI timeouts.

### AI response checks

- Citations must refer to evidence supplied to that question's generation request.
- Every evidence record must match the active snapshot and an existing allowed source range.
- Unsupported references or invalid output cannot be rendered as a successful grounded answer.
- If evidence is insufficient, return an evidence-gap status. If the provider times out, show unavailable or an explicitly labelled reviewed answer for a known matching question.
- Reviewed claims have human review. Live claims are AI-generated, even when their citation structure passes validation.

## 8. Parallel execution and integration milestones

### M0 — Shared foundation

**A:** scaffold the app, pin dependencies, add contracts and a basic interface.  
**B:** confirm the selected commit, file inventory and SQLite/FTS5 compatibility.  
**C:** confirm server credential handling and a minimal provider request.  
**D:** identify the two flows and draft four task prompts from real source.

Together, approve fixtures covering one snapshot, one source file, one evidence range, one guide step, one task and each major error state. Fixtures use the frozen contracts. Everyone starts feature work from this common baseline.

**Gate:** four fresh clones can install and start the app; contracts validate example payloads; the selected repository and commit are recorded.

### M1 — One complete learner path

**A:** build navigation, source viewer and a single guide/task experience using the agreed fixtures.  
**B:** return real snapshot metadata, source, evidence and a basic map.  
**C:** implement retrieval against B's search interface and the structured Q&A adapter.  
**D:** deliver one reviewed guide step, one real task, scoring and feedback UI.

Integrate in this order: real source/evidence, one reviewed guide, one task/feedback, then live Q&A. UI fixtures keep A moving but are not shown as completed backend work.

**Gate:** a learner opens real source, follows one step, submits one prediction and opens its feedback evidence. One Q&A request works with real retrieved source or reports an explicit evidence gap.

### M2 — Full agreed scope

**A:** finish map interaction, two-flow navigation, pointer behavior, explanation-depth controls and result-page integration.  
**B:** finish indexing/search, stable identifiers, file limits and snapshot checks.  
**C:** finish timeout/unavailable handling, retrieval controls, validation and cache isolation by snapshot/context.  
**D:** finish two reviewed flows, four tasks, result logic and two contribution briefs.

**Gate:** all required features run from one integrated branch. Reviewed content works with the AI credential removed. There are no placeholder answers in the demonstrated path.

### M3 — Verification and freeze

Each owner fixes their feature defects. D runs the cross-feature checks below. A tests setup from a fresh clone and freezes feature scope. Prepare the evaluation evidence and demonstration script.

**Gate:** build/type checks pass, the learner journey passes, failure states work, citations inspected for the prepared content are correct, and remaining limitations are recorded.

### M4 — Rehearsal and handoff

Run a short live rehearsal, then repeat with AI/network unavailable. Test reset and restart. Record a backup demonstration of the actual application. Keep final claims consistent with observed functionality and the submitted proposal.

**Gate:** a teammate who did not build the UI can start and demonstrate the prototype from the README.

Reserve approximately the final quarter of available team time for integration, fixes, verification and rehearsal. This is a planning allocation, not an estimate that the build will fit a particular number of days.

## 9. How each member should use Codex

Each member gives their Codex session this plan and the repository's current README/contracts. Work in small reviewed increments and commit each coherent change. Do not ask four sessions to build the entire application independently.

### Common opening instruction

> Read plan.md, README.md and applicable AGENTS.md files. Inspect the current code before editing. Work only on my assigned role and branch. Use the shared contracts and fixtures. Do not change shared configuration, another owner's files, or API contracts without coordinating with the integration lead. Start with the current milestone and list your files, dependencies and completion checks. Implement a small working increment, run relevant checks, then report what changed, how it was verified and what remains blocked. Never describe mocked, planned or untested behavior as working.

### A's assignment

> You own role A: UI and integration. Establish the scaffold and contracts first, then implement Explore, Guide, source/evidence interaction and application navigation. Mount D's mission/results components through the agreed interfaces. Integrate B and C incrementally. Preserve a runnable main branch and document setup. Review changes before merging; do not overwrite teammates' work.

### B's assignment

> You own role B: repository and evidence services. Implement one pinned JS/TS snapshot, supported static import analysis, source inventory, SQLite/FTS5 search, evidence identity and validated source access. Coordinate attempt-storage requirements with D. Do not execute the analysed repository. Prove that returned source ranges and snapshot IDs are correct.

### C's assignment

> You own role C: retrieval and Q&A. Consume B's search/evidence interface. Implement a server-only AI adapter, structured answers, citation checks, timeouts and explicit evidence-gap/unavailable states. Keep reviewed fallback content distinguishable from live output. Do not claim that citation validation establishes semantic correctness.

### D's assignment

> You own role D: learning and evaluation. Author two reviewed guides, four tasks and two contribution briefs for the pinned source. Implement server-side scoring, hint/attempt tracking, mission/results components and session reset using B's persistence layer. Coordinate with A for page integration. Add meaningful end-to-end checks and an evaluation summary based only on observed runs.

For every handoff, provide: branch/commit, changed files, contract changes, checks run, known limitations and the next integration action. Never send credentials in a handoff or commit them.

## 10. Verification checklist

### Functional checks

- [ ] Opening the prepared repository shows the recorded commit.
- [ ] Map/file clicks open the correct source; unsupported imports are labelled.
- [ ] Every step in both guides opens its intended source range.
- [ ] Beginner/Developer explanations point to the same reviewed evidence.
- [ ] Four tasks accept valid answers, reject malformed submissions and score known correct/incorrect answers predictably.
- [ ] Task answer keys are absent from initial public responses and client code.
- [ ] Hints, repeat attempts and completion appear accurately in results.
- [ ] Both contribution briefs include files to inspect and verification steps.
- [ ] Reset clears only the current session; another session's results do not leak.

### Evidence and failure checks

- [ ] Missing file, out-of-range lines and wrong snapshot fail explicitly.
- [ ] A question unsupported by indexed source produces an evidence gap.
- [ ] A generated nonexistent citation cannot become a clickable valid answer.
- [ ] AI timeout and absent credentials leave reviewed guides/tasks usable.
- [ ] Source-file requests cannot escape the allowed snapshot roots.
- [ ] Prepared answers are visibly labelled and never mistaken for live Q&A.
- [ ] Clean restart preserves or resets data as documented.

### Evaluation promised in the proposal

Prepare 24 repository questions, with eight held out before tuning retrieval/prompts. Give the held-out questions to a reviewer who does not use them during implementation. Evaluate reference validity, human-reviewed claim support, evidence gaps and measured latency. Preserve question IDs, commit, configuration, responses and reviewer notes.

If 6–8 peer participants are available, compare ordinary browsing with mentor-assisted tasks. Use matched but different tasks, counterbalance order where practical, and record accuracy, completion time and hints. Explain the small sample and task differences. A small pilot supports observations, not a proven general improvement claim. If participants or time are unavailable, mark this study pending and report only the checks actually completed.

## 11. Demonstration sequence

1. Briefly explain the unfamiliar-repository problem.
2. Open the prepared snapshot and choose a module.
3. Follow one reviewed walkthrough and show the source highlight.
4. Submit a prediction before revealing the explanation.
5. Open the feedback's exact evidence range.
6. Ask one supported question and one unsupported question.
7. Show results and a scoped contribution brief.
8. Disable live AI and demonstrate that reviewed guides/tasks remain available.

Prepare a roughly five-minute version and a shorter version if the organisers impose a different limit. Do not claim that an illustrative task proves the learner can safely modify an arbitrary repository.

## 12. Final delivery checklist

- [ ] One integrated source repository with pinned dependencies and no credentials.
- [ ] README covering setup, preparation, environment variables, start, reset and known limitations.
- [ ] Snapshot provenance and license attribution.
- [ ] Two reviewed guides, four tasks and two contribution briefs.
- [ ] A working local demo and clearly documented AI availability requirements.
- [ ] Actual test/evaluation results, with pending work labelled.
- [ ] Backup recording of the working application.
- [ ] Final presentation/demo wording matches implemented behavior.

## 13. Immediate next action

The team first confirms the deadline, maps names to roles A–D, and selects the repository/commit. A then prepares M0 and shares the contracts/fixtures. B, C and D can begin their M0 checks at the same time. Do not spend the first implementation session expanding scope or polishing every screen before the first working learner path exists.

## Technical references

- Next.js route handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Next.js backend guidance: https://nextjs.org/docs/app/guides/backend-for-frontend
- ts-morph source files and import relationships: https://ts-morph.com/details/source-files
- SQLite FTS5: https://www.sqlite.org/fts5.html

These references support the selected building blocks. The division of work, contracts, milestones and acceptance criteria are this project's proposed engineering plan.
