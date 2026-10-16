import "server-only";
import type { Feedback, PublicTask, Results } from "@/contracts";
import { learningContent as zustandContent } from "../../../content/reviewed";
import { mittContent } from "../../../content/mitt";
import {
  getSnapshot,
  getEvidence,
  getSource,
  defaultSnapshotId,
} from "@/lib/repository";
import { CONTENT_VERSION } from "@/contracts";
import { registerContentDependency } from "@/lib/db";
import { AppError } from "@/lib/api";
import {
  getAttempts,
  getHintCount,
  recordHint,
  resetSession,
  saveAttempt,
} from "@/lib/db";

type Answer = string | string[] | { startLine: number; endLine: number };
type Rubric = {
  answer: Answer;
  hint: string;
  explanation: { beginner: string; developer: string };
};

// Deliberately server-only. Never return this map in a public task response.
const rubrics: Record<string, Rubric> = {
  "mitt-dispatch-order": {
    answer: "specific",
    hint: 'Compare all.get(type) and all.get("*") in source order.',
    explanation: {
      beginner:
        "Event-specific handlers run first. The wildcard block follows them.",
      developer:
        "emit obtains and invokes the type-specific array before obtaining and invoking the wildcard array. Each branch copies its array before iteration.",
    },
  },
  "mitt-remove-all": {
    answer: "clear",
    hint: "Read the else branch inside off.",
    explanation: {
      beginner:
        "Without a handler, off stores an empty array for that event type.",
      developer:
        "The handler-omitted branch calls all.set(type, []); it neither clears the whole Map nor removes the event key.",
    },
  },
  "same-reference": {
    answer: "skip",
    hint: "Find the condition surrounding both the assignment and the listener loop. Compare the object references, not their contents.",
    explanation: {
      beginner:
        "No subscriber runs. The updater returns the same object, so Object.is sees no change and the store skips the guarded block.",
      developer:
        "nextState is the current state reference. Object.is(nextState, state) is true, so the negated guard at line 73 is false. Neither assignment nor listeners.forEach executes. Mutating an object and returning the same reference is therefore not a notification mechanism here.",
    },
  },
  "update-order": {
    answer: ["compute", "compare", "write", "notify"],
    hint: "Start with the nextState declaration. The listener loop needs the final stored state and the captured previousState.",
    explanation: {
      beginner:
        "First calculate the next value. Then check whether it differs, save the old value and update the store, and finally tell the listeners.",
      developer:
        "Lines 69–72 compute nextState; line 73 gates the update with Object.is. Lines 74–78 capture previousState and replace or merge into state. Line 79 then invokes each listener with state and previousState. This is the source order for a changed update.",
    },
  },
  "merge-change-point": {
    answer: { startLine: 75, endLine: 78 },
    hint: "Find the assignment whose conditional uses replace, the next value’s type, and Object.assign. Include its left-hand side and both branches.",
    explanation: {
      beginner:
        "Lines 75–78 are the complete assignment. The condition chooses direct replacement or a new object made from the old state and the partial update.",
      developer:
        "The four-line state assignment uses replace when provided, otherwise defaults to replacement for a non-object or null nextState. A false replacement decision uses Object.assign({}, state, nextState), a shallow merge into a new object. The Object.is guard and listener loop are outside this requested change point.",
    },
  },
  "react-initial-snapshot": {
    answer: "initial",
    hint: "Look at the third argument of React.useSyncExternalStore, then follow the getter back to vanilla.ts.",
    explanation: {
      beginner:
        "The initial-snapshot callback applies the selector to api.getInitialState(). The current-snapshot callback uses getState() instead.",
      developer:
        "Line 33 supplies React’s third useSyncExternalStore argument as a memoized callback evaluating selector(api.getInitialState()). Vanilla getInitialState returns initialState, captured during store creation at line 95. The second callback reads current state. These lines establish the wiring, not React’s internal rendering behavior.",
    },
  },
};

