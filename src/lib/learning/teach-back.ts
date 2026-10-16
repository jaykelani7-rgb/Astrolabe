import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/api";
import { getTask, sessionResults } from "@/lib/learning";
import { getEvidence } from "@/lib/repository";
import { saveRecord } from "@/lib/db";
export const teachBackSchema = z
  .object({
    taskId: z.string().min(1).max(100),
    snapshotId: z.string().min(1).max(120),
    contentVersion: z.string().min(1).max(160),
    text: z.string().trim().min(10).max(2000),
  })
  .strict();
const concepts: Record<
  string,
  { id: string; prompt: string; followUpTaskId: string }[]
> = {
  "same-reference": [
    {
      id: "identity_guard",
      prompt:
        "Explain how Object.is compares the returned object with current state.",
      followUpTaskId: "same-reference",
    },
    {
      id: "guarded_notification",
      prompt: "Explain why listeners do or do not run when the guard is false.",
      followUpTaskId: "update-order",
    },
  ],
  "merge-change-point": [
    {
      id: "replace_choice",
      prompt: "Explain how replace and the next value determine replacement.",
      followUpTaskId: "merge-change-point",
    },
    {
      id: "shallow_merge",
      prompt: "Explain what Object.assign preserves and replaces.",
      followUpTaskId: "update-order",
    },
  ],
  "mitt-dispatch-order": [
    {
      id: "specific_before_wildcard",
      prompt:
        "Explain which dispatch block executes first and cite the statement order.",
      followUpTaskId: "mitt-dispatch-order",
    },
    {
      id: "copied_handlers",
      prompt: "Explain what slice does before handler iteration.",
      followUpTaskId: "mitt-remove-all",
    },
  ],
};
export function submitTeachBack(sessionId: string, raw: unknown) {
  const input = teachBackSchema.parse(raw),
    task = getTask(input.taskId, input.snapshotId);
  if (input.contentVersion !== task.contentVersion)
    throw new AppError(
      "CONTENT_VERSION_MISMATCH",
      "Reload this checkpoint before explaining it.",
      409,
    );
  if (
    !sessionResults(sessionId, input.snapshotId).tasks.find(
      (item) => item.taskId === task.id,
    )?.attempts
  )
    throw new AppError(
      "ATTEMPT_REQUIRED",
      "Make a prediction before submitting your explanation.",
      409,
    );
  const rubric = concepts[task.id];
  if (!rubric)
    throw new AppError(
      "TEACH_BACK_UNAVAILABLE",
      "This checkpoint has no reviewed teach-back rubric yet.",
      404,
    );
  // Free-text keyword matching cannot establish understanding. Return rubric-guided self review, not an invented score.
  const payload = {
    taskId: task.id,
    contentVersion: task.contentVersion,
    text: input.text,
    status: "needs_review",
    concepts: rubric.map((item) => ({ ...item, state: "unassessed" })),
    evidenceIds: task.contextEvidenceIds,
    reviewMethod: "human_or_self_review",
    limitations: [
      "Free-text explanations are not automatically graded. Compare each concept with the evidence and record your assessment.",
    ],
  };
  const id = saveRecord(sessionId, task.snapshotId, "teach_back", payload);
  return { id, ...payload };
}
export const teachBackReviewSchema = z
  .object({
    snapshotId: z.string().min(1).max(120),
    submissionId: z.string().uuid(),
    assessments: z
      .array(
        z
          .object({
            conceptId: z.string().min(1).max(100),
            state: z.enum(["understood", "missing", "uncertain"]),
          })
          .strict(),
      )
      .min(1)
      .max(6),
  })
  .strict();
export function rubricEvidence(taskId: string, snapshotId: string) {
  return getTask(taskId, snapshotId).contextEvidenceIds.map((id) =>
    getEvidence(id, snapshotId),
  );
}

import { getRecords } from "@/lib/db";
export function reviewTeachBack(sessionId: string, raw: unknown) {
  const input = teachBackReviewSchema.parse(raw);
  const record = getRecords<Omit<ReturnType<typeof submitTeachBack>, "id">>(
    sessionId,
    input.snapshotId,
    "teach_back",
  ).find((record) => record.id === input.submissionId);
  if (!record)
    throw new AppError(
      "SUBMISSION_NOT_FOUND",
      "This explanation does not belong to this session and snapshot.",
      404,
    );
  const original = record.payload;
  const rubric = concepts[original.taskId];
  if (
    input.assessments.length !== rubric.length ||
    new Set(input.assessments.map((item) => item.conceptId)).size !==
      rubric.length ||
    input.assessments.some(
      (item) => !rubric.some((concept) => concept.id === item.conceptId),
    )
  )
    throw new AppError(
      "INVALID_INPUT",
      "Assess every rubric concept exactly once.",
    );
  const assessed = rubric.map((concept) => ({
    ...concept,
    state: input.assessments.find((item) => item.conceptId === concept.id)!
      .state,
  }));
  const followUps = assessed
    .filter((item) => item.state !== "understood")
    .map((item) => ({
      conceptId: item.id,
      prompt: item.prompt,
      taskId: item.followUpTaskId,
      evidenceIds: original.evidenceIds,
    }));
  const payload = {
    ...original,
    status: "self_reviewed",
    concepts: assessed,
    followUps,
    reviewMethod: "learner_self_assessment",
    limitations: [
      "This is a recorded learner self-assessment, not independently verified mastery.",
    ],
  };
  saveRecord(
    sessionId,
    input.snapshotId,
    "teach_back",
    payload,
    input.submissionId,
  );
  return { id: input.submissionId, ...payload };
}
