import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { Project } from "ts-morph";
import type {
  Evidence,
  ModuleMap,
  Snapshot,
  SourceDocument,
  SourceFile,
} from "@/contracts";
import { AppError } from "@/lib/api";
import { getDb } from "@/lib/db";

interface Manifest extends Snapshot {
  tag: string;
  files: { path: string; sha256: string; bytes: number }[];
}
export interface SourceSymbol {
  symbolId: string;
  snapshotId: string;
  fileId: string;
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
}
interface Prepared {
  snapshot: Snapshot;
  documents: SourceDocument[];
  byId: Map<string, SourceDocument>;
  moduleMap: ModuleMap;
  symbols: SourceSymbol[];
}
const preparedSnapshots = new Map<string, Prepared>();
const indexedConnections = new WeakMap<object, Set<string>>();
const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const sourceRoot = () => path.resolve(process.cwd(), "data", "snapshot");

/** Load allowlisted, hash-checked files only. The analyzed repository is never executed. */
export function defaultSnapshotId(): string {
  return JSON.parse(
    readFileSync(path.join(sourceRoot(), "manifest.json"), "utf8"),
  ).snapshotId;
}

export function listSnapshots(): Snapshot[] {
  const extra = path.resolve(process.cwd(), "data", "snapshots");
  const ids = [
    defaultSnapshotId(),
    ...(existsSync(extra)
      ? readdirSync(extra).filter((id) => /^[a-zA-Z0-9_-]{1,120}$/.test(id))
      : []),
  ];
  return [...new Set(ids)].map((id) => getSnapshot(id));
}

function prepare(requestedSnapshotId?: string): Prepared {
  const id = requestedSnapshotId ?? defaultSnapshotId();
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id))
    throw new AppError(
      "SNAPSHOT_MISMATCH",
      "This content belongs to a different repository snapshot.",
      409,
    );
  const cached = preparedSnapshots.get(id);
  if (cached) return cached;
  const root =
    id === defaultSnapshotId()
      ? sourceRoot()
      : path.resolve(process.cwd(), "data", "snapshots", id);
  if (!existsSync(path.join(root, "manifest.json")))
    throw new AppError(
      "SNAPSHOT_MISMATCH",
      "This content belongs to a different repository snapshot.",
      409,
    );
  const manifest = JSON.parse(
    readFileSync(path.join(root, "manifest.json"), "utf8"),
  ) as Manifest;
  if (manifest.snapshotId !== id)
    throw new AppError(
      "SNAPSHOT_MISMATCH",
      "Manifest snapshot identity does not match its directory.",
      409,
    );
  if (!/^[a-f0-9]{40}$/.test(manifest.commitSha) || manifest.status !== "ready")
    throw new Error("Invalid prepared repository manifest.");
  const {
    snapshotId,
    name,
    repositoryUrl,
    commitSha,
    license,
    language,
    preparedAt,
    status,
    description,
  } = manifest;
  const snapshot: Snapshot = {
    snapshotId,
    name,
    repositoryUrl,
    commitSha,
    license,
    language,
    preparedAt,
    status,
    description,
  };
  const documents = manifest.files
    .map((entry): SourceDocument => {
      if (
        !/^src\/[a-zA-Z0-9_./-]+\.tsx?$/.test(entry.path) ||
        entry.path.split("/").includes("..")
      )
        throw new Error("Unsafe prepared file path.");
      const absolute = path.resolve(root, entry.path);
      if (!absolute.startsWith(root + path.sep))
        throw new Error("File escaped snapshot root.");
      const bytes = readFileSync(absolute);
      if (digest(bytes) !== entry.sha256 || bytes.byteLength !== entry.bytes)
        throw new Error(`Snapshot integrity check failed: ${entry.path}`);
      const content = bytes.toString("utf8");
      const lines = content.split(/\r?\n/);
      if (lines.at(-1) === "") lines.pop();
      return {
        file: {
          fileId: `file_${digest(`${snapshotId}:${entry.path}`).slice(0, 20)}`,
          snapshotId,
          path: entry.path,
          language: "TypeScript",
          lineCount: lines.length,
          contentHash: entry.sha256,
        },
        content,
        lines,
      };
    })
    .sort((a, b) => a.file.path.localeCompare(b.file.path));
  if (
    !documents.length ||
    new Set(documents.map((d) => d.file.path)).size !== documents.length
  )
    throw new Error("The snapshot must contain unique source files.");
  const byId = new Map(documents.map((d) => [d.file.fileId, d]));
  const { moduleMap, symbols } = analyzeSource(documents);
  const prepared = { snapshot, documents, byId, moduleMap, symbols };
  preparedSnapshots.set(id, prepared);
  return prepared;
}

