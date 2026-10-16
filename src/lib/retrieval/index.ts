import "server-only";
import type {
  Evidence,
  ModuleMap,
  QuestionInput,
  Snapshot,
  SourceDocument,
  SourceFile,
  WalkthroughContext,
} from "@/contracts";
import { questionSchema } from "@/contracts";
import { publicLearning } from "@/lib/learning";
import { AppError } from "@/lib/api";
import * as repository from "@/lib/repository";

export interface EvidenceRepository {
  getSnapshot(): Snapshot;
  getSource(fileId: string, snapshotId?: string): SourceDocument;
  getEvidence(evidenceId: string, snapshotId?: string): Evidence;
  evidenceForRange(
    fileId: string,
    startLine: number,
    endLine: number,
    snapshotId?: string,
  ): Evidence;
  searchEvidence(
    query: string,
    options?: { fileId?: string; limit?: number },
  ): Evidence[];
  listFiles(): SourceFile[];
  getMap?(): ModuleMap;
}
export const defaultRepository: EvidenceRepository = repository;
export function repositoryForSnapshot(snapshotId: string): EvidenceRepository {
  repository.getSnapshot(snapshotId);
  return {
    getSnapshot: () => repository.getSnapshot(snapshotId),
    listFiles: () => repository.listFiles(snapshotId),
    getSource: (id, requested = snapshotId) =>
      repository.getSource(id, requested),
    getEvidence: (id, requested = snapshotId) =>
      repository.getEvidence(id, requested),
    evidenceForRange: (id, start, end, requested = snapshotId) =>
      repository.evidenceForRange(id, start, end, requested),
    searchEvidence: (query, options) =>
      repository.searchEvidence(query, { ...options, snapshotId }),
    getMap: () => repository.getMap(snapshotId),
  };
}
export const MAX_CONTEXT_CHARACTERS = 10_000;
export const MAX_CONTEXT_CHUNKS = 8;
const stopWords = new Set(
  "a an and are as at be before by can code could describe do does explain file for from get happen happens how i in is it of on or please repository source state that the their then there these this to use using what when where which why will with would zustand".split(
    " ",
  ),
);
export function queryTerms(question: string): string[] {
  const expanded = question.replace(/([a-z])([A-Z])/g, "$1 $2");
  return [
    ...new Set(
      [
        ...(question.match(/[A-Za-z_$][\w$]*/g) ?? []),
        ...(expanded.match(/[A-Za-z_$][\w$]*/g) ?? []),
      ]
        .map((word) => word.toLowerCase())
        .filter((word) => word.length > 2 && !stopWords.has(word)),
    ),
  ].slice(0, 24);
}
export function validateEvidence(
  evidence: Evidence,
  snapshotId: string,
  store: EvidenceRepository = defaultRepository,
): Evidence {
  const canonical = store.getEvidence(evidence.evidenceId, snapshotId);
  const source = store.getSource(canonical.fileId, snapshotId);
  if (
    canonical.evidenceId !== evidence.evidenceId ||
    canonical.fileId !== source.file.fileId ||
    !Number.isInteger(canonical.startLine) ||
    !Number.isInteger(canonical.endLine) ||
    canonical.snapshotId !== snapshotId ||
    source.file.snapshotId !== snapshotId ||
    canonical.contentHash !== source.file.contentHash ||
    canonical.startLine < 1 ||
    canonical.endLine < canonical.startLine ||
    canonical.endLine > source.lines.length ||
    canonical.text !==
      source.lines
        .slice(canonical.startLine - 1, canonical.endLine)
        .join("\n") ||
    [
      "snapshotId",
      "fileId",
      "startLine",
      "endLine",
      "contentHash",
      "text",
    ].some(
      (key) =>
        canonical[key as keyof Evidence] !== evidence[key as keyof Evidence],
    )
  ) {
    throw new AppError(
      "INVALID_EVIDENCE",
      "The source evidence could not be verified.",
      409,
    );
  }
  return canonical;
}
export interface RetrievalResult {
  evidence: Evidence[];
  limitations: string[];
  walkthrough?: WalkthroughContext;
}
/** Legacy callers retain file scope; explicit repository scope makes fileId a ranking hint only. */
export function questionScope(input: QuestionInput) {
  return (
    input.scope ??
    (input.guideId
      ? "walkthrough"
      : input.fileId
        ? input.startLine !== undefined
          ? "selection"
          : "file"
        : "repository")
  );
}
function resolveWalkthrough(input: QuestionInput, store: EvidenceRepository) {
  if (!input.guideId) return undefined;
  const guide = publicLearning(input.snapshotId).guides.find(
    (item) => item.id === input.guideId,
  );
  if (!guide)
    throw new AppError(
      "GUIDE_NOT_FOUND",
      "This walkthrough does not exist.",
      404,
    );
  if (guide.snapshotId !== input.snapshotId)
    throw new AppError(
      "SNAPSHOT_MISMATCH",
      "This walkthrough belongs to a different source snapshot.",
      409,
    );
  const step = input.stepId
    ? guide.steps.find((item) => item.id === input.stepId)
    : undefined;
  if (input.stepId && !step)
    throw new AppError(
      "STEP_NOT_FOUND",
      "This step does not belong to the selected walkthrough.",
      404,
    );
  const steps = step
    ? [step, ...guide.steps.filter((item) => item.id !== step.id)]
    : guide.steps;
  const evidence = steps.flatMap((item) =>
    item.evidenceIds.map((id) => {
      const evidence = store.getEvidence(id, input.snapshotId);
      if (evidence.evidenceId !== id)
        throw new AppError(
          "INVALID_EVIDENCE",
          "The walkthrough evidence identity could not be verified.",
          409,
        );
      return evidence;
    }),
  );
  return {
    evidence,
    context: {
      guideId: guide.id,
      title: guide.title,
      ...(step ? { stepId: step.id, stepTitle: step.title } : {}),
    } as WalkthroughContext,
  };
}

