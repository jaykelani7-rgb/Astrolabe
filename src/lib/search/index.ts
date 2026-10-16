import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '@/lib/api';
import { getSnapshot, listFiles, getSource, listSymbols, evidenceForRange } from '@/lib/repository';

export const searchSchema = z.object({
  snapshotId: z.string().min(1).max(120),
  q: z.string().trim().min(2).max(200),
  mode: z.enum(['code', 'symbol', 'all']).default('all'),
  fileId: z.string().min(1).max(160).optional(),
  limit: z.coerce.number().int().min(1).max(25).default(10),
  cursor: z.string().min(1).max(512).optional(),
}).strict();
type Match = {
  type: 'code' | 'symbol'; snapshotId: string; fileId: string; path: string;
  startLine: number; endLine: number; preview: string; contentHash: string;
  symbolId?: string; name?: string; kind?: string; runtime?: boolean;
};
const invalidCursor = () => new AppError('INVALID_CURSOR', 'This search cursor is invalid or belongs to another query.', 400);

/** Bounded literal search over prepared source and its existing AST index, never host paths. */
export function searchSource(raw: unknown) {
  const input = searchSchema.parse(raw);
  const snapshot = getSnapshot(input.snapshotId);
  const terms = [...new Set(input.q.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}_$]+/gu) ?? [])];
  if (!terms.length || terms.length > 8) throw new AppError('INVALID_SEARCH', 'Use one to eight searchable terms.', 400);
  const fingerprint = createHash('sha256').update(JSON.stringify([snapshot.snapshotId, snapshot.commitSha, input.q, input.mode, input.fileId ?? null])).digest('hex');
  let offset = 0;
  if (input.cursor) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(input.cursor)) throw invalidCursor();
      const cursor = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'));
      if (cursor.v !== 1 || cursor.query !== fingerprint || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0 || cursor.offset > 5000) throw invalidCursor();
      offset = cursor.offset;
    } catch { throw invalidCursor(); }
  }
  if (input.fileId) getSource(input.fileId, input.snapshotId);
  const files = listFiles(input.snapshotId).filter(file => !input.fileId || file.fileId === input.fileId);
  const matches: Match[] = [];
  const accepts = (text: string) => terms.every(term => text.toLocaleLowerCase('en-US').includes(term));
  function add(match: Match) {
    if (matches.length >= 5000) throw new AppError('SEARCH_TOO_BROAD', 'Narrow the query or choose a file.', 422);
    matches.push(match);
  }
  for (const file of files) {
    const document = getSource(file.fileId, input.snapshotId);
    const common = { snapshotId: snapshot.snapshotId, fileId: file.fileId, path: file.path, contentHash: file.contentHash };
    if (input.mode !== 'symbol') document.lines.forEach((line, index) => {
      if (accepts(line)) add({ ...common, type: 'code', startLine: index + 1, endLine: index + 1, preview: line.slice(0, 300) });
    });
    if (input.mode !== 'code') for (const symbol of listSymbols(file.fileId, input.snapshotId)) {
      if (accepts(symbol.name)) add({ ...common, type: 'symbol', symbolId: symbol.symbolId, name: symbol.name, kind: symbol.kind, runtime: symbol.runtime,
        startLine: symbol.startLine, endLine: symbol.endLine,
        preview: document.lines.slice(symbol.startLine - 1, Math.min(symbol.endLine, symbol.startLine + 2)).join('\n').slice(0, 300),
      });
    }
  }
  matches.sort((a, b) => a.path.localeCompare(b.path, 'en') || a.startLine - b.startLine || a.endLine - b.endLine || a.type.localeCompare(b.type, 'en') || (a.symbolId ?? '').localeCompare(b.symbolId ?? '', 'en'));
  if (offset > matches.length) throw invalidCursor();
  const results = matches.slice(offset, offset + input.limit).map(match => ({
    ...match, evidenceId: evidenceForRange(match.fileId, match.startLine, match.endLine, input.snapshotId).evidenceId,
  }));
  const next = offset + results.length;
  return {
    snapshotId: snapshot.snapshotId, commitSha: snapshot.commitSha, query: input.q, mode: input.mode,
    matches: results, total: matches.length,
    nextCursor: next < matches.length ? Buffer.from(JSON.stringify({ v: 1, query: fingerprint, offset: next })).toString('base64url') : null,
    limitations: ['Literal term matching and static symbols only; no semantic or runtime analysis. Previews may be shortened; use the evidence endpoint for exact source.'],
  };
}