function learningContent(snapshotId = defaultSnapshotId()) {
  getSnapshot(snapshotId);
  const content =
    snapshotId === defaultSnapshotId()
      ? zustandContent()
      : mittContent(snapshotId);
  const version =
    snapshotId === defaultSnapshotId()
      ? CONTENT_VERSION
      : `${snapshotId}-learning-v1`;
  content.tasks = content.tasks.map((task) => ({
    ...task,
    contentVersion: version,
  }));
  for (const guide of content.guides)
    registerContentDependency(
      `guide:${guide.id}`,
      snapshotId,
      "guide",
      guide.steps.flatMap((step) => step.evidenceIds),
    );
  for (const task of content.tasks)
    registerContentDependency(
      `task:${task.id}:${version}`,
      snapshotId,
      "task",
      task.contextEvidenceIds,
    );
  for (const brief of content.briefs)
    registerContentDependency(
      `brief:${brief.id}`,
      snapshotId,
      "brief",
      brief.evidenceIds,
    );
  return content;
}
export function publicLearning(snapshotId?: string) {
  const { guides, tasks } = learningContent(snapshotId);
  return { guides, tasks, reviewState: "authored", humanReview: "pending" };
}
export function getTask(id: string, snapshotId?: string): PublicTask {
  const task = learningContent(snapshotId).tasks.find(
    (entry) => entry.id === id,
  );
  if (!task)
    throw new AppError(
      "TASK_NOT_FOUND",
      "This checkpoint does not exist in this snapshot.",
      404,
    );
  return task;
}
function taskContext(task: PublicTask) {
  return { snapshotId: task.snapshotId, contentVersion: task.contentVersion! };
}

function scoreAnswer(task: PublicTask, answer: Answer): boolean {
  const expected = rubrics[task.id].answer;
  // A range's property order does not affect its meaning.
  if (task.type === "range") {
    const actual = answer as { startLine: number; endLine: number };
    const range = expected as { startLine: number; endLine: number };
    return (
      actual.startLine === range.startLine && actual.endLine === range.endLine
    );
  }
  return JSON.stringify(answer) === JSON.stringify(expected);
}

function validateAnswer(task: PublicTask, answer: Answer) {
  if (task.type === "choice") {
    if (
      typeof answer !== "string" ||
      !task.choices.some((choice) => choice.id === answer)
    )
      throw new AppError(
        "INVALID_ANSWER",
        "Choose one of the offered answers.",
      );
  } else if (task.type === "ordering") {
    if (
      !Array.isArray(answer) ||
      answer.length !== task.choices.length ||
      new Set(answer).size !== answer.length ||
      !answer.every((id) => task.choices.some((choice) => choice.id === id))
    )
      throw new AppError(
        "INVALID_ANSWER",
        "Order every offered step exactly once.",
      );
  } else if (
    typeof answer !== "object" ||
    Array.isArray(answer) ||
    !answer ||
    !Number.isInteger(answer.startLine) ||
    !Number.isInteger(answer.endLine) ||
    answer.startLine < 1 ||
    answer.endLine < answer.startLine ||
    answer.endLine >
      getSource(
        getEvidence(task.contextEvidenceIds[0], task.snapshotId).fileId,
        task.snapshotId,
      ).file.lineCount
  ) {
    throw new AppError(
      "INVALID_ANSWER",
      "Select an ordered range within this task’s source file.",
    );
  }
}

export function submitAttempt(
  sessionId: string,
  id: string,
  input: { snapshotId: string; answer: Answer; contentVersion?: string },
): Feedback {
  const task = getTask(id, input.snapshotId);
  if (input.contentVersion && input.contentVersion !== task.contentVersion)
    throw new AppError(
      "CONTENT_VERSION_MISMATCH",
      "Reload this task before submitting.",
      409,
    );
  if (input.snapshotId !== task.snapshotId)
    throw new AppError(
      "SNAPSHOT_MISMATCH",
      "This answer belongs to a different source snapshot.",
      409,
    );
  validateAnswer(task, input.answer);
  const rubric = rubrics[id];
  const correct =
    JSON.stringify(input.answer) === JSON.stringify(rubric.answer);
  // Object property order in a valid range must not affect scoring.
  const scored =
    task.type === "range"
      ? (input.answer as { startLine: number; endLine: number }).startLine ===
          (rubric.answer as { startLine: number }).startLine &&
        (input.answer as { startLine: number; endLine: number }).endLine ===
          (rubric.answer as { endLine: number }).endLine
      : correct;
  const hintsUsed = getHintCount(sessionId, id, taskContext(task));
  const saved = saveAttempt(
    sessionId,
    id,
    input.answer,
    scored,
    hintsUsed,
    taskContext(task),
  );
  return {
    ...taskContext(task),
    taskId: id,
    correct: scored,
    attemptNumber: saved.attemptNumber,
    hintsUsed,
    explanation: rubric.explanation,
    evidenceIds: task.contextEvidenceIds,
    submittedAnswer: input.answer,
  };
}

