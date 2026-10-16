import "server-only";
import { z } from "zod";
import type { QaResponse, QuestionInput, LearningGoal, ContributionBrief } from "@/contracts";
import { learningGoalSchema } from "@/contracts";
import { AppError } from "@/lib/api";
import {
  getEvidence,
  getSnapshot,
  getSource,
  listSnapshots,
  listFiles,
} from "@/lib/repository";
import { getRecords, saveRecord, updateRecord, deleteRecord } from "@/lib/db";
import { sessionResults, publicLearning } from "@/lib/learning";
export interface StoredAnswer {
  question: string;
  context: QuestionInput;
  response: QaResponse;
  model: string | null;
  provider?: string | null;
}
export function storeAnswer(
  sessionId: string,
  input: QuestionInput,
  response: QaResponse,
) {
  const id = saveRecord(sessionId, input.snapshotId, "answer", {
    question: input.question,
    context: input,
    response,
    model: response.mode === "live" ? response.model ?? null : null,
    provider: response.mode === "live" ? response.provider ?? null : null,
  });
  return { ...response, answerId: id };
}
export function answerHistory(sessionId: string, snapshotId?: string) {
  const snapshot = getSnapshot(snapshotId);
  return getRecords<StoredAnswer>(sessionId, snapshot.snapshotId, "answer");
}
export function setGoal(
  sessionId: string,
  snapshotId: string,
  goal: LearningGoal,
) {
  getSnapshot(snapshotId);
  const id = getRecords(sessionId, snapshotId, "goal")[0]?.id;
  saveRecord(sessionId, snapshotId, "goal", { goal }, id);
  return { snapshotId, goal };
}
export function getGoal(
  sessionId: string,
  snapshotId: string,
): LearningGoal | undefined {
  return getRecords<{ goal: LearningGoal }>(sessionId, snapshotId, "goal").at(
    -1,
  )?.payload.goal;
}
export const goalInput = z
  .object({ snapshotId: z.string().min(1).max(120), goal: learningGoalSchema })
  .strict();