export function retrieveContext(
  rawInput: QuestionInput,
  store: EvidenceRepository = repositoryForSnapshot(rawInput.snapshotId),
): RetrievalResult {
  const input = questionSchema.parse(rawInput);
  if (store.getSnapshot().snapshotId !== input.snapshotId)
    throw new AppError(
      "SNAPSHOT_MISMATCH",
      "This question belongs to a different repository snapshot.",
      409,
    );
  const walkthrough = resolveWalkthrough(input, store);
  const scope = questionScope(input);
  if (input.fileId) store.getSource(input.fileId, input.snapshotId);
  if (
    (scope === "file" && !input.fileId) ||
    (scope === "selection" &&
      (!input.fileId ||
        input.startLine === undefined ||
        input.endLine === undefined))
  ) {
    throw new AppError(
      "INVALID_INPUT",
      "This scope requires a source file and, for selection scope, both line boundaries.",
    );
  }
  const selected =
    scope === "selection" &&
    input.fileId &&
    input.startLine !== undefined &&
    input.endLine !== undefined
      ? store.evidenceForRange(
          input.fileId,
          input.startLine,
          input.endLine,
          input.snapshotId,
        )
      : undefined;
  const terms = queryTerms(input.question);
  let candidates: Evidence[] =
    selected && scope !== "repository" ? [selected] : [];
  if (!walkthrough && scope !== "selection" && terms.length) {
    const matches = store.searchEvidence(terms.join(" "), {
      fileId: scope === "file" ? input.fileId : undefined,
      limit: 20,
    });
    // Keep the best match from each file first; overlapping windows must not crowd out another module.
    const perFile = new Map<string, Evidence[]>();
    for (const item of matches) {
      const group = perFile.get(item.fileId) ?? [];
      group.push(item);
      perFile.set(item.fileId, group);
    }
    const groups = [...perFile.entries()].sort(
      ([a], [b]) => Number(b === input.fileId) - Number(a === input.fileId),
    );
    for (let i = 0; i < 20; i++)
      for (const [, group] of groups) if (group[i]) candidates.push(group[i]);
    if (scope === "repository" && store.getMap && matches.length) {
      const map = store.getMap();
      const seeds = new Set(matches.slice(0, 4).map((item) => item.fileId));
      const neighbors = new Set(
        map.edges
          .filter(
            (edge) =>
              !edge.typeOnly && (seeds.has(edge.from) || seeds.has(edge.to)),
          )
          .flatMap((edge) => [edge.from, edge.to])
          .filter((id) => !seeds.has(id)),
      );
      const additions = [...neighbors]
        .slice(0, 3)
        .flatMap((fileId) =>
          store.searchEvidence(terms.join(" "), { fileId, limit: 2 }),
        );
      candidates = [
        ...candidates.slice(0, Math.min(groups.length, 4)),
        ...additions,
        ...candidates.slice(Math.min(groups.length, 4)),
      ];
    }
  }
  if (walkthrough) candidates = walkthrough.evidence;
  const evidence: Evidence[] = [];
  const seen = new Set<string>();
  let remaining = MAX_CONTEXT_CHARACTERS,
    omitted = 0;
  for (const candidate of candidates) {
    if (seen.has(candidate.evidenceId)) continue;
    seen.add(candidate.evidenceId);
    const valid = validateEvidence(candidate, input.snapshotId, store);
    if (scope === "file" && input.fileId && valid.fileId !== input.fileId)
      throw new AppError(
        "INVALID_EVIDENCE",
        "The retrieved evidence is outside the selected source file.",
        409,
      );
    if (
      scope === "selection" &&
      (valid.fileId !== input.fileId ||
        valid.startLine !== input.startLine ||
        valid.endLine !== input.endLine)
    )
      throw new AppError(
        "INVALID_EVIDENCE",
        "The retrieved evidence does not match the selected source lines.",
        409,
      );
    if (
      !walkthrough &&
      valid.evidenceId !== selected?.evidenceId &&
      !terms.some((term) => valid.text.toLowerCase().includes(term))
    )
      continue;
    const redundant = evidence.some((prior) => {
      if (prior.fileId !== valid.fileId) return false;
      const overlap = Math.max(
        0,
        Math.min(prior.endLine, valid.endLine) -
          Math.max(prior.startLine, valid.startLine) +
          1,
      );
      return overlap / (valid.endLine - valid.startLine + 1) >= 0.65;
    });
    if (redundant && !walkthrough) continue;
    if (
      valid.text.length > remaining ||
      evidence.length >= MAX_CONTEXT_CHUNKS
    ) {
      omitted++;
      continue;
    }
    evidence.push(valid);
    remaining -= valid.text.length;
  }
  return {
    evidence,
    ...(walkthrough ? { walkthrough: walkthrough.context } : {}),
    limitations: [
      "Retrieval uses indexed source text and supported static imports; it does not trace runtime execution.",
      ...(scope === "file"
        ? ["Search is restricted to the selected file."]
        : scope === "selection"
          ? ["Only the selected source lines were supplied."]
          : scope === "repository"
            ? [
                "Repository scope may include multiple files; the open file is only a ranking hint.",
              ]
            : []),
      ...(walkthrough
        ? [
            `Question context is the reviewed source targets from "${walkthrough.context.title}". The active step is prioritized; other steps may supply evidence across files.`,
          ]
        : []),
      ...(omitted
        ? [
            "Some source ranges were omitted to keep the AI context bounded. Select a smaller range if needed.",
          ]
        : []),
    ],
  };
}