function analyzeSource(documents: SourceDocument[]): {
  moduleMap: ModuleMap;
  symbols: SourceSymbol[];
} {
  // In-memory AST parsing prevents compiler/plugin/config execution in the analyzed repo.
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });
  const byPath = new Map(
    documents.map((document) => [document.file.path, document.file]),
  );
  const nodes: ModuleMap["nodes"] = documents.map(({ file }) => ({
    id: file.fileId,
    fileId: file.fileId,
    label: file.path,
    kind: file.path.includes("middleware")
      ? "middleware"
      : /(?:^|\/)(?:index|shallow)\.ts$/.test(file.path)
        ? "entry"
        : "core",
  }));
  const edges: ModuleMap["edges"] = [];
  const unresolved: ModuleMap["unresolved"] = [];
  const edgeIds = new Set<string>();
  const symbols: SourceSymbol[] = [];
  for (const { file, content } of documents) {
    const source = project.createSourceFile("/" + file.path, content);
    const declarations = [
      ...source.getFunctions(),
      ...source.getClasses(),
      ...source.getInterfaces(),
      ...source.getTypeAliases(),
      ...source
        .getVariableStatements()
        .flatMap((statement) => statement.getDeclarations()),
    ];
    for (const declaration of declarations) {
      const name = declaration.getName() || "(anonymous)";
      const startLine = declaration.getStartLineNumber();
      const endLine = declaration.getEndLineNumber();
      symbols.push({
        symbolId: `symbol_${digest(`${file.fileId}:${name}:${startLine}:${endLine}`).slice(0, 20)}`,
        snapshotId: file.snapshotId,
        fileId: file.fileId,
        name,
        kind: declaration.getKindName(),
        startLine,
        endLine,
      });
    }
    const references = [
      ...source
        .getImportDeclarations()
        .map((node) => ({
          specifier: node.getModuleSpecifierValue(),
          typeOnly: node.isTypeOnly(),
        })),
      ...source
        .getExportDeclarations()
        .filter((node) => node.getModuleSpecifierValue() !== undefined)
        .map((node) => ({
          specifier: node.getModuleSpecifierValue()!,
          typeOnly: node.isTypeOnly(),
        })),
    ];
    for (const reference of references) {
      const { specifier, typeOnly } = reference;
      if (!specifier.startsWith(".")) {
        unresolved.push({
          from: file.fileId,
          specifier,
          reason:
            "External dependency; its implementation is outside this prepared source snapshot.",
        });
        continue;
      }
      const base = path.posix.normalize(
        path.posix.join(path.posix.dirname(file.path), specifier),
      );
      const candidates = [
        base,
        base + ".ts",
        base + ".tsx",
        base + "/index.ts",
      ];
      const destination = candidates
        .map((candidate) => byPath.get(candidate))
        .find(Boolean);
      if (!destination) {
        unresolved.push({
          from: file.fileId,
          specifier,
          reason: "Relative module could not be resolved inside this snapshot.",
        });
        continue;
      }
      const id = `edge_${digest(`${file.fileId}:${destination.fileId}:${typeOnly}`).slice(0, 20)}`;
      if (!edgeIds.has(id)) {
        edges.push({
          id,
          from: file.fileId,
          to: destination.fileId,
          kind: "import",
          typeOnly,
        });
        edgeIds.add(id);
      }
    }
  }
  return { moduleMap: { nodes, edges, unresolved }, symbols };
}

function assertSnapshot(snapshotId?: string): void {
  if (
    snapshotId !== undefined &&
    snapshotId !== prepare(snapshotId).snapshot.snapshotId
  )
    throw new AppError(
      "SNAPSHOT_MISMATCH",
      "This content belongs to a different repository snapshot. Reload the workspace.",
      409,
    );
}

function documentFor(fileId: string, snapshotId?: string): SourceDocument {
  assertSnapshot(snapshotId);
  const document = prepare(snapshotId).byId.get(fileId);
  if (!document)
    throw new AppError(
      "FILE_NOT_FOUND",
      "The requested file is not part of the prepared repository.",
      404,
    );
  return document;
}

