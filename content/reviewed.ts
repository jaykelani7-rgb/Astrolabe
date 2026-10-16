import 'server-only';
import type { ContributionBrief, Guide, PublicTask } from '@/contracts';
import { evidenceForRange, getSnapshot, listFiles } from '@/lib/repository';

/** Source-checked against the pinned files. Independent human review is pending. */
function evidence(path: string, start: number, end: number): string {
  const file = listFiles().find((entry) => entry.path === path);
  if (!file) throw new Error(`Reviewed source file is missing: ${path}`);
  return evidenceForRange(file.fileId, start, end).evidenceId;
}

export function learningContent(): { guides: Guide[]; tasks: PublicTask[]; briefs: ContributionBrief[] } {
  const snapshotId = getSnapshot().snapshotId;
  const vanilla = (start: number, end: number) => evidence('src/vanilla.ts', start, end);
  const react = (start: number, end: number) => evidence('src/react.ts', start, end);
  const tasks: PublicTask[] = [
    {
      id: 'same-reference', snapshotId, title: 'Will subscribers hear this?', type: 'choice',
      prompt: 'A vanilla store holds an object. You call setState((state) => state), returning that exact object. What happens to its subscribers?',
      choices: [
        { id: 'notify', label: 'Every subscriber is called with the same object twice.' },
        { id: 'skip', label: 'No subscriber is called for this update.' },
        { id: 'throw', label: 'The store throws because an updater must return a new object.' },
      ], contextEvidenceIds: [vanilla(66, 81)], hintAvailable: true, guideId: 'state-to-subscribers', topic: 'Identity and notifications',
    },
    {
      id: 'update-order', snapshotId, title: 'Put the update in order', type: 'ordering',
      prompt: 'For an update that passes the equality check, order these operations as they occur in setState. Use the arrows to move each step.',
      choices: [
        { id: 'notify', label: 'Notify listeners with the new and previous state.' },
        { id: 'write', label: 'Capture the previous state, then assign the merged or replaced state.' },
        { id: 'compute', label: 'Compute nextState from the value or updater function.' },
        { id: 'compare', label: 'Compare nextState and the current state with Object.is.' },
      ], contextEvidenceIds: [vanilla(69, 79)], hintAvailable: true, guideId: 'state-to-subscribers', topic: 'Update sequencing',
    },
    {
      id: 'merge-change-point', snapshotId, title: 'Find the merge decision', type: 'range',
      prompt: 'In src/vanilla.ts, select the complete four-line state-assignment block that decides whether to replace the state or shallow-merge an object update. Select only that block, then submit its line range.',
      choices: [], contextEvidenceIds: [vanilla(66, 81)], hintAvailable: true, guideId: 'state-to-subscribers', topic: 'Merge versus replacement',
    },
    {
      id: 'react-initial-snapshot', snapshotId, title: 'Which snapshot reaches React?', type: 'choice',
      prompt: 'In useStore, which expression supplies the selected initial snapshot through the third argument of useSyncExternalStore?',
      choices: [
        { id: 'current', label: 'selector(api.getState())' },
        { id: 'initial', label: 'selector(api.getInitialState())' },
        { id: 'subscription', label: 'api.subscribe(selector)' },
      ], contextEvidenceIds: [react(26, 37), vanilla(83, 96)], hintAvailable: true, guideId: 'store-to-react', topic: 'React snapshot selection',
    },
  ];
  const guides: Guide[] = [
    {
      id: 'state-to-subscribers', snapshotId, title: 'From state update to subscribers', duration: '6 min',
      description: 'Follow one vanilla store update: identity, assignment, and notification.',
      steps: [
        { id: 'store-closure', title: 'A small store, held in a closure', beginner: 'The store keeps its current value and a collection of listeners together. Its API gives callers controlled access to those values.', developer: 'createStoreImpl closes over a mutable state binding and a Set of Listener functions; the public API is assembled below in the same closure.', evidenceIds: [vanilla(60, 64), vanilla(94, 96)] },
        { id: 'predict-identity', title: 'Predict an unchanged reference', beginner: 'An update can be a value or a function of the existing state. Inspect the guard before predicting whether listeners will run.', developer: 'Trace nextState evaluation and the guard around the assignment/notification block. Submit a prediction before opening the detailed feedback.', evidenceIds: [vanilla(66, 81)], taskId: 'same-reference' },
        { id: 'predict-sequence', title: 'Trace the successful update', beginner: 'The update needs both the old value and the new value. Read the statements in source order, then arrange the operations.', developer: 'Follow the changed-state branch from nextState through previousState capture, assignment, and listener invocation.', evidenceIds: [vanilla(69, 79)], taskId: 'update-order' },
        { id: 'find-change-point', title: 'Find a bounded change point', beginner: 'Look for the expression that chooses how the new value becomes the stored value. Select its whole assignment block.', developer: 'Locate the state assignment and its replacement-versus-merge conditional. This checkpoint asks for an exact, minimal source range.', evidenceIds: [vanilla(66, 81)], taskId: 'merge-change-point' },
        { id: 'subscription-lifetime', title: 'Subscribe, then clean up', beginner: 'A listener is added to the collection. The returned function removes that listener, so a caller can stop receiving updates.', developer: 'subscribe adds the function to the Set and returns a closure that deletes that same function. getState reads the current binding; getInitialState reads the captured initialState.', evidenceIds: [vanilla(83, 96)] },
      ],
    },
    {
      id: 'store-to-react', snapshotId, title: 'From a store to a React selection', duration: '4 min',
      description: 'See how the React hook connects a vanilla store and a selector.',
      steps: [
        { id: 'react-import', title: 'Reuse the vanilla store', beginner: 'The React entry imports createStore from the vanilla module. The module map shows this static import relationship.', developer: 'react.ts imports the runtime createStore plus vanilla type definitions. These import edges describe source dependencies; they are not a runtime trace.', evidenceIds: [react(1, 9)] },
        { id: 'bound-hook', title: 'Bind an API to a hook', beginner: 'createImpl builds a store, then makes a function that passes that store and an optional selector to useStore. Store methods are also copied onto that function.', developer: 'The closure useBoundStore delegates to useStore(api, selector). Object.assign exposes the store API on the bound hook function.', evidenceIds: [react(53, 61)] },
        { id: 'predict-snapshot', title: 'Predict the initial snapshot', beginner: 'useStore gives React a subscription and two ways to read a selected value. Inspect the three arguments before choosing the initial-snapshot expression.', developer: 'Inspect the useSyncExternalStore call and distinguish the selected current snapshot from the selected initial snapshot. The source shows the callbacks; it does not contain React internals.', evidenceIds: [react(26, 37), vanilla(83, 96)], taskId: 'react-initial-snapshot' },
        { id: 'selected-value', title: 'Return the selected value', beginner: 'The selector turns a store value into the part the caller wants. useStore returns that selected value and gives React a debug value for it.', developer: 'Both snapshot callbacks apply selector, with api and selector as callback dependencies. The resulting slice is passed to useDebugValue and returned.', evidenceIds: [react(26, 37)] },
      ],
    },
  ];
  const briefs: ContributionBrief[] = [
    {
      id: 'document-update-edges', title: 'Document two update edge cases',
      goal: 'Draft a small documentation example that explains unchanged references and object merging.',
      prerequisites: ['Read setState and subscribe in src/vanilla.ts.', 'Explain the difference between identity comparison and shallow merging.'],
      evidenceIds: [vanilla(66, 81), vanilla(88, 92)],
      suggestedChange: 'Prepare a documentation-only example showing setState((state) => state), then a partial object update with replace omitted. Describe subscriber behavior and which existing object keys remain. Check the upstream contribution guide before proposing a location.',
      verificationSteps: ['Trace both examples against the pinned source and record expected notifications.', 'For the partial update, list the keys before and after Object.assign.', 'Ask a maintainer or peer to review the explanation before opening a contribution.'],
      informedByTaskIds: ['same-reference', 'update-order', 'merge-change-point'],
    },
    {
      id: 'document-hook-bridge', title: 'Explain the React hook bridge',
      goal: 'Draft a focused source-reading note for the bound hook and its snapshot callbacks.',
      prerequisites: ['Read useStore and createImpl in src/react.ts.', 'Distinguish getState from the captured getInitialState.'],
      evidenceIds: [react(26, 37), react(53, 61), vanilla(83, 96)],
      suggestedChange: 'Prepare a short explanation tracing createStore → useBoundStore → useStore. Include a table naming the subscription, current snapshot, and initial snapshot callbacks. Keep claims about rendering or hydration within what React documentation and tests can support.',
      verificationSteps: ['Check each callback against the exact pinned lines.', 'Explain that the selector is applied in both snapshot callbacks.', 'Review the current upstream contribution guide and ask a peer to verify the note.'],
      informedByTaskIds: ['react-initial-snapshot'],
    },
  ];
  return { guides, tasks, briefs };
}
