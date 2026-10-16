import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { questionSchema } from '@/contracts';
import { answerQuestion, clearAnswerCache } from '@/lib/ai';
import { createGeminiProvider, type ProviderRequest } from '@/lib/ai/gemini';
import { retrieveContext, MAX_CONTEXT_CHARACTERS, MAX_CONTEXT_CHUNKS } from '@/lib/retrieval';
import { getSnapshot, getSource, listFiles } from '@/lib/repository';
import { POST } from '@/app/api/questions/route';

beforeEach(() => {
  vi.stubEnv('MENTOR_DB_PATH', ':memory:');
  vi.stubEnv('GEMINI_API_KEY', '');
});
afterEach(() => { clearAnswerCache(); vi.unstubAllEnvs(); });

const reactGuide = { guideId: 'store-to-react', stepId: 'react-import' };
const question = () => ({ question: 'What is getInitialState?', snapshotId: getSnapshot().snapshotId, ...reactGuide });

describe('walkthrough question scope', () => {
  it('rejects an orphan step or ambiguous file/walkthrough context', () => {
    const input = question();
    expect(questionSchema.safeParse(input).success).toBe(true);
    expect(questionSchema.safeParse({ ...input, guideId: undefined }).success).toBe(false);
    expect(questionSchema.safeParse({ ...input, fileId: 'any-file' }).success).toBe(false);
    expect(questionSchema.safeParse({ ...input, startLine: 1, endLine: 2 }).success).toBe(false);
  });

  it('retrieves reviewed targets across files and prioritizes the selected step', () => {
    const context = retrieveContext(question());
    expect(context.walkthrough).toEqual({ ...reactGuide, title: 'From a store to a React selection', stepTitle: 'Reuse the vanilla store' });
    const first = context.evidence[0];
    expect(getSource(first.fileId).file.path).toBe('src/react.ts');
    expect([first.startLine, first.endLine]).toEqual([1, 9]);
    const paths = new Set(context.evidence.map(item => getSource(item.fileId).file.path));
    expect(paths).toEqual(new Set(['src/react.ts', 'src/vanilla.ts']));
    expect(new Set(context.evidence.map(item => item.evidenceId)).size).toBe(context.evidence.length);
    expect(context.evidence.length).toBeLessThanOrEqual(MAX_CONTEXT_CHUNKS);
    expect(context.evidence.reduce((sum, item) => sum + item.text.length, 0)).toBeLessThanOrEqual(MAX_CONTEXT_CHARACTERS);
  });

  it('supports a whole walkthrough without selecting a step', () => {
    const context = retrieveContext({ ...question(), stepId: undefined });
    expect(context.walkthrough?.guideId).toBe('store-to-react');
    expect(context.walkthrough?.stepId).toBeUndefined();
    expect(context.evidence.length).toBeGreaterThan(0);
  });

  it.each([
    { change: { guideId: 'missing-guide' }, code: 'GUIDE_NOT_FOUND', status: 404 },
    { change: { stepId: 'store-closure' }, code: 'STEP_NOT_FOUND', status: 404 },
    { change: { snapshotId: 'stale' }, code: 'SNAPSHOT_MISMATCH', status: 409 },
  ])('rejects invalid walkthrough identity before generation: $code', async ({ change, code, status }) => {
    const provider = vi.fn();
    await expect(answerQuestion({ ...question(), ...change }, { provider })).rejects.toMatchObject({ code, status });
    expect(provider).not.toHaveBeenCalled();
  });

  it('answers from another reviewed step without requiring a live provider', async () => {
    const result = await answerQuestion(question());
    expect(result).toMatchObject({ status: 'answered', mode: 'reviewed' });
    expect(result.citations.map(item => getSource(item.fileId).file.path)).toEqual(['src/vanilla.ts', 'src/react.ts']);
    expect(result.limitations.join(' ')).toContain('reviewed source targets');
    // The same question in the original import-only source range does not match.
    const file = listFiles().find(item => item.path === 'src/react.ts')!;
    expect(await answerQuestion({ question: 'What is getInitialState?', snapshotId: file.snapshotId, fileId: file.fileId, startLine: 1, endLine: 9 })).toMatchObject({ status: 'unavailable' });
  });

  it('does not reuse a prepared answer whose citations fall outside the walkthrough', async () => {
    const result = await answerQuestion({ ...question(), guideId: 'state-to-subscribers', stepId: 'store-closure' });
    // This prepared explanation includes React source not in the vanilla guide.
    expect(result.status).toBe('unavailable');
    expect(result.citations).toEqual([]);
  });

  it('passes only public topic metadata and reviewed source to the provider', async () => {
    const provider = vi.fn(async (request: ProviderRequest) => ({ status: 'answered', answer: 'The cited source connects this walkthrough.', citationIds: [request.evidence[0].evidenceId], limitations: [] }));
    const result = await answerQuestion({ ...question(), question: 'How do these source steps connect?' }, { provider });
    expect(result.status).toBe('answered');
    const request = provider.mock.calls[0][0];
    expect(request.walkthrough).toMatchObject(reactGuide);
    expect(Object.keys(request.walkthrough!).sort()).toEqual(['guideId', 'stepId', 'stepTitle', 'title']);
    expect(request.evidence.every(item => item.snapshotId === getSnapshot().snapshotId)).toBe(true);
  });

  it('withholds a provider citation outside supplied walkthrough evidence', async () => {
    const result = await answerQuestion({ ...question(), question: 'Explain the flow' }, {
      provider: async () => ({ status: 'answered', answer: 'Unsupported output.', citationIds: ['invented-guide-citation'], limitations: [] }),
    });
    expect(result.status).toBe('evidence_gap');
    expect(result.citations).toEqual([]);
    expect(result.answer).not.toContain('Unsupported output');
  });

  it('isolates cache entries by active step even when evidence order is identical', async () => {
    const provider = vi.fn(async (request: ProviderRequest) => ({ status: 'answered', answer: `Topic: ${request.walkthrough?.stepTitle}`, citationIds: [request.evidence[0].evidenceId], limitations: [] }));
    const input = { question: 'Explain this source flow', snapshotId: getSnapshot().snapshotId, guideId: 'state-to-subscribers', stepId: 'predict-identity' };
    const options = { provider, useCache: true };
    await answerQuestion(input, options);
    expect((await answerQuestion(input, options)).cached).toBe(true);
    const other = { ...input, stepId: 'find-change-point' };
    expect(retrieveContext(input).evidence.map(e => e.evidenceId)).toEqual(retrieveContext(other).evidence.map(e => e.evidenceId));
    expect((await answerQuestion(other, options)).cached).toBeUndefined();
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it('sends validated walkthrough metadata inside the provider data envelope', async () => {
    const context = retrieveContext(question());
    const fakeFetch = vi.fn(async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ status: 'evidence_gap', answer: 'Not established.', citationIds: [], limitations: [] }) }] } }] }));
    await createGeminiProvider({ apiKey: 'test-key', fetch: fakeFetch as typeof fetch })({ input: question(), evidence: context.evidence, walkthrough: context.walkthrough });
    const init = (fakeFetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    const payload = JSON.parse(init.body as string);
    const data = JSON.parse(payload.contents[0].parts[0].text);
    expect(data.walkthrough).toEqual(context.walkthrough);
    expect(payload.systemInstruction.parts[0].text).toContain('not additional factual evidence');
  });

  it('accepts walkthrough scope at the HTTP boundary and rejects an invalid step', async () => {
    const send = (body: unknown) => POST(new Request('http://localhost/api/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    const response = await send(question());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'answered', mode: 'reviewed' });
    const invalid = await send({ ...question(), stepId: 'not-a-step' });
    expect(invalid.status).toBe(404);
    expect(await invalid.json()).toMatchObject({ error: { code: 'STEP_NOT_FOUND' } });
  });
});