function makeEvidence(
  document: SourceDocument,
  startLine: number,
  endLine: number,
): Evidence {
  if (
    !Number.isInteger(startLine) ||
    !Number.isInteger(endLine) ||
    startLine < 1 ||
    endLine < startLine ||
    endLine > document.file.lineCount
  ) {
    throw new AppError(
      "INVALID_RANGE",
      `Choose lines between 1 and ${document.file.lineCount}, with the end after the start.`,
      400,
    );
  }
  const text = document.lines.slice(startLine - 1, endLine).join("\n");
  const contentHash = document.file.contentHash;
  const { fileId, snapshotId } = document.file;
  const evidenceId = `ev_${digest(`${snapshotId}:${fileId}:${startLine}:${endLine}:${contentHash}`).slice(0, 32)}`;
  return {
    evidenceId,
    snapshotId,
    fileId,
    startLine,
    endLine,
    contentHash,
    text,
  };
}

function insertEvidence(evidence: Evidence): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO evidence (evidence_id, snapshot_id, file_id, start_line, end_line, content_hash, text) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      evidence.evidenceId,
      evidence.snapshotId,
      evidence.fileId,
      evidence.startLine,
      evidence.endLine,
      evidence.contentHash,
      evidence.text,
    );
}

/** Index overlapping, immutable source chunks once in each process/DB connection. */
function ensureIndex(snapshotId?: string): void {
  const data = prepare(snapshotId);
  const db = getDb();
  if (indexedConnections.get(db)?.has(data.snapshot.snapshotId)) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      "INSERT INTO snapshots (snapshot_id, metadata_json) VALUES (?, ?) ON CONFLICT(snapshot_id) DO UPDATE SET metadata_json = excluded.metadata_json",
    ).run(data.snapshot.snapshotId, JSON.stringify(data.snapshot));
    for (const document of data.documents) {
      const f = document.file;
      // UPSERT preserves foreign-key references to evidence on subsequent boots.
      db.prepare(
        "INSERT INTO source_files (file_id, snapshot_id, path, language, line_count, content_hash, content) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(file_id) DO UPDATE SET content = excluded.content, content_hash = excluded.content_hash",
      ).run(
        f.fileId,
        f.snapshotId,
        f.path,
        f.language,
        f.lineCount,
        f.contentHash,
        document.content,
      );
    }
    db.prepare("DELETE FROM source_symbols WHERE snapshot_id = ?").run(
      data.snapshot.snapshotId,
    );
    const saveSymbol = db.prepare(
      "INSERT INTO source_symbols (symbol_id, snapshot_id, file_id, name, kind, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    for (const symbol of data.symbols)
      saveSymbol.run(
        symbol.symbolId,
        symbol.snapshotId,
        symbol.fileId,
        symbol.name,
        symbol.kind,
        symbol.startLine,
        symbol.endLine,
      );
    db.prepare("DELETE FROM evidence_fts WHERE snapshot_id = ?").run(
      data.snapshot.snapshotId,
    );
    const insertSearch = db.prepare(
      "INSERT INTO evidence_fts (evidence_id, snapshot_id, file_id, path, text) VALUES (?, ?, ?, ?, ?)",
    );
    const searchIds = new Set<string>();
    const indexEvidence = (evidence: Evidence, sourcePath: string) => {
      if (searchIds.has(evidence.evidenceId)) return;
      searchIds.add(evidence.evidenceId);
      insertEvidence(evidence);
      insertSearch.run(
        evidence.evidenceId,
        evidence.snapshotId,
        evidence.fileId,
        sourcePath,
        evidence.text,
      );
    };
    for (const document of data.documents) {
      for (let start = 1; start <= document.file.lineCount; start += 36) {
        const evidence = makeEvidence(
          document,
          start,
          Math.min(start + 44, document.file.lineCount),
        );
        indexEvidence(evidence, document.file.path);
        if (evidence.endLine === document.file.lineCount) break;
      }
    }
    for (const symbol of data.symbols) {
      const document = data.byId.get(symbol.fileId)!;
      // Large middleware symbols remain covered by bounded overlapping chunks.
      if (
        symbol.endLine - symbol.startLine >= 3 &&
        symbol.endLine - symbol.startLine <= 80
      )
        indexEvidence(
          makeEvidence(document, symbol.startLine, symbol.endLine),
          document.file.path,
        );
    }
    db.exec("COMMIT");
    const ids = indexedConnections.get(db) ?? new Set<string>();
    ids.add(data.snapshot.snapshotId);
    indexedConnections.set(db, ids);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getSnapshot(snapshotId?: string): Snapshot {
  return { ...prepare(snapshotId).snapshot };
}
export function listFiles(snapshotId?: string): SourceFile[] {
  return prepare(snapshotId).documents.map(({ file }) => ({ ...file }));
}
export function getSource(fileId: string, snapshotId?: string): SourceDocument {
  const document = documentFor(fileId, snapshotId);
  return {
    file: { ...document.file },
    content: document.content,
    lines: [...document.lines],
  };
}
export function getMap(snapshotId?: string): ModuleMap {
  return structuredClone(prepare(snapshotId).moduleMap);
}
export function listSymbols(
  fileId?: string,
  snapshotId?: string,
): SourceSymbol[] {
  if (fileId) documentFor(fileId, snapshotId);
  return prepare(snapshotId)
    .symbols.filter((symbol) => !fileId || symbol.fileId === fileId)
    .map((symbol) => ({ ...symbol }));
}
export function evidenceForRange(
  fileId: string,
  startLine: number,
  endLine: number,
  snapshotId?: string,
): Evidence {
  const evidence = makeEvidence(
    documentFor(fileId, snapshotId),
    startLine,
    endLine,
  );
  ensureIndex(snapshotId);
  insertEvidence(evidence);
  return evidence;
}

interface EvidenceRow {
  evidence_id: string;
  snapshot_id: string;
  file_id: string;
  start_line: number;
  end_line: number;
  content_hash: string;
  text: string;
}
export function getEvidence(id: string, snapshotId?: string): Evidence {
  assertSnapshot(snapshotId);
  ensureIndex(snapshotId);
  const row = getDb()
    .prepare("SELECT * FROM evidence WHERE evidence_id = ? AND snapshot_id = ?")
    .get(id, getSnapshot(snapshotId).snapshotId) as EvidenceRow | undefined;
  if (!row)
    throw new AppError(
      "EVIDENCE_NOT_FOUND",
      "The requested source evidence was not found.",
      404,
    );
  const canonical = makeEvidence(
    documentFor(row.file_id, snapshotId),
    row.start_line,
    row.end_line,
  );
  if (
    canonical.evidenceId !== row.evidence_id ||
    canonical.contentHash !== row.content_hash ||
    canonical.text !== row.text
  )
    throw new AppError(
      "EVIDENCE_INTEGRITY",
      "The stored source evidence could not be verified.",
      500,
    );
  return canonical;
}

export function searchEvidence(
  query: string,
  options: { fileId?: string; limit?: number; snapshotId?: string } = {},
): Evidence[] {
  if (typeof query !== "string" || query.length > 2000)
    throw new AppError(
      "INVALID_SEARCH",
      "Use a search query of at most 2,000 characters.",
    );
  if (options.fileId) documentFor(options.fileId, options.snapshotId);
  const tokens = [...new Set(query.match(/[\p{L}\p{N}_]+/gu) || [])].slice(
    0,
    24,
  );
  if (!tokens.length) return [];
  const limit = options.limit ?? 6;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20)
    throw new AppError(
      "INVALID_SEARCH",
      "Search limit must be between 1 and 20.",
    );
  ensureIndex(options.snapshotId);
  // Quoted tokens make MATCH operators inert; prefix matching supports symbol fragments.
  const match = tokens
    .map((token) => `"${token.replaceAll('"', '""')}"*`)
    .join(" OR ");
  const filter = options.fileId ? " AND file_id = ?" : "";
  const values = options.fileId
    ? [match, getSnapshot(options.snapshotId).snapshotId, options.fileId, limit]
    : [match, getSnapshot(options.snapshotId).snapshotId, limit];
  const rows = getDb()
    .prepare(
      `SELECT evidence_id FROM evidence_fts WHERE evidence_fts MATCH ? AND snapshot_id = ?${filter} ORDER BY bm25(evidence_fts, 0, 0, 0, 2, 1), rowid LIMIT ?`,
    )
    .all(...values) as { evidence_id: string }[];
  return rows.map((row) => getEvidence(row.evidence_id, options.snapshotId));
}
