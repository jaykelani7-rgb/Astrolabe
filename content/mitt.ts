import "server-only";
import type { ContributionBrief, Guide, PublicTask } from "@/contracts";
import {
  evidenceForRange,
  getSnapshot,
  getSource,
  listFiles,
} from "@/lib/repository";
export function mittContent(snapshotId: string): {
  guides: Guide[];
  tasks: PublicTask[];
  briefs: ContributionBrief[];
} {
  const snapshot = getSnapshot(snapshotId);
  if (snapshot.repositoryUrl !== "https://github.com/developit/mitt")
    throw new Error("No authored learning pack for this snapshot.");
  const file = listFiles(snapshotId).find(
    (file) => file.path === "src/index.ts",
  )!;
  const source = getSource(file.fileId, snapshotId);
  const begin =
    source.lines.findIndex((line) => line.includes("\t\temit<Key")) + 1;
  const evidenceId = evidenceForRange(
    file.fileId,
    begin,
    source.file.lineCount - 2,
    snapshotId,
  ).evidenceId;
  const onStart =
    source.lines.findIndex((line) => line.includes("\t\ton<Key")) + 1;
  const onEvidence = evidenceForRange(
    file.fileId,
    onStart,
    onStart + 8,
    snapshotId,
  ).evidenceId;
  const offStart =
    source.lines.findIndex((line) => line.includes("\t\toff<Key")) + 1;
  const offEvidence = evidenceForRange(
    file.fileId,
    offStart,
    offStart + 12,
    snapshotId,
  ).evidenceId;
  const contentVersion = `${snapshotId}-learning-v1`;
  return {
    guides: [
      {
        id: "mitt-dispatch",
        snapshotId,
        title: "From subscription to event dispatch",
        description:
          "Read registration, removal and wildcard dispatch in the pinned emitter.",
        duration: "4 min",
        steps: [
          {
            id: "mitt-register",
            title: "Register a handler",
            beginner: "on stores handlers by event type in a Map.",
            developer:
              "on appends to an existing handler array or creates one for the event key.",
            evidenceIds: [onEvidence],
          },
          {
            id: "mitt-predict-order",
            title: "Predict dispatch order",
            beginner:
              "Inspect the two dispatch blocks before predicting their order.",
            developer:
              "Compare the event-type branch with the wildcard branch; reason from statement order.",
            evidenceIds: [evidenceId],
            taskId: "mitt-dispatch-order",
          },
          {
            id: "mitt-predict-removal",
            title: "Predict removal without a handler",
            beginner:
              "Read the optional-handler branch before choosing what remains.",
            developer:
              "Distinguish removing one handler from replacing the event-key array.",
            evidenceIds: [offEvidence],
            taskId: "mitt-remove-all",
          },
        ],
      },
    ],
    tasks: [
      {
        id: "mitt-dispatch-order",
        snapshotId,
        contentVersion,
        title: "Which handlers run first?",
        prompt:
          "When both event-specific and wildcard handlers exist, which group does emit call first?",
        type: "choice",
        choices: [
          {
            id: "specific",
            label: "Event-specific handlers, then wildcard handlers.",
          },
          {
            id: "wildcard",
            label: "Wildcard handlers, then event-specific handlers.",
          },
          { id: "random", label: "The order is random." },
        ],
        contextEvidenceIds: [evidenceId],
        hintAvailable: true,
        guideId: "mitt-dispatch",
        topic: "Event dispatch order",
      },
      {
        id: "mitt-remove-all",
        snapshotId,
        contentVersion,
        title: "What does off without a handler remove?",
        prompt:
          "For a registered event type, what does off(type) do when handler is omitted?",
        type: "choice",
        choices: [
          {
            id: "clear",
            label:
              "Replace that event type’s handler array with an empty array.",
          },
          { id: "everything", label: "Delete every event type from the Map." },
          { id: "nothing", label: "Leave the handlers unchanged." },
        ],
        contextEvidenceIds: [offEvidence],
        hintAvailable: true,
        guideId: "mitt-dispatch",
        topic: "Subscription cleanup",
      },
    ],
    briefs: [
      {
        id: "mitt-document-lifecycle",
        title: "Document a subscription lifecycle",
        goal: "Write a short source-linked note about on, emit and off.",
        prerequisites: [
          "Explain event-specific versus wildcard dispatch.",
          "Explain removal with and without a handler.",
        ],
        evidenceIds: [onEvidence, offEvidence, evidenceId],
        suggestedChange:
          "Draft an example note covering registration, emit order and cleanup. Check current upstream contribution guidance before proposing it.",
        verificationSteps: [
          "Trace event-specific and wildcard handler order against this commit.",
          "Explain the optional-handler branch without claiming Map deletion.",
          "Ask a peer to review the source links.",
        ],
        informedByTaskIds: ["mitt-dispatch-order", "mitt-remove-all"],
      },
    ],
  };
}
