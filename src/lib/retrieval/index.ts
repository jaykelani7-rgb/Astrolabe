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
  listSymbols?(fileId?: string): repository.SourceSymbol[];
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
    listSymbols: (fileId) => repository.listSymbols(fileId, snapshotId),
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

const asksAcrossFiles = (question: string) => /\b(?:across|between|callers?|connections?|connects?|interacts?|relationships?|together)\b/i.test(question);

/** Resolve named runtime declarations before lexical references, within the requested scope. */
function definitionContext(input: QuestionInput, scope: ReturnType<typeof questionScope>, terms: string[], store: EvidenceRepository) {
  const files = store.listFiles().filter((file) => scope !== "file" || file.fileId === input.fileId);
  const allowed = new Map(files.map((file) => [file.fileId, file]));
  const symbols = (store.listSymbols?.(scope === "file" ? input.fileId : undefined) ?? []).filter((symbol) =>
    allowed.has(symbol.fileId) && symbol.runtime !== false &&
    ["VariableDeclaration", "FunctionDeclaration", "ClassDeclaration"].includes(symbol.kind));
  const pathMatches = (fileId: string) => {
    const path = allowed.get(fileId)!.path.toLowerCase();
    const segments = path.replace(/\.tsx?$/, "").split(/[\/_.-]+/);
    return terms.filter((term) => segments.includes(term)).length;
  };
  const pathScore = (fileId: string) => pathMatches(fileId) * 10 - allowed.get(fileId)!.path.split("/").length;
  const relational = asksAcrossFiles(input.question);
  const fileMatches = files.filter((file) => terms.includes(file.path.split("/").at(-1)!.replace(/\.tsx?$/, "").toLowerCase()))
    .sort((a, b) => pathScore(b.fileId) - pathScore(a.fileId));
  const namedFiles = relational ? fileMatches : fileMatches.filter((file) => pathMatches(file.fileId) === pathMatches(fileMatches[0].fileId));
  const namedFileIds = new Set(namedFiles.map((file) => file.fileId));
  const querySymbols = namedFiles.length && !relational ? symbols.filter((symbol) => namedFileIds.has(symbol.fileId)) : symbols;
  const explicitNames = new Set((input.question.match(/[A-Za-z_$][\w$]*/g) ?? [])
    .filter((word) => /[a-z][A-Z]|[_$]/.test(word)).map((word) => word.toLowerCase()));
  const exactMatches = querySymbols.filter((symbol) => terms.includes(symbol.name.toLowerCase()));
  const namedMatches = exactMatches.filter((symbol) => explicitNames.has(symbol.name.toLowerCase()));
  const matches = (namedMatches.length ? namedMatches : exactMatches)
    .sort((a, b) => pathScore(b.fileId) - pathScore(a.fileId) || a.startLine - b.startLine);
  const bestPathScore = matches.length ? pathScore(matches[0].fileId) : -Infinity;
  const primary = relational ? matches : matches.filter((symbol) => bestPathScore < 0 || pathScore(symbol.fileId) === bestPathScore);
  const evidence: Evidence[] = [];
  function add(symbol: repository.SourceSymbol) {
    const source = store.getSource(symbol.fileId, input.snapshotId);
    const enclosing = symbols.filter((parent) => parent.fileId === symbol.fileId && parent.symbolId !== symbol.symbolId &&
      parent.startLine <= symbol.startLine && parent.endLine >= symbol.endLine && parent.endLine - parent.startLine <= 80)
      .sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine))
      .find((parent) => source.lines.slice(parent.startLine - 1, parent.endLine).join("\n").length <= 4000);
    const target = enclosing ?? symbol;
    // Long declarations stay covered by lexical windows rather than a cut-off implementation.
    if (target.endLine - target.startLine <= 80)
      evidence.push(store.evidenceForRange(target.fileId, target.startLine, target.endLine, input.snapshotId));
    const body = source.lines.slice(symbol.startLine - 1, symbol.endLine).join("\n");
    if (symbol.endLine - symbol.startLine <= 8) {
      const identifiers = new Set(body.match(/[A-Za-z_$][\w$]*/g) ?? []);
      for (const alias of symbols.filter((other) => other.fileId === symbol.fileId && other.symbolId !== symbol.symbolId &&
        other.topLevel !== false && identifiers.has(other.name)).slice(0, 4)) {
        if (alias.endLine - alias.startLine <= 80)
          evidence.push(store.evidenceForRange(alias.fileId, alias.startLine, alias.endLine, input.snapshotId));
      }
    }
  }
  for (const symbol of primary.slice(0, 6)) add(symbol);
  for (const file of namedFiles.slice(0, 3)) {
    const source = store.getSource(file.fileId, input.snapshotId);
    if (file.lineCount <= 120 && source.content.length <= 4000)
      evidence.push(store.evidenceForRange(file.fileId, 1, file.lineCount, input.snapshotId));
    else evidence.push(...store.searchEvidence(terms.join(" "), { fileId: file.fileId, limit: 2 }));
  }
  return { evidence, files: new Set(evidence.map((item) => item.fileId)), names: new Set(primary.map((symbol) => symbol.name)) };
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
    const definitions = definitionContext(input, scope, terms, store);
    let matches = store.searchEvidence(terms.join(" "), {
      fileId: scope === "file" ? input.fileId : undefined,
      limit: 20,
    }).map((item) => {
      const canonical = validateEvidence(item, input.snapshotId, store);
      if (scope === "file" && canonical.fileId !== input.fileId)
        throw new AppError("INVALID_EVIDENCE", "The retrieved evidence is outside the selected source file.", 409);
      return canonical;
    });
    const crossFile = asksAcrossFiles(input.question)
      || (definitions.names.size > 1 && definitions.files.size > 1);
    if (definitions.evidence.length && !crossFile)
      matches = matches.filter((item) => definitions.files.has(item.fileId));
    candidates.push(...definitions.evidence);
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
    if (scope === "repository" && store.getMap && matches.length && (!definitions.evidence.length || crossFile)) {
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
        ...candidates.slice(0, definitions.evidence.length + Math.min(groups.length, 4)),
        ...additions,
        ...candidates.slice(definitions.evidence.length + Math.min(groups.length, 4)),
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
      !terms.some((term) => valid.text.toLowerCase().includes(term) || store.getSource(valid.fileId, input.snapshotId).file.path.toLowerCase().split(/[\/_.-]+/).includes(term))
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
