import { describe, expect, it, vi } from 'vitest';
import type { QaResponse } from '@/contracts';
import { LIVE_CASES, assessLiveCase, verificationPassed, externalBlocker } from '@/lib/ai/verification';
import { evidenceForRange, getSnapshot, listFiles } from '@/lib/repository';
vi.stubEnv('MENTOR_DB_PATH', ':memory:');
const snapshotId = getSnapshot().snapshotId;
function answer(paths: string[]): QaResponse {
  const citations = paths.map(path => { const file = listFiles().find(file => file.path === path)!; return evidenceForRange(file.fileId, 1, Math.min(4, file.lineCount)); });
  return { status: 'answered', mode: 'live', provider: 'gemini', answer: 'Visible source operation.', blocks: [{ kind: 'observed', text: 'Visible source operation.', evidenceIds: citations.map(c => c.evidenceId) }], citations, limitations: [] };
}
describe('strict live development gates', () => {
  it('cannot pass on a single answer or an unrun required case', () => {
    expect(verificationPassed([{ passed: true }])).toBe(false);
    expect(verificationPassed(LIVE_CASES.map((_, index) => ({ passed: index !== 1 })))).toBe(false);
    expect(verificationPassed(LIVE_CASES.map(() => ({ passed: true })))).toBe(true);
  });
  it('requires both files for the cross-file gate, fresh live mode and actual requests', () => {
    const test = LIVE_CASES[1];
    expect(assessLiveCase(test, answer(['src/vanilla.ts']), 1, snapshotId).passed).toBe(false);
    const response = answer(['src/vanilla.ts', 'src/react.ts']);
    expect(assessLiveCase(test, response, 1, snapshotId).passed).toBe(true);
    expect(assessLiveCase(test, response, 0, snapshotId).passed).toBe(false);
    expect(assessLiveCase(test, { ...response, mode: 'reviewed' }, 1, snapshotId).passed).toBe(false);
    expect(assessLiveCase(test, { ...response, cached: true }, 1, snapshotId).passed).toBe(false);
    response.citations[0] = { ...response.citations[0], text: 'invented' };
    expect(assessLiveCase(test, response, 1, snapshotId).failures).toContain('invalid_reference');
  });
  it('accepts only honest unknown blocks for unsupported cases and stops external failures', () => {
    const gap: QaResponse = { status: 'evidence_gap', mode: 'live', answer: 'Not established.', blocks: [{ kind: 'unknown', text: 'Not established.', evidenceIds: [] }], citations: [], limitations: [] };
    expect(assessLiveCase(LIVE_CASES[2], gap, 0, snapshotId).passed).toBe(true);
    expect(assessLiveCase(LIVE_CASES[2], { ...gap, blocks: [{ kind: 'observed', text: 'Invented.', evidenceIds: [] }] }, 1, snapshotId).passed).toBe(false);
    expect(externalBlocker([{ provider: 'gemini', operation: 'result', category: 'http_failure', httpStatus: 503 }])).toBe(true);
    expect(externalBlocker([{ provider: 'pipeline', operation: 'validation', category: 'structured_validation' }])).toBe(false);
    expect(externalBlocker([{ provider: 'gemini', operation: 'result', category: 'http_failure', httpStatus: 503 }, { provider: 'gemini', operation: 'result', httpStatus: 200 }])).toBe(false);
  });
});
