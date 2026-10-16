# Demonstrate Astrolabe

Start with `npm ci`, `npm run setup`, and `npm run dev`, then open http://127.0.0.1:3000. Leave `GEMINI_API_KEY` blank to demonstrate prepared mode.

1. On **Overview**, show the purpose of Zustand, its MIT license and the pinned commit in the persistent repository header. Explain that this is one prepared, immutable source snapshot.
2. Choose **Explore source**. Open `src/vanilla.ts`, switch to **Module map**, and click a file. Edges represent static imports rather than runtime execution. Try **Focus editor**, then exit focus; panels can collapse or resize using the pointer or arrow keys on their separators.
3. In the mentor, choose **Current file** scope and ask **How does setState update state?**. Point out **Reviewed answer** and its original file/depth context. Click a readable citation; the source opens without losing the answer. **Clear selection** removes the highlight. Compare **Repository** scope, which does not restrict retrieval to the open file, with **Selected lines**, enabled only for a valid selection.
4. Open **Learn** or choose **Start learning** on Overview. Follow the state-update walkthrough. Change explanation depth deliberately; previous answers keep their original depth. At **Predict an unchanged reference**, choose **Make a prediction**. Submit an incorrect answer, inspect its evidence, and then retry with “No subscriber is called for this update.” Hints and retries remain recorded.
5. Select **Continue walkthrough**. The next step and its source open in the same flow. Revisit the solved checkpoint; its submitted answer and feedback are restored.
6. Open **My progress**. Distinguish locally visited steps from server-scored checkpoints solved, review attempt/hint context, and expand a **Prepared contribution brief**. These are fixed source-checked ideas, not dynamically generated recommendations.
7. Reset checkpoint results only if desired. The confirmation explains that the current session's attempts and hints are cleared; question history, visited steps, and layout preferences remain.

For a two-minute version, show the pinned snapshot, one contextual answer with a citation, one checkpoint, Continue walkthrough, and progress.

The latest actual automated browser journey is saved as `docs/demo.webm`. Screenshots at desktop, laptop and mobile sizes and the executed checks are recorded in `docs/REDESIGN-CHECKS.md`. The video is verification footage, not a narrated presentation.

Prepared material was source-checked by implementation agents; independent human review remains pending. Citation validation establishes reference integrity, not semantic truth. Live Gemini output requires a server credential, and a configured key does not establish provider availability. A live-provider evaluation, independent held-out review and participant study remain pending.
