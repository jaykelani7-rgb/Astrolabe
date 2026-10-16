# Astrolabe — team progress audit

**As of 16 October 2026 · branch: `walkthrough-qa`**

## Overall status

The core learner journey from `plan.md` is implemented: explore pinned source → follow a guide → predict → inspect feedback/source → ask contextual questions → view progress and prepared contribution briefs. Teach-back now extends that journey with saved explanations and concept self-review. The verification/freeze and final rehearsal gates remain open. This is a working local prototype; answer quality and learning effectiveness have not been independently established.

This audit uses `plan.md`, README, implementation and the latest recorded checks. `Contract.MD` is not the execution baseline. The friend's Word review describes an older version; its recommendations do not all belong to the original MVP.

## Completed and available in the website

| Area | Current behavior |
| --- | --- |
| Source workspace | Pinned Zustand v5.0.8 source: 15 TypeScript files, exact commit, license/provenance and source hashes; local read-only editor, filename filter and line selection. |
| Navigation and architecture | Overview, Explore, Learn and My progress; static import map; four-module architecture summary with reading order and source links; responsive panels and keyboard controls. |
| Walkthroughs | Two Zustand guides, nine steps, Beginner/Developer explanations, saved position and visited steps. Independent human content review remains pending. |
| Predictions and progress | Four checkpoints; server-only answer keys, hints, attempts/retries, feedback after an attempt, restored submissions, progress and session-specific reset. |
| Contextual Q&A | Repository, Current file, Selected lines and This walkthrough scopes; validated source ranges; observed/inferred/unknown answer blocks with their own links; up to 12 browser-history answers retain their original context. Prepared answers are labelled. |
| Local AI | LM Studio adapter using Qwen2.5-Coder-7B-Instruct Q4_K_M, alias `astrolabe-coder`; explicit provider selection, bounded source/output, unavailable/gap states and no automatic cloud fallback. Retrieval now prioritizes named implementations and nested definitions. |
| Teach-back — latest changes | After an attempt: save/revise an explanation, assess every concept, inspect source and open concept-specific practice. Saved work resumes after navigation/reload. Covers two default Zustand checkpoints; other checkpoints disclose unavailable rubrics. This is learner self-assessment, not automatic mastery grading. |
| First contribution | Two prepared documentation briefs, source targets, verification steps and related practice context. |
| Persistence and isolation | Signed anonymous sessions; snapshot/content-version checks; session-private learning records; restart/reset behavior verified. Local skills, credentials, databases and model files stay out of Git. |

## Backend exists; website integration remains

| Feature | Already implemented | Remaining interface work |
| --- | --- | --- |
| Learning goals and contribution ranking | Goal storage, deterministic ranking and prerequisite remediation APIs. | Goal chooser, saved goal, ranked recommendations and links back to prerequisite practice. Catalog currently contains documentation work, not verified upstream debug/test issues. |
| Notebook and bookmarks | Stored answer records, bookmarks and Markdown export. | Save/bookmark/export controls; listing/read contracts where needed. |
| Additional snapshots | Two pinned mitt snapshots with separate learning packs and isolated records. | Snapshot selector and consistent propagation through source, guides, tasks, questions, progress and saved state; remove remaining default-Zustand assumptions. |
| Snapshot comparison | Same-repository changed-file comparison and conservative stale-content flags. | Comparison screen and original-commit citation navigation. |
| Server answer history | Session-private durable history API. | Website currently uses its browser history; connect server history if durable/resumable history is required. |
| Global source search | AST symbol indexing and full-text retrieval. | Global code/symbol search controls; current filename filtering is narrower. |

## Quality and verification

Latest completed feature checks: **133/133 unit/service tests, 17/17 browser journeys, 16/16 production HTTP groups, TypeScript and production build passed.** Browser checks include desktop/mobile, citation navigation, delayed responses, loading/save/review failures, revision, reload and reset. HTTP checks include session isolation, malformed/stale input, all bundled snapshots, teach-back resume and process restart.

The latest local-AI development run returned 12 answers and four evidence gaps across 16 questions, with no invalid references. Median latency was about 4.26 seconds and p95 about 5.32 seconds in that run. **12/16 is response coverage, not accuracy.** Q01 needs correction around the identity guard; Q03, Q07, Q08 and Q10 omit mechanism details. Valid citations do not establish correct prose. No new AI evaluation was run for this audit or teach-back feature; teach-back does not call a model.

Still pending: independent source/claim review, the eight held-out questions, and the proposed 6–8-person participant study. No learning-improvement percentage is justified. Real Gemini calls remain optional and unverified. Fresh-clone setup by a teammate and a final rehearsal/backup recording matching the latest UI also need sign-off.

## Recommended assignments and order

| Owner | Assignment | Completion check |
| --- | --- | --- |
| You — A/C | Review and commit the teach-back changes; own integration and local-AI quality. Work through flagged development answers with source-backed corrections. | Existing scope/privacy regressions stay green; factual claims receive independent review. |
| Teammate — D | Next: connect saved goals and ranked contribution recommendations, with prerequisite practice before blocked briefs. | Goal survives reload; recommendations explain their basis; prediction → teach-back → follow-up → contribution works on desktop/mobile. |
| Teammate — B | After shared contracts are agreed: notebook/bookmark controls and missing list contracts, then snapshot selection/comparison support. | Private records remain session/snapshot scoped; old citations retain their original commit. |
| Everyone | Independently review prepared content, run held-out evaluation and peer trials, then rehearse the demo and refresh its backup recording. | Report observed results and limitations; a teammate can run the project from README. |

With only two people, you retain A/C and integration; your teammate starts with D, then takes B's queued work. Agree on one owner before changing shared contracts or workspace state. These are proposed assignments, not messages sent to teammates.

Arbitrary repository URL import, generated tours, static change-impact guidance, historical rationale, production hosting and executing/editing studied repositories remain deferred beyond the current core demo.

## Git handoff

The integration is committed as `5269d66`. A remote fetch before publication confirmed local HEAD and `origin/walkthrough-qa` both point there; neither branch had additional commits at that check. No merge is pending and no conflicts are unresolved.

Teach-back, its checks/screenshots and documentation updates were initially left for owner review. The owner subsequently authorized the assistant to commit and push this follow-up under the configured identity `Shashwat2907 <work.shashwatchoudhary@gmail.com>`. The commands below document the publication workflow:

```sh
cd /Users/shashwat/Hackathons/VIT-Apex-3.0/Astrolabe
git branch --show-current
git status --short
git diff
git add -A
git diff --cached --check
git diff --cached --stat
git commit -m "feat: add teach-back explanations and concept self-review"
git push -u origin walkthrough-qa
git status --short --branch
```

Expected branch: `walkthrough-qa`. The commit message describes the new feature; `git push` publishes that commit. If a push is rejected because the remote advanced, preserve local work and inspect the divergence before integrating; do not force-push.

Supporting records: `TEACH-BACK-UI.md`, `AI-QUALITY-2026-10-16.md`, `NEXT-STEPS.md`; production HTTP evidence in ignored `.data/verification/http-2026-10-16T17-00-17-002Z/report.json`. The older `PROJECT-AUDIT-2026-10-16.md` retains historical findings and counts.
