import 'server-only';
import type { Evidence, QuestionInput, Snapshot, SourceDocument, SourceFile } from '@/contracts';
import { AppError } from '@/lib/api';
import * as repository from '@/lib/repository';

export interface EvidenceRepository {
  getSnapshot(): Snapshot;
  getSource(fileId: string, snapshotId?: string): SourceDocument;
  getEvidence(evidenceId: string, snapshotId?: string): Evidence;
  evidenceForRange(fileId: string, startLine: number, endLine: number, snapshotId?: string): Evidence;
  searchEvidence(query: string, options?: { fileId?: string; limit?: number }): Evidence[];
  listFiles(): SourceFile[];
}

export const defaultRepository: EvidenceRepository = repository;
export const MAX_CONTEXT_CHARACTERS = 10_000;
export const MAX_CONTEXT_CHUNKS = 8;

const stopWords = new Set('a an and are as at be before by can code could describe do does explain file for from get happen happens how i in is it of on or please repository source state that the their then there these this to use using what when where which why will with would zustand'.split(' '));

export function queryTerms(question: string): string[] {
  return [...new Set((question.match(/[A-Za-z_$][\w$]*/g) ?? [])
    .map((word) => word.toLowerCase()).filter((word) => word.length > 2 && !stopWords.has(word)))].slice(0, 24);
}

/** Re-read the allowed file and canonical evidence; never trust a model-supplied range. */
export function validateEvidence(evidence: Evidence, snapshotId: string, store: EvidenceRepository = defaultRepository): Evidence {
  const canonical = store.getEvidence(evidence.evidenceId, snapshotId);
  const source = store.getSource(canonical.fileId, snapshotId);
  if (canonical.snapshotId !== snapshotId || source.file.snapshotId !== snapshotId
    || canonical.contentHash !== source.file.contentHash
    || canonical.startLine < 1 || canonical.endLine < canonical.startLine
    || canonical.endLine > source.lines.length
    || canonical.text !== source.lines.slice(canonical.startLine - 1, canonical.endLine).join('\n')
    || ['snapshotId', 'fileId', 'startLine', 'endLine', 'contentHash', 'text'].some((key) =>
      canonical[key as keyof Evidence] !== evidence[key as keyof Evidence])) {
    throw new AppError('INVALID_EVIDENCE', 'The source evidence could not be verified.', 409);
  }
  return canonical;
}

export interface RetrievalResult { evidence: Evidence[]; limitations: string[] }

export function retrieveContext(input: QuestionInput, store: EvidenceRepository = defaultRepository): RetrievalResult {
  if (store.getSnapshot().snapshotId !== input.snapshotId) {
    throw new AppError('SNAPSHOT_MISMATCH', 'This question belongs to a different repository snapshot.', 409);
  }
  if (input.fileId) store.getSource(input.fileId, input.snapshotId);
  const selected = input.fileId && input.startLine !== undefined && input.endLine !== undefined
    ? store.evidenceForRange(input.fileId, input.startLine, input.endLine, input.snapshotId) : undefined;
  const terms = queryTerms(input.question);
  const matches = terms.length ? store.searchEvidence(terms.join(' '), { fileId: input.fileId, limit: 16 }) : [];
  const candidates = [ ...(selected ? [selected] : []), ...matches ];
  const evidence: Evidence[] = [];
  const seen = new Set<string>();
  let remaining = MAX_CONTEXT_CHARACTERS;
  let omitted = 0;
  for (const candidate of candidates) {
    if (seen.has(candidate.evidenceId)) continue;
    seen.add(candidate.evidenceId);
    const valid = validateEvidence(candidate, input.snapshotId, store);
    if (valid.evidenceId !== selected?.evidenceId && !terms.some((term) => valid.text.toLowerCase().includes(term))) continue;
    if (valid.text.length > remaining || evidence.length >= MAX_CONTEXT_CHUNKS) { omitted++; continue; }
    evidence.push(valid);
    remaining -= valid.text.length;
  }
  return {
    evidence,
    limitations: [
      'Retrieval uses indexed source text and supported static imports; it does not trace runtime execution.',
      ...(input.fileId ? ['Search is restricted to the selected file.'] : []),
      ...(omitted ? ['Some source ranges were omitted to keep the AI context bounded. Select a smaller range if needed.'] : []),
    ],
  };
}
