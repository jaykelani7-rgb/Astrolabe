# Astrolabe redesign verification

Observed on 16 October 2026 against the running local application at `http://127.0.0.1:3000`, using Playwright with the installed Google Chrome channel on macOS arm64. The final full browser run passed **7 of 7 tests in 17.7 seconds**. A subsequent mobile-only run to refresh the checkpoint preview passed **1 of 1 tests**.

```sh
MENTOR_E2E_URL=http://127.0.0.1:3000 MENTOR_E2E_CHANNEL=chrome npm run test:e2e
```

The suite is `tests/e2e/journey.spec.ts`. It uses real source, scoring, evidence, signed sessions, and prepared answers. One deliberately failed question request is intercepted to verify that the user's draft survives an error; successful learning and question responses are supplied by the actual application.

| Regression | Observed result |
| --- | --- |
| Overview and navigation | Repository name, commit, real counts, Start learning, and four named navigation areas are accessible. |
| Continuous learning | A walkthrough opens its evidence; a checkpoint opens within the same flow; Continue walkthrough advances to the next step. |
| Task persistence | Revisiting an attempted checkpoint restores its feedback, attempt number, submitted answer, and hint count. |
| Four task rubrics | Choice, ordering, exact range, and React snapshot predictions score correctly through the browser. An incorrect choice followed by a correct retry records two attempts and one hint. |
| Progress and contribution briefs | The summary records four solved checkpoints, three correct first attempts, five attempts, and one hint for the test session. The two fixed briefs are visibly labeled Prepared contribution briefs and explain the related attempt/hint context. |
| Reset | Confirmation explains the session scope; cancel preserves results; confirm clears this session's attempts, hints, and unlocked feedback while preserving separately recorded visited steps. |
| Explicit question scopes | Captured outgoing requests show Repository omits file and line filters; Current file includes only the file filter; Selected lines includes that file and the exact inclusive range. |
| Answer continuity | Citation inspection, changing files, changing explanation depth, and Overview → Explore navigation retain the answer and its original question/context. |
| Question history | Earlier answers retain their original scope/depth. Return to latest answer restores the latest entry. A failed request preserves the draft. |
| Source continuity | File and selected range survive normal navigation and reload. Missing files, removed guide IDs, invalid ranges/steps, and malformed preferences fall back without a crash. |
| Keyboard and panels | Separators resize with arrow keys/Home; navigation expansion works with Enter; focus mode and both collapse controls work; source selection remains intact. |
| Desktop geometry | At 1440 × 1000, long answers scroll inside the mentor pane while the source remains in view. |
| Laptop geometry | At 1280 × 900, all three panels remain usable; the source panel is at least 350px wide, the settled navigation rail does not cover the file panel, and the page has no horizontal overflow. |
| Mobile continuity | At 390 × 844, Files/Code/Mentor tabs retain source, answers, feedback, and walkthrough position. Citation inspection opens Code and returning to Mentor retains the answer. No page-level horizontal overflow was observed. |
| External network blocked | Local Monaco, walkthroughs, scoring, evidence links, and prepared answers continue to work when all nonlocal browser requests are blocked. |
| Anonymous isolation | A fresh browser session cannot read or reset another session's attempts. Wrong snapshot submissions fail explicitly. |

## Visual inspection and artifacts

The latest rendered overview, evidence-inspection workspace, laptop workspace, and mobile mentor were inspected. The final captures show warm off-white surfaces, charcoal text, teal controls, readable explanations, a coordinated dark source editor, and no persistent panel overlap or clipped page content. Screenshot animations are disabled so the captures represent settled layout.

- `docs/preview.png`: overview at 1440px.
- `docs/preview-desktop.png`: source evidence alongside a retained answer at 1440px.
- `docs/preview-laptop.png`: three-panel workspace at 1280px.
- `docs/preview-mobile.png`: overview at 390px.
- `docs/preview-mobile-workspace.png`: mentor and retained answer at 390px.
- `docs/preview-prediction.png`, `docs/preview-results.png`, and `docs/preview-mobile-prediction.png`: refreshed checkpoint/progress previews.
- `docs/demo.webm`: recording of the actual automated walkthrough, prediction, feedback-restoration, progress, and reset journey.

The initial test run used a PostgreSQL migration question as an unsupported fixture. Zustand contains persisted-state migration source, so lexical retrieval found related words and correctly reported unavailable live AI without a credential. The final evidence-gap fixture asks about Kubernetes deployment authentication, which is absent from the prepared source. This distinction is retained here rather than treating the first response as a successful semantic gap judgment.

## Scope of verification

The new learning-progress API also passes eight focused learning tests, including no-attempt explanation privacy, restored feedback/hints, signed-session isolation, and reset. TypeScript checking passed. The final optimized production build passed, and all 47 automated tests passed (9 repository, 30 Q&A, 8 learning). The browser JavaScript also contained none of the inspected private rubric, signing, or server-key strings.

These browser checks cover the installed Chrome channel and the three stated viewport sizes; they do not establish support for every browser, assistive technology, device, or zoom level. Keyboard control behavior was exercised, but this is not a complete accessibility audit. The external-request check blocks browser network access while retaining the local application server; it is not a service-worker or disconnected-server mode.

No live Gemini credential, independent human claim review, or participant study was used in these redesign checks. Prepared answers remain explicitly labeled, and live-provider availability is shown as unverified rather than inferred from configuration.

After the production build, the question-scope/history/citation regression and the 1280px laptop geometry/keyboard regression were repeated against `npm start`: **2/2 passed in 5.9 seconds**. Desktop and laptop workspace captures were refreshed from that optimized build, at scroll origin, to avoid full-page capture artifacts from sticky headers. The preview server was stopped after verification; start the app with `npm run dev` or `npm start`.
