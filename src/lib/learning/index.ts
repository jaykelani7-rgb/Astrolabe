import 'server-only';
import type { Feedback, PublicTask, Results } from '@/contracts';
import { learningContent } from '../../../content/reviewed';
import { AppError } from '@/lib/api';
import { getAttempts, getHintCount, recordHint, resetSession, saveAttempt } from '@/lib/db';

type Answer = string | string[] | { startLine: number; endLine: number };
type Rubric = { answer: Answer; hint: string; explanation: { beginner: string; developer: string } };

// Deliberately server-only. Never return this map in a public task response.
const rubrics: Record<string, Rubric> = {
  'same-reference': {
    answer: 'skip', hint: 'Find the condition surrounding both the assignment and the listener loop. Compare the object references, not their contents.',
    explanation: { beginner: 'No subscriber runs. The updater returns the same object, so Object.is sees no change and the store skips the guarded block.', developer: 'nextState is the current state reference. Object.is(nextState, state) is true, so the negated guard at line 73 is false. Neither assignment nor listeners.forEach executes. Mutating an object and returning the same reference is therefore not a notification mechanism here.' },
  },
  'update-order': {
    answer: ['compute', 'compare', 'write', 'notify'], hint: 'Start with the nextState declaration. The listener loop needs the final stored state and the captured previousState.',
    explanation: { beginner: 'First calculate the next value. Then check whether it differs, save the old value and update the store, and finally tell the listeners.', developer: 'Lines 69–72 compute nextState; line 73 gates the update with Object.is. Lines 74–78 capture previousState and replace or merge into state. Line 79 then invokes each listener with state and previousState. This is the source order for a changed update.' },
  },
  'merge-change-point': {
    answer: { startLine: 75, endLine: 78 }, hint: 'Find the assignment whose conditional uses replace, the next value’s type, and Object.assign. Include its left-hand side and both branches.',
    explanation: { beginner: 'Lines 75–78 are the complete assignment. The condition chooses direct replacement or a new object made from the old state and the partial update.', developer: 'The four-line state assignment uses replace when provided, otherwise defaults to replacement for a non-object or null nextState. A false replacement decision uses Object.assign({}, state, nextState), a shallow merge into a new object. The Object.is guard and listener loop are outside this requested change point.' },
  },
  'react-initial-snapshot': {
    answer: 'initial', hint: 'Look at the third argument of React.useSyncExternalStore, then follow the getter back to vanilla.ts.',
    explanation: { beginner: 'The initial-snapshot callback applies the selector to api.getInitialState(). The current-snapshot callback uses getState() instead.', developer: 'Line 33 supplies React’s third useSyncExternalStore argument as a memoized callback evaluating selector(api.getInitialState()). Vanilla getInitialState returns initialState, captured during store creation at line 95. The second callback reads current state. These lines establish the wiring, not React’s internal rendering behavior.' },
  },
};

export function publicLearning() { const { guides, tasks } = learningContent(); return { guides, tasks }; }
export function getTask(id: string): PublicTask {
  const task = learningContent().tasks.find((entry) => entry.id === id);
  if (!task) throw new AppError('TASK_NOT_FOUND', 'This checkpoint does not exist.', 404);
  return task;
}

function scoreAnswer(task: PublicTask, answer: Answer): boolean {
  const expected = rubrics[task.id].answer;
  // A range's property order does not affect its meaning.
  if (task.type === 'range') {
    const actual = answer as { startLine: number; endLine: number };
    const range = expected as { startLine: number; endLine: number };
    return actual.startLine === range.startLine && actual.endLine === range.endLine;
  }
  return JSON.stringify(answer) === JSON.stringify(expected);
}