export function contributionPlan(
  sessionId: string,
  snapshotId?: string,
  requestedGoal?: LearningGoal,
) {
  const snapshot = getSnapshot(snapshotId),
    goal =
      requestedGoal ??
      getGoal(sessionId, snapshot.snapshotId) ??
      "documentation";
  const results = sessionResults(sessionId, snapshot.snapshotId);
  const recommendations = results.briefs
    .map((brief) => {
      const prerequisites = brief.informedByTaskIds
        .map((id) => results.tasks.find((task) => task.taskId === id)!)
        .filter(Boolean);
      const missing = prerequisites.filter(
        (task) =>
          !task.completed ||
          !task.firstAttemptCorrect ||
          task.hintsUsed > 0 ||
          !task.lastCorrect,
      );
      return {
        ...brief,
        goalMatch: goal === "documentation" ? "direct" : "partial",
        status: missing.length ? "review_prerequisites" : "ready_to_explore",
        remediationTaskIds: missing.map((task) => task.taskId),
        reason: missing.length
          ? "Revisit the listed concepts before drafting this contribution."
          : "The related practice tasks are complete; still review upstream guidance and ask a peer to check the proposal.",
        score:
          (goal === "architecture" && brief.id.includes("hook")
            ? 3
            : goal === "debug" && brief.id.includes("update")
              ? 3
              : goal === "documentation"
                ? 2
                : 0) +
          prerequisites.length -
          missing.length,
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return {
    snapshotId: snapshot.snapshotId,
    goal,
    recommendations,
    limitations: [
      ...(goal !== "documentation"
        ? [
            "The current verified catalog contains documentation briefs only. Test/debug tasks are not invented when upstream tests are absent.",
          ]
        : []),
      "Practice completion and self-assessment do not prove contribution readiness.",
    ],
  };
}
export const bookmarkSchema = z
  .object({
    snapshotId: z.string().min(1).max(120),
    title: z.string().trim().min(1).max(160),
    note: z.string().trim().max(3000).default(""),
    answerId: z.string().uuid().optional(),
    evidenceIds: z.array(z.string().min(1).max(200)).max(8).default([]),
    briefId: z.string().min(1).max(120).optional(),
  })
  .strict();
export function bookmark(sessionId: string, raw: unknown) {
  const input = bookmarkSchema.parse(raw);
  getSnapshot(input.snapshotId);
  const answer = input.answerId
    ? answerHistory(sessionId, input.snapshotId).find(
        (answer) => answer.id === input.answerId,
      )
    : undefined;
  if (input.answerId && !answer)
    throw new AppError(
      "ANSWER_NOT_FOUND",
      "This answer does not belong to this session and snapshot.",
      404,
    );
  for (const id of input.evidenceIds) getEvidence(id, input.snapshotId);
  const brief = input.briefId
    ? sessionResults(sessionId, input.snapshotId).briefs.find(
        (brief) => brief.id === input.briefId,
      )
    : undefined;
  if (input.briefId && !brief)
    throw new AppError(
      "BRIEF_NOT_FOUND",
      "This contribution brief does not exist in this snapshot.",
      404,
    );
  const id = saveRecord(sessionId, input.snapshotId, "bookmark", {
    ...input,
    savedAnswer: answer?.payload,
    brief,
    revision: 1,
  });
  return { id, ...input, revision: 1 };
}
export interface BookmarkPayload extends z.infer<typeof bookmarkSchema> {
  revision?: number;
  updatedAt?: string;
  savedAnswer?: StoredAnswer;
  brief?: ContributionBrief;
}
export const bookmarkListSchema = z.object({
  snapshotId: z.string().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
}).strict();
export const bookmarkSnapshotSchema = bookmarkListSchema.pick({ snapshotId: true });
export const bookmarkEditSchema = z.object({
  snapshotId: z.string().min(1).max(120),
  revision: z.number().int().positive(),
  title: z.string().trim().min(1).max(160).optional(),
  note: z.string().trim().max(3000).optional(),
}).strict().refine(input => input.title !== undefined || input.note !== undefined, { message: 'Edit the title or note.' });
export function readBookmark(sessionId: string, snapshotId: string, id: string) {
  getSnapshot(snapshotId);
  z.string().uuid().parse(id);
  const record = getRecords<BookmarkPayload>(sessionId, snapshotId, 'bookmark').find(item => item.id === id);
  if (!record) throw new AppError('BOOKMARK_NOT_FOUND', 'This bookmark does not belong to this session and snapshot.', 404);
  return { ...record, payload: { ...record.payload, revision: record.payload.revision ?? 1 } };
}
export function listBookmarks(sessionId: string, raw: unknown) {
  const input = bookmarkListSchema.parse(raw);
  getSnapshot(input.snapshotId);
  const records = getRecords<BookmarkPayload>(sessionId, input.snapshotId, 'bookmark');
  return {
    snapshotId: input.snapshotId,
    bookmarks: records.slice(input.offset, input.offset + input.limit).map(record => ({ ...record, payload: { ...record.payload, revision: record.payload.revision ?? 1 } })),
    total: records.length,
    nextOffset: input.offset + input.limit < records.length ? input.offset + input.limit : null,
  };
}
export function editBookmark(sessionId: string, id: string, raw: unknown) {
  const input = bookmarkEditSchema.parse(raw);
  const record = readBookmark(sessionId, input.snapshotId, id);
  const payload = { ...record.payload,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
    revision: input.revision + 1, updatedAt: new Date().toISOString(),
  };
  if (!updateRecord(sessionId, input.snapshotId, 'bookmark', id, payload, input.revision))
    throw new AppError('BOOKMARK_CONFLICT', 'This bookmark changed. Reload it before saving.', 409);
  return readBookmark(sessionId, input.snapshotId, id);
}
export function removeBookmark(sessionId: string, snapshotId: string, id: string) {
  readBookmark(sessionId, snapshotId, id);
  if (!deleteRecord(sessionId, snapshotId, 'bookmark', id))
    throw new AppError('BOOKMARK_NOT_FOUND', 'This bookmark does not belong to this session and snapshot.', 404);
  return { ok: true, id, snapshotId };
}
function sourceLink(evidenceId: string, snapshotId: string) {
  const snapshot = getSnapshot(snapshotId),
    evidence = getEvidence(evidenceId, snapshotId),
    source = getSource(evidence.fileId, snapshotId);
  return `[${source.file.path}:${evidence.startLine}–${evidence.endLine}](${snapshot.repositoryUrl}/blob/${snapshot.commitSha}/${source.file.path.split("/").map(encodeURIComponent).join("/")}#L${evidence.startLine}-L${evidence.endLine})`;
}
export function exportNotebook(
  sessionId: string,
  snapshotId?: string,
  againstSnapshotId?: string,
) {
  const snapshot = getSnapshot(snapshotId),
    against = againstSnapshotId ? getSnapshot(againstSnapshotId) : undefined;
  if (against && against.repositoryUrl !== snapshot.repositoryUrl)
    throw new AppError(
      "REPOSITORY_MISMATCH",
      "Notebook freshness compares the same repository only.",
      409,
    );
  const lines = [
    `# ${snapshot.name} learning notebook`,
    "",
    `Repository: ${snapshot.repositoryUrl}`,
    `Commit: ${snapshot.commitSha}`,
    "",
    "Notes preserve their original commit. Authored and AI-generated content is not independently verified.",
    "",
  ];
  for (const record of getRecords<{
    title: string;
    note: string;
    evidenceIds: string[];
    savedAnswer?: StoredAnswer;
    brief?: {
      title: string;
      suggestedChange: string;
      verificationSteps: string[];
      evidenceIds?: string[];
    };
  }>(sessionId, snapshot.snapshotId, "bookmark")) {
    const item = record.payload,
      ids = [
        ...new Set([
          ...item.evidenceIds,
          ...(item.savedAnswer?.response.citations.map((c) => c.evidenceId) ??
            []),
          ...(item.brief?.evidenceIds ?? (item.brief
            ? (sessionResults(sessionId, snapshot.snapshotId).briefs.find(
                (b) => b.title === item.brief!.title,
              )?.evidenceIds ?? [])
            : [])),
        ]),
      ];
    const changed =
      against &&
      ids.some((id) => {
        const evidence = getEvidence(id, snapshot.snapshotId),
          file = getSource(evidence.fileId, snapshot.snapshotId).file;
        return (
          listFiles(against.snapshotId).find((next) => next.path === file.path)
            ?.contentHash !== file.contentHash
        );
      });
    lines.push(
      `## ${item.title.replace(/[\r\n]/g, " ")}`,
      "",
      `Saved: ${record.createdAt}`,
      `Freshness: ${changed ? "needs review against " + against!.commitSha : against && !ids.length ? "unassessed — no cited source" : "original snapshot" + (against ? " — cited files unchanged" : "")}`,
      "",
      item.note,
      "",
    );
    if (item.savedAnswer)
      lines.push(
        `Question: ${item.savedAnswer.question}`,
        "",
        `Answer mode: ${item.savedAnswer.response.mode}; review: ${item.savedAnswer.response.reviewState ?? "unverified"}`,
        `Provider: ${item.savedAnswer.response.provider ?? item.savedAnswer.provider ?? 'not recorded'}; model: ${item.savedAnswer.response.model ?? item.savedAnswer.model ?? 'not recorded'}`,
        `Original context: ${JSON.stringify(item.savedAnswer.context)}`,
        "",
        item.savedAnswer.response.answer,
        "",
        ...item.savedAnswer.response.limitations.map(
          (text) => `- Limitation: ${text}`,
        ),
        "",
      );
    if (item.brief)
      lines.push(
        `Contribution: ${item.brief.title}`,
        "",
        item.brief.suggestedChange,
        "",
        ...item.brief.verificationSteps.map((text) => `- ${text}`),
        "",
      );
    lines.push(
      ...ids.map((id) => `- Source: ${sourceLink(id, snapshot.snapshotId)}`),
      "",
    );
  }
  const progress = getRecords<{ guideId: string; stepId: string }>(
    sessionId,
    snapshot.snapshotId,
    "progress",
  ).at(-1);
  if (progress)
    lines.push(
      "## Last saved walkthrough position",
      "",
      `${progress.payload.guideId} / ${progress.payload.stepId}`,
      "",
    );
  const results = sessionResults(sessionId, snapshot.snapshotId);
  lines.push(
    "## Practice summary",
    "",
    `Completed: ${results.completed}/${results.totalTasks}. Attempts: ${results.totalAttempts}. Hints: ${results.hintsUsed}.`,
    "",
    `Topics to revisit: ${results.topicsToRevisit.join(", ") || "None recorded."}`,
    "",
  );
  return lines.join("\n");
}
export const progressSchema = z
  .object({
    snapshotId: z.string().min(1).max(120),
    guideId: z.string().min(1).max(120),
    stepId: z.string().min(1).max(120),
  })
  .strict();
export function saveProgress(sessionId: string, raw: unknown) {
  const input = progressSchema.parse(raw),
    guide = publicLearning(input.snapshotId).guides.find(
      (guide) => guide.id === input.guideId,
    );
  if (!guide?.steps.some((step) => step.id === input.stepId))
    throw new AppError(
      "STEP_NOT_FOUND",
      "This walkthrough step does not exist in this snapshot.",
      404,
    );
  const id = getRecords(sessionId, input.snapshotId, "progress")[0]?.id;
  saveRecord(sessionId, input.snapshotId, "progress", input, id);
  return input;
}
