import { z } from "zod";

export type Depth = "beginner" | "developer";
export interface Snapshot {
  snapshotId: string;
  name: string;
  repositoryUrl: string;
  commitSha: string;
  license: string;
  language: string;
  preparedAt: string;
  status: "ready";
  description: string;
}
export interface SourceFile {
  fileId: string;
  snapshotId: string;
  path: string;
  language: string;
  lineCount: number;
  contentHash: string;
}
export interface SourceDocument {
  file: SourceFile;
  content: string;
  lines: string[];
}
export interface Evidence {
  evidenceId: string;
  snapshotId: string;
  fileId: string;
  startLine: number;
  endLine: number;
  contentHash: string;
  text: string;
}
export interface ModuleMap {
  nodes: {
    id: string;
    fileId: string;
    label: string;
    kind: "core" | "middleware" | "entry";
  }[];
  edges: {
    id: string;
    from: string;
    to: string;
    kind: "import";
    typeOnly: boolean;
  }[];
  unresolved: { from: string; specifier: string; reason: string }[];
}
export interface GuideStep {
  id: string;
  title: string;
  beginner: string;
  developer: string;
  evidenceIds: string[];
  taskId?: string;
}
export interface Guide {
  id: string;
  snapshotId: string;
  title: string;
  description: string;
  duration: string;
  steps: GuideStep[];
}
export interface PublicTask {
  contentVersion?: string;
  id: string;
  snapshotId: string;
  title: string;
  prompt: string;
  type: "choice" | "ordering" | "range";
  choices: { id: string; label: string }[];
  contextEvidenceIds: string[];
  hintAvailable: boolean;
  guideId: string;
  topic: string;
}
export interface AttemptRecord {
  snapshotId?: string;
  contentVersion?: string;
  id: string;
  sessionId: string;
  taskId: string;
  answer: unknown;
  correct: boolean;
  attemptNumber: number;
  hintsUsed: number;
  createdAt: string;
}
export interface Feedback {
  snapshotId?: string;
  contentVersion?: string;
  taskId: string;
  correct: boolean;
  attemptNumber: number;
  hintsUsed: number;
  explanation: { beginner: string; developer: string };
  evidenceIds: string[];
  submittedAnswer: unknown;
}
export interface ContributionBrief {
  id: string;
  title: string;
  goal: string;
  prerequisites: string[];
  evidenceIds: string[];
  suggestedChange: string;
  verificationSteps: string[];
  informedByTaskIds: string[];
}
export interface TaskResult {
  taskId: string;
  title: string;
  topic: string;
  completed: boolean;
  attempts: number;
  firstAttemptCorrect: boolean;
  hintsUsed: number;
  lastCorrect: boolean | null;
}
export interface Results {
  completed: number;
  totalTasks: number;
  firstAttemptCorrect: number;
  totalAttempts: number;
  hintsUsed: number;
  tasks: TaskResult[];
  topicsToRevisit: string[];
  briefs: ContributionBrief[];
}
export interface QuestionInput {
  scope?: "selection" | "file" | "repository" | "walkthrough";
  question: string;
  snapshotId: string;
  fileId?: string;
  startLine?: number;
  endLine?: number;
  depth?: Depth;
  guideId?: string;
  stepId?: string;
}
export interface WalkthroughContext {
  guideId: string;
  title: string;
  stepId?: string;
  stepTitle?: string;
}
export interface QaResponse {
  provider?: string;
  model?: string;
  answerId?: string;
  blocks?: AnswerBlock[];
  reviewState?: "authored" | "generated" | "human_reviewed";
  status: "answered" | "evidence_gap" | "unavailable";
  mode: "live" | "reviewed";
  answer: string;
  citations: Evidence[];
  limitations: string[];
  cached?: boolean;
}
export interface ErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
}
export const rangeSchema = z
  .object({
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  })
  .refine((v) => v.endLine >= v.startLine, {
    message: "End line must follow start line.",
  });
export const attemptSchema = z
  .object({
    snapshotId: z.string().min(1).max(120),
    contentVersion: z.string().min(1).max(160).optional(),
    answer: z.union([
      z.string().min(1).max(200),
      z.array(z.string().min(1).max(200)).max(12),
      rangeSchema,
    ]),
  })
  .strict();
export const questionSchema = z
  .object({
    question: z.string().trim().min(3).max(1000),
    snapshotId: z.string().min(1).max(120),
    fileId: z.string().min(1).max(160).optional(),
    startLine: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
    depth: z.enum(["beginner", "developer"]).optional(),
    guideId: z.string().min(1).max(120).optional(),
    stepId: z.string().min(1).max(120).optional(),
    scope: z
      .enum(["selection", "file", "repository", "walkthrough"])
      .optional(),
  })
  .strict()
  .refine((v) => (v.startLine === undefined) === (v.endLine === undefined), {
    message: "Provide both range boundaries.",
  })
  .refine((v) => !v.startLine || (!!v.fileId && v.endLine! >= v.startLine), {
    message: "A valid file and ordered lines are required.",
  })
  .refine((v) => v.scope !== "file" || !!v.fileId, {
    message: "File scope requires a file.",
  })
  .refine(
    (v) =>
      v.scope !== "selection" ||
      (!!v.fileId && v.startLine !== undefined && v.endLine !== undefined),
    {
      message: "Selection scope requires a file and both line boundaries.",
    },
  )
  .refine((v) => !v.stepId || !!v.guideId, {
    message: "A walkthrough is required for a step.",
  })
  .refine((v) => !v.guideId || (!v.fileId && v.startLine === undefined), {
    message: "Choose either source or walkthrough context.",
  })
  .refine((v) => !v.guideId || !v.scope || v.scope === "walkthrough", {
    message: "A walkthrough cannot use a conflicting source scope.",
  })
  .refine((v) => v.scope !== "walkthrough" || !!v.guideId, {
    message: "Walkthrough scope requires a guide.",
  });

export interface AnswerBlock {
  text: string;
  kind: "observed" | "inferred" | "unknown";
  evidenceIds: string[];
}
export const learningGoalSchema = z.enum([
  "architecture",
  "debug",
  "tests",
  "documentation",
]);
export type LearningGoal = z.infer<typeof learningGoalSchema>;
export const CONTENT_VERSION = "zustand-learning-v1";


export interface ArchitectureOverview {
  snapshotId: string;
  commitSha: string;
  reviewState: "authored";
  humanReview: "pending";
  modules: {
    id: string; name: string; path: string; description: string; fileId: string;
    evidenceIds: string[];
    publicApis: { name: string; startLine: number; endLine: number }[];
    reviewState: "authored";
  }[];
  readingOrder: string[];
  relationships: ModuleMap["edges"];
  unresolved: ModuleMap["unresolved"];
  limitations: string[];
}

export type TeachBackAssessment = "understood" | "missing" | "uncertain";
export interface TeachBackSubmission {
  id: string;
  taskId: string;
  snapshotId: string;
  contentVersion: string;
  text: string;
  status: "needs_review" | "self_reviewed";
  concepts: { id: string; prompt: string; followUpTaskId: string; state: TeachBackAssessment | "unassessed" }[];
  evidenceIds: string[];
  reviewMethod: "human_or_self_review" | "learner_self_assessment";
  limitations: string[];
  followUps?: { conceptId: string; prompt: string; taskId: string; evidenceIds: string[] }[];
}
export interface TeachBackProgress {
  taskId: string;
  snapshotId: string;
  contentVersion: string;
  available: boolean;
  submission: TeachBackSubmission | null;
}