function validateAnswer(task: PublicTask, answer: Answer) {
  if (task.type === 'choice') {
    if (typeof answer !== 'string' || !task.choices.some((choice) => choice.id === answer)) throw new AppError('INVALID_ANSWER', 'Choose one of the offered answers.');
  } else if (task.type === 'ordering') {
    if (!Array.isArray(answer) || answer.length !== task.choices.length || new Set(answer).size !== answer.length || !answer.every((id) => task.choices.some((choice) => choice.id === id))) throw new AppError('INVALID_ANSWER', 'Order every offered step exactly once.');
  } else if (typeof answer !== 'object' || Array.isArray(answer) || !answer || !Number.isInteger(answer.startLine) || !Number.isInteger(answer.endLine) || answer.startLine < 1 || answer.endLine < answer.startLine || answer.endLine > 100) {
    throw new AppError('INVALID_ANSWER', 'Select an ordered range within the 100-line vanilla source file.');
  }
}

export function submitAttempt(sessionId: string, id: string, input: { snapshotId: string; answer: Answer }): Feedback {
  const task = getTask(id);
  if (input.snapshotId !== task.snapshotId) throw new AppError('SNAPSHOT_MISMATCH', 'This answer belongs to a different source snapshot.', 409);
  validateAnswer(task, input.answer);
  const rubric = rubrics[id];
  const scored = scoreAnswer(task, input.answer);
  const hintsUsed = getHintCount(sessionId, id);
  const saved = saveAttempt(sessionId, id, input.answer, scored, hintsUsed);
  return { taskId: id, correct: scored, attemptNumber: saved.attemptNumber, hintsUsed, explanation: rubric.explanation, evidenceIds: task.contextEvidenceIds, submittedAnswer: input.answer };
}


export interface TaskSessionProgress { feedback: Feedback | null; hintsUsed: number; hint?: string }

/** Restore only feedback that this signed session has already unlocked by attempting. */
export function taskSessionProgress(sessionId: string, taskId: string): TaskSessionProgress {
  const task = getTask(taskId);
  const hintsUsed = getHintCount(sessionId, taskId);
  const progress: TaskSessionProgress = { feedback: null, hintsUsed, ...(hintsUsed > 0 ? { hint: rubrics[taskId].hint } : {}) };
  const attempts = getAttempts(sessionId).filter(attempt => attempt.taskId === taskId).sort((a, b) => b.attemptNumber - a.attemptNumber);
  for (const attempt of attempts) {
    // Revalidate stored answers against the active pinned task before releasing any rubric text.
    try { validateAnswer(task, attempt.answer as Answer); } catch { continue; }
    progress.feedback = {
      taskId, correct: scoreAnswer(task, attempt.answer as Answer), attemptNumber: attempt.attemptNumber,
      hintsUsed: attempt.hintsUsed, explanation: { ...rubrics[taskId].explanation },
      evidenceIds: [...task.contextEvidenceIds], submittedAnswer: structuredClone(attempt.answer),
    };
    break;
  }
  return progress;
}

export function requestHint(sessionId: string, id: string) {
  getTask(id);
  const hintsUsed = recordHint(sessionId, id);
  return { hint: rubrics[id].hint, hintsUsed };
}

export function sessionResults(sessionId: string): Results {
  const { tasks, briefs } = learningContent();
  const attempts = getAttempts(sessionId);
  const results = tasks.map((task) => {
    const entries = attempts.filter((attempt) => attempt.taskId === task.id).sort((a, b) => a.attemptNumber - b.attemptNumber);
    return { taskId: task.id, title: task.title, topic: task.topic, completed: entries.some((entry) => entry.correct), attempts: entries.length, firstAttemptCorrect: entries[0]?.correct ?? false, hintsUsed: getHintCount(sessionId, task.id), lastCorrect: entries.length ? entries[entries.length - 1].correct : null };
  });
  return {
    completed: results.filter((task) => task.completed).length, totalTasks: tasks.length,
    firstAttemptCorrect: results.filter((task) => task.firstAttemptCorrect).length,
    totalAttempts: attempts.length, hintsUsed: results.reduce((sum, task) => sum + task.hintsUsed, 0), tasks: results,
    topicsToRevisit: results.filter((task) => task.attempts > 0 && (!task.firstAttemptCorrect || task.hintsUsed > 0 || !task.lastCorrect)).map((task) => task.topic), briefs,
  };
}

export function clearSession(sessionId: string) { resetSession(sessionId); return { ok: true }; }
