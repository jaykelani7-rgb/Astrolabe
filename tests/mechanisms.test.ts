import { afterEach, describe, expect, it, vi } from 'vitest';
import { sourceMechanisms } from '@/lib/ai/mechanisms';
import { createLocalProvider } from '@/lib/ai/local';
import { createGeminiProvider } from '@/lib/ai/gemini';
import { retrieveContext, MAX_CONTEXT_CHARACTERS } from '@/lib/retrieval';
import { getSnapshot, listFiles } from '@/lib/repository';
vi.stubEnv('MENTOR_DB_PATH', ':memory:');
afterEach(() => vi.restoreAllMocks());
const context = (question: string) => retrieveContext({ question, snapshotId: getSnapshot().snapshotId, scope: 'repository' });

describe('literal source mechanisms supplied to providers', () => {
  it.each([
    ['How does setState update state?', '!Object.is(nextState, state)'],
    ['How does useStore use a selector?', 'selector(api.getState())'],
    ['Where are the previous and current states passed to listeners?', 'listener(state, previousState)'],
    ['How does createImpl attach the store API to the React hook?', 'Object.assign(useBoundStore, api)'],
    ['How does combine construct its returned object?', 'Object.assign({}, initialState, (create as any)(...args))'],
  ])('retains the relevant syntax for %s', (question, expected) => {
    const { evidence } = context(question);
    const mechanisms = sourceMechanisms(evidence);
    expect(mechanisms.some(item => item.code.includes(expected))).toBe(true);
    for (const item of mechanisms) {
      const original = evidence.find(e => e.evidenceId === item.evidenceId)!;
      expect(original.text).toContain(item.code);
      expect(item.startLine).toBeGreaterThanOrEqual(original.startLine);
      expect(item.endLine).toBeLessThanOrEqual(original.endLine);
    }
    expect(evidence.reduce((n, e) => n + e.text.length, 0) + mechanisms.reduce((n, m) => n + m.code.length, 0)).toBeLessThanOrEqual(MAX_CONTEXT_CHARACTERS);
  });
  it('does not add operations from outside an exact selection', () => {
    const file = listFiles().find(f => f.path === 'src/vanilla.ts')!;
    const { evidence } = retrieveContext({ question: 'Explain notification and replacement', snapshotId: file.snapshotId, fileId: file.fileId, scope: 'selection', startLine: 88, endLine: 92 });
    const hints = sourceMechanisms(evidence);
    expect(hints.every(h => h.startLine >= 88 && h.endLine <= 92)).toBe(true);
    expect(hints.some(h => h.code.includes('Object.is'))).toBe(false);
  });
  it('delivers the same bounded reading aid to local and Gemini adapters', async () => {
    const evidence = context('Explain combine').evidence;
    const input = { question: 'Explain combine', snapshotId: getSnapshot().snapshotId };
    const local = vi.fn(async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"status":"evidence_gap","blocks":[],"limitations":[]}' } }] }));
    const cloud = vi.fn(async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{}' }] } }] }));
    await createLocalProvider({ fetch: local as typeof fetch })({ input, evidence });
    await createGeminiProvider({ apiKey: 'test-only', fetch: cloud as typeof fetch })({ input, evidence });
    const localBody = JSON.parse((local.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    const cloudBody = JSON.parse((cloud.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(JSON.parse(localBody.messages[1].content).sourceMechanisms).toEqual(JSON.parse(cloudBody.contents[0].parts[0].text).sourceMechanisms);
    expect(localBody.response_format.json_schema.schema.properties.blocks.maxItems).toBe(3);
  });
});
