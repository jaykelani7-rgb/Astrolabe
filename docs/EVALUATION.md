# Prototype evaluation

This records observed checks against Zustand v5.0.8 at commit `0ea8be27db13019819fc1c0492e5b672dd7b6f4b` (snapshot `zustand-0ea8be27db13`). It does not establish that learners become ready to contribute professionally or that the tool improves learning compared with ordinary browsing.

## Q&A checks completed

On 15 October 2026, `npm test -- --run tests/qa.test.ts` passed **30 tests**. These cover:

- Real pinned-source prepared answers, exact source text/hash/range checks, and correct `reviewed` labeling without a credential.
- Rejection of invented citations, missing citations, invalid structured output, stale source, wrong snapshots, and mismatched evidence ranges.
- An unsupported encryption/payment question that returns an evidence gap before contacting an AI provider.
- Explicit unavailable states for missing credentials, provider failures, incomplete/oversized responses, and a synthetic timeout, including a fetch implementation that ignores cancellation.
- Cache isolation across snapshot, selected range, explanation depth, and question; failures are not cached.
- The HTTP question endpoint: prepared success, no intermediary caching, malformed JSON, a body larger than 4 KB, unknown files, invalid ranges, and wrong snapshots.

The Q&A adapter and its tests pass a focused TypeScript check. Application-wide build and browser-journey results are recorded by the integration checks separately.

## Offline question-bank run

Run: `npm run evaluate:qa`.

The committed [machine-readable report](qa-evaluation.json) was generated at `2026-10-15T18:04:49.163Z`. It preserves question IDs, configuration, snapshot/commit, complete responses, latency, source-reference checks, and empty reviewer notes.

| Measured outcome | Count |
| --- | ---: |
| Development questions executed | 16 |
| Authored prepared answers (`mode: reviewed`) | 4 |
| Live generated answers | 0 |
| Evidence-gap responses | 3 |
| Unavailable responses | 9 |
| Responses with source references | 4 |
| Invalid source references among those four responses | 0 |
| Median local response time | 0.56 ms |
| 95th-percentile local response time | 10.28 ms |

These times measure an in-process local run, including prepared answers and immediate no-credential failures. They do not measure Gemini/network latency, browser rendering, or an end-to-end learner session. There are only 16 measurements; they are not a service-level performance guarantee.

Of the twelve source-supported questions, four matched authored prepared answers and eight needed live AI, which was unavailable without a credential. Of four intentionally unsupported questions, three had no relevant lexical evidence and returned an evidence gap; one matched incidental source text and returned unavailable because semantic assessment required the absent AI provider. The report preserves that outcome rather than treating it as a successful gap detection.

## What reference validation establishes

Every successful answer must cite evidence from the context supplied to that generation request, or exact authored targets for a prepared answer. The server verifies the evidence ID, snapshot, allowed file, inclusive range, whole-file content hash, and exact source text. References outside the supplied context and malformed responses are withheld.

This establishes reference integrity. It does **not** establish that the explanation follows logically from the cited code, covers every relevant branch, or accurately explains external React behavior. The four prepared explanations were checked against source during implementation. Independent human claim review is still **pending**, including every prepared explanation and learning rubric. The application's `reviewed` mode labels authored prepared content; it must not be interpreted as a completed external review.

## Live adapter verification and remaining work

The Gemini request uses a server-only credential in `x-goog-api-key`, a 12-second timeout, at most 10,000 source characters/eight chunks, bounded provider output, structured Zod parsing, and allowed-evidence validation. Repository text is sent as data under a separate system policy. These controls are exercised with injected providers and mock HTTP responses.

The REST request shape was checked against Google's [structured-output REST guide](https://ai.google.dev/gemini-api/docs/generate-content/structured-output?hl=en): `generationConfig.responseFormat.text` supplies JSON MIME type and schema. The configurable default is [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash). No real Gemini request was executed in this run; live availability, response quality, and model-specific behavior remain **unverified** until a server credential is supplied.

To run development questions with live generation, configure `GEMINI_API_KEY` on the server and run `npm run evaluate:qa -- --live`. This disables prepared-answer matching for that evaluation so live output is measured directly. Avoid committing credentials or printing them in logs.

## Reserved questions and participant study

The [question bank](questions.json) contains 24 questions: 16 development questions and eight reserved held-out questions. The eight held-out questions were excluded from this implementation's evaluation and were not used to tune retrieval or prompts. Independent assignment and blind review have not occurred yet. Give the reserved questions to a reviewer who did not implement the system, freeze the implementation, then run `npm run evaluate:qa -- --held-out --live` and preserve the separate output. Do not retune against those results and continue calling them held out.

The proposed comparison with **6–8 peer participants is pending**. No participants, accuracy comparisons, task completion times, counterbalanced trials, or learning-effectiveness results have been collected. Source-reference checks and passing software tests cannot substitute for that study.

The integration lead will add whole-application test/build results after the final learner journey has passed. Independent claim review, live evaluation, peer study, and a backup demonstration recording remain delivery follow-ups until actually completed.

## Integrated Astrolabe redesign checks — 16 October 2026

The redesigned application passed `npm run typecheck`, all **47 automated tests** (9 repository, 30 Q&A, 8 learning), and an optimized `npm run build`. The integrated browser suite passed **7/7 checks in 17.7 seconds**, including all four real rubrics, question scope, retained answers/history, returning from a checkpoint, reset/session isolation, keyboard panel controls, reload/stale state, desktop/laptop/mobile layouts, and browser-external-network-blocked prepared mode. The final source build preserves the existing backend evidence and scoring boundaries.

The production browser JavaScript was inspected for selected private rubric explanations, the server credential name, and signing code; none of the inspected strings were present. This is a focused accidental-leak check, not a security audit. Full design-regression details, screenshots, and their limitations are in [REDESIGN-CHECKS.md](REDESIGN-CHECKS.md). Independent human claim review, live Gemini evaluation, the reserved held-out assessment and the participant study remain pending.

## Walkthrough branch check — 16 October 2026

The fetched `walkthrough-qa` feature at `e9a21e69b8affa32a6aa3fc769c07c6bab40d161` was integrated with the local redesign. The resulting app passed 85 automated tests, 10 browser checks, the optimized build, and 6 actual production HTTP checks. Prepared and live source scopes now enforce their file/line boundaries. [BRANCH-CHECKS.md](BRANCH-CHECKS.md) records the original branch checks, concrete fixes, regression cases and verification limits. No live-provider quality claim is added by these checks.
