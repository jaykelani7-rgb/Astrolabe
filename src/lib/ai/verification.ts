import 'server-only';
import type { QaResponse } from '@/contracts';
import { getEvidence, getSource } from '@/lib/repository';
import type { AiDiagnostic } from './diagnostics';
export const LIVE_CASES = [
  { id: 'source-guard', expected: 'answered', paths: ['src/vanilla.ts'], question: 'Inside setState, when does the Object.is guard skip state assignment and listener notification?' },
  { id: 'cross-file', expected: 'answered', paths: ['src/react.ts', 'src/vanilla.ts'], question: 'How does createImpl in react.ts use createStore from vanilla.ts and pass that store API into useStore?' },
  { id: 'historical-intent', expected: 'evidence_gap', paths: [], question: 'Can the supplied source establish the maintainers historical reasons for choosing this design?' },
  { id: 'unsupported-database', expected: 'evidence_gap', paths: [], question: 'Where is the PostgreSQL migration engine implemented?' },
] as const;
export function assessLiveCase(test: { expected: string; paths: readonly string[] }, response: QaResponse, actualRequests: number, snapshotId: string) {
  const failures: string[] = [];
  if (response.status !== test.expected) failures.push('unexpected_outcome');
  if (response.mode !== 'live' || response.cached) failures.push('not_fresh_live_result');
  if (test.expected === 'answered') {
    if (actualRequests < 1) failures.push('no_actual_provider_request');
    if (!response.citations.length || !response.blocks?.some(block => block.kind !== 'unknown')) failures.push('missing_source_support');
    const paths = new Set<string>();
    for (const citation of response.citations) {
      try {
        const exact = getEvidence(citation.evidenceId, snapshotId);
        if (citation.snapshotId !== snapshotId || exact.contentHash !== citation.contentHash || exact.text !== citation.text || exact.startLine !== citation.startLine || exact.endLine !== citation.endLine || exact.fileId !== citation.fileId) failures.push('invalid_reference');
        paths.add(getSource(citation.fileId, snapshotId).file.path);
      } catch { failures.push('invalid_reference'); }
    }
    if (test.paths.some(path => !paths.has(path))) failures.push('missing_required_source_path');
    const ids = new Set(response.citations.map(citation => citation.evidenceId));
    if (response.blocks?.some(block => block.kind !== 'unknown' && (!block.evidenceIds.length || block.evidenceIds.some(id => !ids.has(id))))) failures.push('invalid_block_reference');
  } else if (response.citations.length || !response.blocks?.length || response.blocks.some(block => block.kind !== 'unknown' || block.evidenceIds.length)) failures.push('unsupported_claim_in_gap');
  return { passed: failures.length === 0, failures: [...new Set(failures)] };
}
export function verificationPassed(results: { passed: boolean }[]) { return results.length === LIVE_CASES.length && results.every(result => result.passed); }
export function externalBlocker(events: AiDiagnostic[]) {
  const terminal = [...events].reverse().find(event => event.operation !== 'request');
  return terminal?.category === 'timeout' || terminal?.category === 'http_failure' && [401, 403, 429, 500, 502, 503, 504].includes(terminal.httpStatus ?? 0);
}
