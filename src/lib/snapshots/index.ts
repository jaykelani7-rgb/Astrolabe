import "server-only";
import { AppError } from "@/lib/api";
import { getSnapshot, listFiles, getEvidence } from "@/lib/repository";
import { contentDependencies } from "@/lib/db";
import { publicLearning } from "@/lib/learning";
import { architectureOverview } from "@/lib/architecture";
export function compareSnapshots(fromSnapshotId: string, toSnapshotId: string) {
  const from = getSnapshot(fromSnapshotId),
    to = getSnapshot(toSnapshotId);
  if (from.repositoryUrl !== to.repositoryUrl)
    throw new AppError(
      "REPOSITORY_MISMATCH",
      "Compare snapshots of the same repository.",
      409,
    );
  const before = new Map(
    listFiles(from.snapshotId).map((file) => [file.path, file]),
  );
  const after = new Map(
    listFiles(to.snapshotId).map((file) => [file.path, file]),
  );
  const changes = [...new Set([...before.keys(), ...after.keys()])].flatMap(
    (path) => {
      const old = before.get(path),
        next = after.get(path);
      if (old?.contentHash === next?.contentHash) return [];
      return [
        {
          path,
          kind: !old ? "added" : !next ? "deleted" : "modified",
          beforeHash: old?.contentHash ?? null,
          afterHash: next?.contentHash ?? null,
        },
      ];
    },
  );
  publicLearning(from.snapshotId);
  architectureOverview(from.snapshotId);
  const changed = new Set(changes.map((change) => change.path));
  const content = contentDependencies(from.snapshotId).map((item) => {
    const affectedPaths = [
      ...new Set(
        item.evidenceIds
          .map((id) => getEvidence(id, from.snapshotId))
          .filter((e) =>
            changed.has(
              [...before.values()].find((file) => file.fileId === e.fileId)!
                .path,
            ),
          )
          .map(
            (e) =>
              [...before.values()].find((file) => file.fileId === e.fileId)!
                .path,
          ),
      ),
    ];
    return {
      contentId: item.contentId,
      kind: item.kind,
      state: affectedPaths.length ? "needs_review" : "current",
      affectedPaths,
      reviewState: item.reviewState,
    };
  });
  return {
    fromSnapshotId: from.snapshotId,
    toSnapshotId: to.snapshotId,
    changes,
    content,
    limitations: [
      "Any change to a cited file conservatively marks dependent material for review, including formatting-only changes.",
      "Historical evidence remains attached to the original commit. No line remapping or automatic semantic approval occurs.",
    ],
  };
}
