import 'server-only';
import type { Evidence, QuestionInput, QaResponse } from '@/contracts';
import type { EvidenceRepository } from '@/lib/retrieval';
import { validateEvidence } from '@/lib/retrieval';

type PreparedAnswer = {
  aliases: string[];
  targets: { path: string; startLine: number; endLine: number }[];
  requiredText: string[];
  beginner: string;
  developer: string;
};

function normalize(question: string) {
  return question.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// These authored explanations refer only to this pinned snapshot. Independent human review remains pending.
const PREPARED_SNAPSHOT = 'zustand-0ea8be27db13';
const preparedAnswers: PreparedAnswer[] = [
  {
    aliases: ['How does setState update state?', 'How does setState work?', 'What happens when I call setState?'],
    targets: [{ path: 'src/vanilla.ts', startLine: 66, endLine: 81 }],
    requiredText: ['Object.is(nextState, state)', 'Object.assign({}, state, nextState)', 'listener(state, previousState)'],
    beginner: 'setState first works out the proposed next value. A function receives the current state; a value is used directly. If Object.is says it is the same value as the current state, the function stops. Otherwise, it either replaces the state or copies the existing object and merges the new fields, then tells every subscribed listener the new and previous states. The comparison is against the proposed value before merging, so a new object can notify listeners even if its fields look unchanged.',
    developer: 'setState resolves a functional partial with the current state, then gates the update with !Object.is(nextState, state). On a change it captures previousState, chooses replacement via replace ?? (typeof nextState !== "object" || nextState === null), or shallow-merges with Object.assign({}, state, nextState). The listener Set is iterated synchronously after assignment with (state, previousState). Equality is checked on the proposed partial before the merge; it is not a deep equality check.',
  },
  {
    aliases: ['How do I unsubscribe?', 'How does subscribe cleanup work?', 'What does subscribe return?'],
    targets: [{ path: 'src/vanilla.ts', startLine: 60, endLine: 64 }, { path: 'src/vanilla.ts', startLine: 88, endLine: 92 }],
    requiredText: ['new Set()', 'listeners.add(listener)', 'return () => listeners.delete(listener)'],
    beginner: 'subscribe adds your listener to a Set, a collection that keeps each listener once. It returns a function. Calling that returned function removes the same listener from the Set, so later store updates no longer call it. Keep the returned function and call it when you no longer need the subscription.',
    developer: 'subscribe closes over the provided listener, inserts it with listeners.add(listener), and returns () => listeners.delete(listener). Cleanup removes that listener identity from the same Set used for notifications. The returned function performs the deletion when invoked; subscribe itself does not remove the listener.',
  },
  {
    aliases: ['How does useStore use a selector?', 'How does React read the store?', 'How does useStore connect to React?'],
    targets: [{ path: 'src/react.ts', startLine: 16, endLine: 37 }],
    requiredText: ['const identity = <T>(arg: T): T => arg', 'React.useSyncExternalStore(', 'selector(api.getState())', 'selector(api.getInitialState())'],
    beginner: 'useStore gives React the store subscription and two ways to read a selected value. For the current snapshot it calls your selector with api.getState(). For the server snapshot it calls the same selector with api.getInitialState(). Without a selector, the default identity function returns the whole state. React.useSyncExternalStore returns the selected value, which useStore returns to the component.',
    developer: 'useStore delegates to React.useSyncExternalStore(api.subscribe, getSnapshot, getServerSnapshot). Both snapshot readers are React.useCallback closures depending on [api, selector]: the client reader selects api.getState(), and the server reader selects api.getInitialState(). The default selector is identity. This source establishes the wiring; it does not by itself establish every detail of React scheduling or render behavior.',
  },
  {
    aliases: ['What is getInitialState?', 'How is the initial state stored?', 'How does getInitialState differ from getState?'],
    targets: [{ path: 'src/vanilla.ts', startLine: 83, endLine: 96 }, { path: 'src/react.ts', startLine: 30, endLine: 34 }],
    requiredText: ['() => state', 'initialState', 'state = createState(setState, getState, api)', 'selector(api.getInitialState())'],
    beginner: 'getState reads the current state variable. During store creation, the value returned by createState is assigned both to state and to the initialState constant. getInitialState returns that captured initial value. Later setState calls assign a new current state, while the initial reference remains the one captured at creation. This is a saved reference, not a deep copy. The React hook uses a selected value from getInitialState for its server snapshot reader.',
    developer: 'getState closes over mutable state; getInitialState closes over the initialState constant. Initialization uses const initialState = (state = createState(setState, getState, api)), so both begin with the same reference. Subsequent state reassignment does not reassign initialState. No cloning or freezing occurs in this range, so direct mutation of the initial object is not prevented here. useStore supplies selector(api.getInitialState()) as useSyncExternalStore’s server snapshot callback.',
  },
];

export function reviewedAnswer(input: QuestionInput, store: EvidenceRepository, walkthroughEvidence?: Evidence[]): QaResponse | undefined {
  if (input.snapshotId !== PREPARED_SNAPSHOT) return undefined;
  const prepared = preparedAnswers.find((item) => item.aliases.some((alias) => normalize(alias) === normalize(input.question)));
  if (!prepared) return undefined;
  const files = store.listFiles();
  // Every claim in a prepared explanation needs its full target, not a partial overlap.
  // Check the chosen scope before creating or reading any prepared citation records.
  if (!prepared.targets.every((target) => {
    const file = files.find((candidate) => candidate.path === target.path);
    if (!file || file.snapshotId !== input.snapshotId) return false;
    if (input.fileId && (file.fileId !== input.fileId || (input.startLine !== undefined
      && input.endLine !== undefined && (target.startLine < input.startLine || target.endLine > input.endLine)))) return false;
    return !walkthroughEvidence || walkthroughEvidence.some((range) => range.snapshotId === input.snapshotId
      && range.fileId === file.fileId && range.contentHash === file.contentHash
      && range.startLine <= target.startLine && range.endLine >= target.endLine);
  })) return undefined;
  const citations: Evidence[] = [];
  for (const target of prepared.targets) {
    const file = files.find((candidate) => candidate.path === target.path);
    if (!file) return undefined;
    citations.push(validateEvidence(store.evidenceForRange(file.fileId, target.startLine, target.endLine, input.snapshotId), input.snapshotId, store));
  }
  if (!prepared.requiredText.every((text) => citations.some((citation) => citation.text.includes(text)))) return undefined;
  return {
    status: 'answered', mode: 'reviewed',
    answer: input.depth === 'developer' ? prepared.developer : prepared.beginner,
    citations,
    limitations: ['Prepared explanation checked against the pinned source during implementation; independent human claim review is pending.', 'This is authored prepared content, not a live AI response.'],
  };
}
