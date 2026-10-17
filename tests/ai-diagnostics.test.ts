import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { captureAiDiagnostics, recordAiDiagnostic, MAX_DIAGNOSTIC_BYTES } from '@/lib/ai/diagnostics';
import { createGeminiProvider } from '@/lib/ai/gemini';
import { answerQuestion } from '@/lib/ai';
import { getSnapshot, evidenceForRange, listFiles } from '@/lib/repository';
vi.stubEnv('MENTOR_DB_PATH', ':memory:');
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const input = { snapshotId: 'zustand-0ea8be27db13', question: 'Inspect the identity guard inside setState.', scope: 'repository' as const };
const response = (text: string, finishReason = 'STOP') => Response.json({ candidates: [{ finishReason, content: { parts: [{ thought: true, text: 'PRIVATE REASONING' }, { text }] } }], usageMetadata: { promptTokenCount: 100, thoughtsTokenCount: 20, candidatesTokenCount: 30 } });

describe('private categorized Gemini diagnostics', () => {
  it.each([
    ['http_failure', () => new Response('PRIVATE ERROR', { status: 400 })],
    ['missing_candidate', () => Response.json({})],
    ['finish_reason', () => response('{', 'MAX_TOKENS')],
    ['oversized_response', () => new Response('x'.repeat(64_001))],
    ['invalid_json', () => new Response('invalid envelope')],
    ['invalid_json', () => response('invalid candidate JSON')],
    ['structured_validation', () => response('{"status":"answered"}')],
  ] as const)('distinguishes %s without exposing provider data', async (category, makeResponse) => {
    const fetch = vi.fn(async () => makeResponse());
    const provider = createGeminiProvider({ apiKey: 'test-secret-only', fetch: fetch as typeof globalThis.fetch });
    const { value, diagnostics } = await captureAiDiagnostics(() => answerQuestion(input, { prepared: false, useCache: false, provider }));
    expect(value.status).not.toBe('answered');
    expect(diagnostics.some(event => event.category === category)).toBe(true);
    expect(diagnostics.filter(event => event.operation === 'request')).toHaveLength(1);
    expect(JSON.stringify(diagnostics)).not.toMatch(/PRIVATE|test-secret-only|identity guard|candidates"/);
  });
  it('records token/finish metadata and supplied source paths, excluding thought text', async () => {
    const file = listFiles().find(file => file.path === 'src/vanilla.ts')!;
    const evidence = evidenceForRange(file.fileId, 66, 81);
    const fetch = vi.fn(async () => response('{"status":"evidence_gap","blocks":[{"text":"Unknown.","kind":"unknown","evidenceIds":[]}],"limitations":[]}'));
    const { value, diagnostics } = await captureAiDiagnostics(() => createGeminiProvider({ apiKey: 'test', fetch: fetch as typeof globalThis.fetch })({ input, evidence: [evidence], sourcePaths: { [file.fileId]: file.path } }));
    expect(value).toHaveProperty('status', 'evidence_gap');
    expect(diagnostics).toContainEqual(expect.objectContaining({ finishReason: 'STOP', thoughtTokens: 20, outputTokens: 30, promptTokens: 100 }));
    const request = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(JSON.parse(request.body as string).contents[0].parts[0].text).evidence[0].path).toBe(file.path);
    expect(JSON.stringify(value)).not.toContain('PRIVATE');
  });
  it('retries only a transient HTTP response, with capped attempts and unchanged format', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(response('{}'));
    const promise = captureAiDiagnostics(() => createGeminiProvider({ apiKey: 'test', timeoutMs: 2000, fetch })({ input, evidence: [] }));
    await vi.advanceTimersByTimeAsync(501);
    const result = await promise;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.diagnostics.filter(event => event.operation === 'request')).toHaveLength(2);
    expect(result.diagnostics.some(event => event.httpStatus === 503)).toBe(true);
  });
  it('keeps a total deadline even when transport ignores AbortSignal', async () => {
    vi.useFakeTimers();
    const provider = createGeminiProvider({ apiKey: 'test', timeoutMs: 50, fetch: (() => new Promise(() => {})) as typeof fetch });
    const pending = captureAiDiagnostics(() => answerQuestion(input, { prepared: false, useCache: false, provider }));
    await vi.advanceTimersByTimeAsync(51);
    expect((await pending).diagnostics.some(event => event.category === 'timeout')).toBe(true);
  });
  it('isolates overlapping request collectors and bounds private on-disk retention', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mentor-ai-diagnostics-'));
    const old = { enabled: process.env.MENTOR_AI_DIAGNOSTICS, dir: process.env.MENTOR_DATA_DIR };
    try {
      process.env.MENTOR_AI_DIAGNOSTICS = '1'; process.env.MENTOR_DATA_DIR = dir;
      const [a, b] = await Promise.all([captureAiDiagnostics(async () => { await Promise.resolve(); recordAiDiagnostic({ provider: 'gemini', operation: 'request', model: 'first' }); }), captureAiDiagnostics(async () => recordAiDiagnostic({ provider: 'gemini', operation: 'request', model: 'second' }))]);
      expect(a.diagnostics.map(e => e.model)).toEqual(['first']); expect(b.diagnostics.map(e => e.model)).toEqual(['second']);
      for (let n = 0; n < 1100; n++) recordAiDiagnostic({ provider: 'gemini', operation: 'result', durationMs: n, finishReason: 'PRIVATE untrusted text', ...{ message: 'PRIVATE', prompt: 'PRIVATE', apiKey: 'PRIVATE' } } as Parameters<typeof recordAiDiagnostic>[0]);
      const files = readdirSync(path.join(dir, 'ai-diagnostics'));
      expect(files.length).toBeLessThanOrEqual(2);
      for (const file of files) { const full = path.join(dir, 'ai-diagnostics', file); expect(statSync(full).size).toBeLessThanOrEqual(MAX_DIAGNOSTIC_BYTES); expect(readFileSync(full, 'utf8')).not.toContain('PRIVATE'); }
    } finally {
      for (const [name, value] of [['MENTOR_AI_DIAGNOSTICS', old.enabled], ['MENTOR_DATA_DIR', old.dir]] as const) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