export interface TaskSessionProgress {
  snapshotId: string;
  contentVersion: string;
  feedback: Feedback | null;
  hintsUsed: number;
  hint?: string;
}

/** Restore only feedback that this signed session has already unlocked by attempting. */
export function taskSessionProgress(
  sessionId: string,
  taskId: string,
  snapshotId?: string,
  contentVersion?: string,
): TaskSessionProgress {
  const task = getTask(taskId, snapshotId);
  if (contentVersion !== undefined && contentVersion !== task.contentVersion)
    throw new AppError("CONTENT_VERSION_MISMATCH", "Reload this task before restoring progress.", 409);
  const hintsUsed = getHintCount(sessionId, taskId, taskContext(task));
  const progress: TaskSessionProgress = {
    ...taskContext(task),
    feedback: null,
    hintsUsed,
    ...(hintsUsed > 0 ? { hint: rubrics[taskId].hint } : {}),
  };
  const attempts = getAttempts(sessionId, taskContext(task))
    .filter((attempt) => attempt.taskId === taskId)
    .sort((a, b) => b.attemptNumber - a.attemptNumber);
  for (const attempt of attempts) {
    // Revalidate stored answers against the active pinned task before releasing any rubric text.
    try {
      validateAnswer(task, attempt.answer as Answer);
    } catch {
      continue;
    }
    progress.feedback = {
      ...taskContext(task),
      taskId,
      correct: scoreAnswer(task, attempt.answer as Answer),
      attemptNumber: attempt.attemptNumber,
      hintsUsed: attempt.hintsUsed,
      explanation: { ...rubrics[taskId].explanation },
      evidenceIds: [...task.contextEvidenceIds],
      submittedAnswer: structuredClone(attempt.answer),
    };
    break;
  }
  return progress;
}

export function requestHint(
  sessionId: string,
  id: string,
  snapshotId?: string,
  contentVersion?: string,
) {
  const task = getTask(id, snapshotId);
  if (contentVersion !== undefined && contentVersion !== task.contentVersion)
    throw new AppError("CONTENT_VERSION_MISMATCH", "Reload this task before requesting a hint.", 409);
  const hintsUsed = recordHint(sessionId, id, taskContext(task));
  return { ...taskContext(task), hint: rubrics[id].hint, hintsUsed };
}

export function sessionResults(
  sessionId: string,
  snapshotId?: string,
): Results {
  const { tasks, briefs } = learningContent(snapshotId);
  const attempts = getAttempts(sessionId, taskContext(tasks[0]));
  const results = tasks.map((task) => {
    const entries = attempts
      .filter((attempt) => attempt.taskId === task.id)
      .sort((a, b) => a.attemptNumber - b.attemptNumber);
    return {
      taskId: task.id,
      title: task.title,
      topic: task.topic,
      completed: entries.some((entry) => entry.correct),
      attempts: entries.length,
      firstAttemptCorrect: entries[0]?.correct ?? false,
      hintsUsed: getHintCount(sessionId, task.id, taskContext(task)),
      lastCorrect: entries.length ? entries[entries.length - 1].correct : null,
    };
  });
  return {
    completed: results.filter((task) => task.completed).length,
    totalTasks: tasks.length,
    firstAttemptCorrect: results.filter((task) => task.firstAttemptCorrect)
      .length,
    totalAttempts: attempts.length,
    hintsUsed: results.reduce((sum, task) => sum + task.hintsUsed, 0),
    tasks: results,
    topicsToRevisit: results
      .filter(
        (task) =>
          task.attempts > 0 &&
          (!task.firstAttemptCorrect ||
            task.hintsUsed > 0 ||
            !task.lastCorrect),
      )
      .map((task) => task.topic),
    briefs,
  };
}

export function clearSession(sessionId: string) {
  resetSession(sessionId);
  return { ok: true };
}
