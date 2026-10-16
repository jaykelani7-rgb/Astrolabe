import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalProvider } from '@/lib/ai/local';
import { createConfiguredProvider, providerConfiguration } from '@/lib/ai/provider';
import { answerQuestion, clearAnswerCache } from '@/lib/ai';
import { getSnapshot, listFiles } from '@/lib/repository';
import type { ProviderRequest } from '@/lib/ai/shared';

const request: ProviderRequest = {
  input: { snapshotId: 'snapshot-a', question: 'Explain the listener cleanup' },
  evidence: [{ evidenceId: 'evidence-a', snapshotId: 'snapshot-a', fileId: 'file-a', startLine: 1, endLine: 1, text: 'listeners.delete(listener)', contentHash: 'hash-a' }],
};
const answer = { status: 'answered', blocks: [{ text: 'The listener is removed.', kind: 'observed', evidenceIds: ['evidence-a'] }], limitations: [] };
const completion = (output: unknown) => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] });

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); clearAnswerCache(); });

describe('local AI adapter', () => {
  it('requests structured final output with the same untrusted source envelope and no cloud credential', async () => {
    const fetchMock = vi.fn(async () => completion(answer));
    expect(await createLocalProvider({ fetch: fetchMock as typeof fetch })({ ...request, sourcePaths: { 'file-a': 'src/store.ts' } })).toEqual(answer);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:1234/v1/chat/completions');
    expect(init.redirect).toBe('error');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    const body = JSON.parse(init.body as string);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.properties.blocks.items.properties.evidenceIds.items.enum).toEqual(['evidence-a']);
    expect(body.response_format.json_schema.schema.properties.limitations.maxItems).toBe(0);
    expect(JSON.parse(body.messages[1].content).evidence[0].path).toBe('src/store.ts');
    expect(body.reasoning_effort).toBe('none');
    expect(body.messages[0].content).toContain('untrusted data');
    expect(JSON.parse(body.messages[1].content).evidence).toMatchObject(request.evidence.map(({ contentHash, snapshotId, ...evidence }) => evidence));
  });

  it.each(['https://example.com/v1', 'http://192.168.1.2:1234/v1', 'http://127.0.0.1:1234/v1?forward=remote', 'http://user:pass@localhost:1234/v1', 'http://localhost:1234/other'])('rejects nonlocal or ambiguous endpoints before sending source: %s', async (baseUrl) => {
    const fetchMock = vi.fn();
    await expect(createLocalProvider({ baseUrl, fetch: fetchMock })(request)).rejects.toMatchObject({ reason: 'invalid_configuration' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { response: new Response('private diagnostics', { status: 500 }), reason: 'provider_error' },
    { response: new Response('x'.repeat(64_001)), reason: 'invalid_output' },
    { response: Response.json({ choices: [{ finish_reason: 'length', message: { content: JSON.stringify(answer) } }] }), reason: 'invalid_output' },
    { response: Response.json({ choices: [{ finish_reason: 'stop', message: { content: '', reasoning_content: JSON.stringify(answer) } }] }), reason: 'invalid_output' },
  ])('withholds failed, oversized, truncated or reasoning-only output', async ({ response, reason }) => {
    await expect(createLocalProvider({ fetch: (async () => response) as typeof fetch })(request)).rejects.toMatchObject({ reason });
  });

  it('bounds a stalled local service even if fetch ignores cancellation', async () => {
    vi.useFakeTimers();
    const pending = createLocalProvider({ timeoutMs: 50, fetch: (() => new Promise(() => {})) as typeof fetch })(request);
    const expectation = expect(pending).rejects.toMatchObject({ reason: 'timeout' });
    await vi.advanceTimersByTimeAsync(51);
    await expectation;
  });

  it('keeps disabled and unknown providers offline without falling back to Gemini', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('GEMINI_API_KEY', 'unused-test-key');
    for (const provider of ['disabled', 'misspelled']) {
      vi.stubEnv('AI_PROVIDER', provider);
      await expect(createConfiguredProvider()(request)).rejects.toHaveProperty('reason');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('selects the local provider without a key, validates citations and isolates cache by model and provider', async () => {
    vi.stubEnv('MENTOR_DB_PATH', ':memory:');
    vi.stubEnv('AI_PROVIDER', 'lmstudio'); vi.stubEnv('GEMINI_API_KEY', '');
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const data = JSON.parse(JSON.parse(init.body as string).messages[1].content);
      return completion({ ...answer, blocks: [{ ...answer.blocks[0], evidenceIds: [data.evidence[0].evidenceId] }] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const file = listFiles().find((file) => file.path === 'src/vanilla.ts')!;
    const input = { question: 'Explain the storage of listeners', snapshotId: getSnapshot().snapshotId, fileId: file.fileId };
    expect(providerConfiguration().configured).toBe(true);
    expect(await answerQuestion(input)).toMatchObject({ status: 'answered', provider: 'lmstudio' });
    expect((await answerQuestion(input)).cached).toBe(true);
    vi.stubEnv('LMSTUDIO_MODEL', 'second-model');
    expect((await answerQuestion(input)).cached).not.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.stubEnv('AI_PROVIDER', 'disabled');
    expect(await answerQuestion(input)).toMatchObject({ status: 'unavailable' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
