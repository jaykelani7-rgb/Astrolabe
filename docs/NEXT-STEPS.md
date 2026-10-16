# Astrolabe next steps

Updated 16 October 2026. Use the current implementation and `PROJECT-AUDIT-2026-10-16.md` alongside `plan.md`. The attached review is a roadmap based on an older commit, not a new mandatory specification. Names and available hours are unconfirmed; A–D below describe ownership.

## Current follow-up

The local definition-retrieval step is delivered: see `AI-QUALITY-2026-10-16.md`. Keep Q01 and the incomplete mechanism explanations in the review queue. Teach-back is now connected after an attempted prediction, including saved explanations, per-concept self-review, source-linked follow-ups and resume support. See `TEACH-BACK-UI.md`. The next UI feature is saved goals and contribution remediation.

## Start here

1. The owner committed and pushed the integration on `walkthrough-qa` as `5269d66`, including `main` through bf61b7d and the authorized `krishna` branch through c82a71b. Review the new teach-back changes before the next owner commit. Do not repeat backend work already integrated.
2. Freeze the source/evidence, question scopes, answer blocks and learning version contracts before starting concurrent UI work. Agree on one owner for shared contracts and client workspace state.
3. Review real local-model answers against their source. Passing citation checks does not establish factual correctness. Preserve raw results and classify retrieval misses, invalid output, unsupported claims and correct refusals separately.
4. Build a single teach-back-to-contribution journey. Finish its error/loading/reset behavior and browser checks before adding more screens.
5. Run independent review and a small participant study. Use observations from actual participants; no learning-improvement claim is available yet.

## Recommended split for you and one teammate

| Owner | Work, in order | Boundary and completion check |
| --- | --- | --- |
| You: A + C | Maintain integration and website QA; review the local model's development answers; improve retrieval only for measured misses; then integrate claim-review corrections and rehearse the demo. | Preserve exact selection/file boundaries, fail closed on malformed citations, and keep local inference separate from cloud. A fresh local answer must open its actual source, retain its history and show honest unavailable/gap states. |
| Teammate: D | Review the delivered teach-back journey; then connect saved goals and ranked contribution remediation. | Use `/api/teach-back`, `/api/teach-back/review`, `/api/learning/goal`, `/api/contributions`. Never call self-assessment an automatic mastery score. Keep task/snapshot/version identifiers and reject late responses. |
| Teammate: B, after the core journey | Teach-back latest-submission resume is delivered. Add bookmark listing if resuming that screen requires it; help wire notebooks and snapshot selection. | Session-private, snapshot-scoped responses; no answer-key leaks; historical citations stay on the original commit. Coordinate schema migrations and shared contracts with you. |
| Both | Independently review prepared guides, answers and architecture; recruit 6–8 peers; run counterbalanced browsing/mentor tasks; inspect results and rehearse. | Use anonymous, consented observations and a fixed explanation rubric. A script validates data and summarizes it; people still supply judgments and observations. |

If all four roles are available, separate A (UI/integration), B (repository/storage), C (AI/retrieval) and D (learning/evaluation), matching `plan.md`. One person owns each shared file. Do not ask two people to rewrite the same workspace state simultaneously.

## Implementation queue with dependencies

### P0 — Reliability and evidence

- The citation-loading submission bug and mobile keyboard readiness check are addressed in this update. Keep the exact outgoing-range and focus assertions.
- Local AI is integrated through LM Studio using the existing Qwen2.5-Coder-7B-Instruct Q4_K_M model. Review development results before choosing demo questions. Add real unavailable-server and malformed-output checks when changing this adapter.
- Have a teammate label each substantive development-answer claim supported, unsupported or uncertain, with source ranges and corrections. Reserve held-out questions until implementation is frozen and an independent reviewer runs them.
- Gemini remains optional and unverified here. Supply its server credential only if the team wants a separate cloud-provider check.

### P1 — Complete the learning journey

1. Delivered: teach-back composer after an attempted supported task, explicit unavailable-rubric state, and session-private latest-submission resume endpoint.
2. Delivered: self-review concepts, required assessment for every concept, distinct evidence-linked follow-ups and revision/retry/reload/reset checks. Submitting prose alone does not establish understanding.
3. D adds a goal choice and contribution recommendations with remediation before blocked briefs. The catalog currently contains documentation work, not verified upstream test/debug issues.
4. A integrates the full journey, loading/validation/reset states and mobile layout. Test prediction → explanation → self-review → follow-up → contribution.
5. Both perform human source review and participant trials. `npm run evaluate:peers -- input.json output.json` analyzes real paired records; it does not recruit participants or score explanations automatically.

### P2 — Save and generalize

1. B provides any missing bookmark/submission listing contracts. A adds save-answer/bookmark and Markdown export controls. Export the stored records; do not regenerate historical answers.
2. A makes snapshot selection explicit across repository, map, source, evidence, guides, tasks, progress, questions, history, goals and notebook requests. Namespace browser state by snapshot/content version. B verifies isolation and migration.
3. Expose the already prepared mitt snapshots. Replace Zustand-specific filenames/range limits with returned metadata before treating this as a multi-repository website.
4. Add a manual same-repository snapshot comparison screen. Show conservative `needs_review` labels and retain old links. Changed files do not establish that every dependent explanation is wrong.
5. Add a repository-wide symbol/code search interface. The current filename filter is not global code search.

### Later, only after these gates pass

Bounded public GitHub ingestion, generated/reviewable tours, static change-impact guidance and separately attributed historical rationale. The current app does not import arbitrary repositories, generate reliable runtime traces, execute studied code or create upstream PRs.

## Review and handoff

Every feature handoff includes changed files, contract changes, checks actually run, failures, known limits and the next integration action. Keep `.codex/skills/`, `.agents/skills/`, `.env.local`, databases and model files out of Git. Preserve the saved local-work stash until the owner confirms everything needed has been recovered.

## Owner's Git handoff

The integration was committed and pushed by the owner as `5269d66`. No pending merge remains. After reviewing the handoff, the owner authorized the assistant to commit and push the teach-back follow-up using the owner’s configured Git identity. The commands below also document the normal owner workflow.

```sh
cd /Users/shashwat/Hackathons/VIT-Apex-3.0/Astrolabe
git status --short
git diff
git add -A
git diff --cached --check
git diff --cached --stat
git commit -m "feat: add teach-back explanations and concept self-review"
git push origin walkthrough-qa
```

The earlier local-work stash and external backup remain available; do not pop the whole old stash over the newer integration.
