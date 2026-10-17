import "server-only";
import type { ArchitectureOverview } from "@/contracts";
import {
  evidenceForRange,
  getMap,
  getSnapshot,
  getSource,
  listFiles,
  listPublicApis,
} from "@/lib/repository";
import { registerContentDependency } from "@/lib/db";
export function architectureOverview(snapshotId?: string): ArchitectureOverview {
  const snapshot = getSnapshot(snapshotId);
  const files = listFiles(snapshot.snapshotId);
  const definitions =
    snapshot.repositoryUrl === "https://github.com/pmndrs/zustand"
      ? [
          {
            id: "store",
            name: "Vanilla store",
            path: "src/vanilla.ts",
            description:
              "Holds state, applies updates and maintains subscriptions.",
            anchors: [
              "const createStoreImpl",
              "const setState",
              "const subscribe",
            ],
          },
          {
            id: "react",
            name: "React bindings",
            path: "src/react.ts",
            description:
              "Connects a vanilla store and selectors to React snapshot callbacks.",
            anchors: ["export function useStore", "const createImpl"],
          },
          {
            id: "middleware",
            name: "Middleware entry points",
            path: "src/middleware.ts",
            description:
              "Re-exports middleware integrations; follow each import for its implementation.",
            anchors: ["export"],
          },
          {
            id: "shallow",
            name: "Shallow comparison",
            path: "src/vanilla/shallow.ts",
            description:
              "Compares identity, object prototypes and supported entries at one level.",
            anchors: ["export function shallow"],
          },
        ]
      : [
          {
            id: "emitter",
            name: "Event emitter",
            path: "src/index.ts",
            description:
              "Registers and removes event handlers, then dispatches specific and wildcard events.",
            anchors: [
              "export default function mitt",
              "\t\ton<Key",
              "\t\toff<Key",
              "\t\temit<Key",
            ],
          },
        ];
  const modules = definitions.flatMap((definition) => {
    const file = files.find((file) => file.path === definition.path);
    if (!file) return [];
    const document = getSource(file.fileId, snapshot.snapshotId);
    const evidenceIds = definition.anchors.flatMap((anchor) => {
      const index = document.lines.findIndex((line) => line.includes(anchor));
      return index < 0
        ? []
        : [
            evidenceForRange(
              file.fileId,
              index + 1,
              Math.min(index + 36, file.lineCount),
              snapshot.snapshotId,
            ).evidenceId,
          ];
    });
    return [
      {
        ...definition,
        fileId: file.fileId,
        evidenceIds,
        publicApis: listPublicApis(file.fileId, snapshot.snapshotId),
        reviewState: "authored" as const,
      },
    ];
  });
  const map = getMap(snapshot.snapshotId);
  registerContentDependency(
    "architecture",
    snapshot.snapshotId,
    "architecture",
    modules.flatMap((module) => module.evidenceIds),
  );
  return {
    snapshotId: snapshot.snapshotId,
    commitSha: snapshot.commitSha,
    reviewState: "authored",
    humanReview: "pending",
    modules,
    readingOrder: modules.map((module) => module.id),
    relationships: map.edges,
    unresolved: map.unresolved,
    limitations: [
      "Relationships are static imports/re-exports, not a runtime call graph.",
      "Subsystem descriptions are authored and source-linked; independent human review is pending.",
    ],
  };
}
