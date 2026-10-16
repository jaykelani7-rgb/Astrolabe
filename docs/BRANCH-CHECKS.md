# Walkthrough branch integration and verification

Observed on 16 October 2026. Fetched `origin/walkthrough-qa` from the configured Astrolabe GitHub remote at full application commit **`e9a21e69b8affa32a6aa3fc769c07c6bab40d161`**.

The existing Astrolabe redesign was still local and uncommitted. Per the user's choice, the branch's feature changes were combined with that redesign in the primary workspace. Its older shell and styles were adapted to the current notebook interface. The local design, scoring, anonymous sessions, evidence access and existing question history were preserved. The remote branch has a separate initial commit history with the same starting source; integration applied its feature changes without resetting the working checkout or forcing an unrelated-history merge.

The analyzed source snapshot remains Zustand v5.0.8 at `0ea8be27db13019819fc1c0492e5b672dd7b6f4b`. The application branch commit above and the analyzed repository commit serve different purposes.

## Original branch checks

The fetched branch was checked in a separate managed checkout. Its unchanged source passed:

- TypeScript checking.
- All **57 original automated tests**.
- A lockfile dependency installation, source preparation and optimized production build.

An initial attempt to reuse dependencies through a symlink hit Turbopack's project-root restriction. Installing the exact locked dependencies inside the checkout resolved that verification setup issue; no framework configuration change was needed.

## Integrated feature

In **Learn**, choose **This walkthrough** in the contextual mentor. It sends the guide and active-step IDs without file or line filters. Reviewed source targets from the flow are resolved on the server, with the active step first. Source limits, snapshot validation, citation checks, failure states and cache isolation still apply.

For an example, select **From a store to a React selection**, stay on **Reuse the vanilla store**, and ask **What is getInitialState?** in This walkthrough scope. Its prepared explanation can cite both the React and vanilla targets from the reviewed flow. The original guide/step remain attached to the answer. Citation inspection, navigation, history, reload, retries and explicit depth reruns retain that original context.

Repository, Current file and Selected lines remain separate choices. Outside Learn, walkthrough scope is unavailable and the next question's actual fallback is identified. The four controls use a readable two-by-two layout on small panels and mobile screens.

## Errors found and fixed

1. **Prepared answers could exceed the chosen source scope.** The old prepared-answer matcher allowed overlapping selected ranges and explanations with citations in another file. Every prepared citation target must now fit the explicit file/range or allowed walkthrough evidence before the answer is released. Repository scope remains unrestricted within the snapshot.
2. **Selected-line live retrieval could silently expand to the rest of the file.** It previously combined the selection with broader full-text matches. It now supplies only the exact selected canonical range. Current-file retrieval defensively rejects other-file matches.
3. **Invalid context and evidence substitutions could weaken internal boundaries.** Empty file IDs are rejected, lower-level retrieval validates mutually exclusive scopes, and evidence checks reject substituted IDs, substituted source-file identity, non-integral ranges, and broadened selected/walkthrough records before generation.

For example, the prepared unsubscribe explanation cites both lines 60–64 and 88–92. Selecting only 88–92 cannot release that full authored explanation. Without an AI key, it returns unavailable with no citations. A wider explicit source selection or an appropriate walkthrough can supply the needed context. This is deliberate scope enforcement, not a provider-success claim.

## Final observed checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | **85/85 passed**:68 Q&A/walkthrough, 9 repository, 8 learning |
| Full browser suite | **10/10 passed in 26.7 seconds** |
| `npm run build` | Optimized build passed, including TypeScript and every route |
| Production HTTP checks | **6/6 passed** against `npm start` |
| Client output inspection | None of the inspected private rubric explanations, signing code, or server-key strings were present |
| `git diff --check` | Passed |

The browser suite covers all four prediction rubrics, hint/retry results, session isolation/reset, original source scopes, strict selected-line feedback, walkthrough cross-file answers, original-context replay, retained answers/history, old history compatibility, stale walkthrough errors, keyboard access, desktop/laptop/mobile layouts and external-network-blocked prepared mode.

The six actual production HTTP checks verified a prepared cross-file walkthrough answer, restricted selected-line/current-file behavior, contradictory scope rejection, unknown-step rejection, and empty-file-ID rejection. Exact outcomes are saved in [branch-production-checks.json](branch-production-checks.json).

Artifacts:

- [Walkthrough question on mobile](preview-walkthrough-mobile.png).
- [Actual walkthrough Q&A recording](demo-walkthrough-qa.webm).
- The existing overview, workspace and learning screenshots were refreshed by the full browser suite.

No live Gemini credential was used. Provider calls remain unverified; provider success/failure and citation cases are covered with controlled adapters. Independent human claim review, the held-out reviewer evaluation and the participant study remain pending. These software checks do not establish professional readiness or semantic correctness of every AI explanation.
