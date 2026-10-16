# Five-minute demonstration

1. Start with `npm ci`, `npm run setup`, `npm run dev`, then open http://127.0.0.1:3000. Leave `GEMINI_API_KEY` blank to demonstrate prepared mode.
2. On Overview, show Zustand, its MIT license, and pinned commit `0ea8be2`. Click **Explore repository**. Open `src/vanilla.ts`; switch to **Module map** and click `src/react.ts`. Explain that edges are static imports.
3. Open **Walkthroughs**, choose **From state update to subscribers**, and follow the steps. Toggle Beginner/Developer; the exact source target stays the same.
4. Open **Prediction tasks**. For **Will subscribers hear this?**, first make an incorrect prediction. Show feedback and click **Verify explanation** to inspect lines 66–81. Retry; choose “No subscriber is called for this update.”
5. Demonstrate one ordering or range task. The merge decision is lines 75–78; include the assignment and both branches. Explain that hints and retries remain in the results.
6. Open `src/vanilla.ts`, clear any unrelated line selection by clicking the file again, then ask **How does setState update state?**. Point out **Reviewed answer** and inspect its citations. Ask **How does this repository implement a PostgreSQL migration engine?** and show the evidence gap.
7. Open **Your progress**, inspect task-level results, expand a contribution brief, and show its source and verification steps. The tool has not changed the studied repository.
8. Reset the learning session to prepare for the next demonstration.

For a two-minute version, show the pinned snapshot, one walkthrough step, one incorrect/correct prediction, its evidence link, and the results page.

The browser journey test records the actual application into `test-results/**/video.webm`. A passing-run backup is saved as `docs/demo.webm` when available. The recording is automated verification footage, not a narrated presentation.

## Honest demonstration claims

The source is real, bundled and pinned. The task keys stay on the server and feedback is released after an attempt. Prepared material is source-checked by implementation agents, with independent human review pending. Citation validation checks references, not semantic truth. Live Gemini output requires a supplied credential and has not been exercised in this build. A participant study and held-out evaluation are pending.
