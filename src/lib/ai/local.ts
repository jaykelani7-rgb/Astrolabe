import 'server-only';
import { modelJsonSchema } from './schema';
import { ProviderUnavailableError, SYSTEM_INSTRUCTION, readBoundedJson, type AnswerProvider } from './shared';
import { sourceMechanisms } from './mechanisms';
import { recordAiDiagnostic } from './diagnostics';

export const DEFAULT_LOCAL_MODEL = 'astrolabe-coder';
export const DEFAULT_LOCAL_BASE_URL = 'http://127.0.0.1:1234/v1';
export const LOCAL_AI_TIMEOUT_MS = 60_000;

// This adapter deliberately supports a server on this machine only.
export function localBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.search || url.hash || !/^\/v1\/?$/.test(url.pathname)) {
      throw new Error('Invalid local endpoint');
    }
    return url.href.replace(/\/$/, '');
  } catch { throw new ProviderUnavailableError('invalid_configuration'); }
}

export function createLocalProvider(options: {
  baseUrl?: string; model?: string; timeoutMs?: number; fetch?: typeof fetch;
} = {}): AnswerProvider {
  return async ({ input, evidence, walkthrough, sourcePaths }) => {
    const baseUrl = localBaseUrl(options.baseUrl ?? process.env.LMSTUDIO_BASE_URL ?? DEFAULT_LOCAL_BASE_URL);
    const model = options.model ?? process.env.LMSTUDIO_MODEL ?? DEFAULT_LOCAL_MODEL;
    if (!model.trim() || model.length > 200) throw new ProviderUnavailableError('invalid_configuration');
    const responseSchema = structuredClone(modelJsonSchema);
    Object.assign(responseSchema.properties.blocks.items.properties.evidenceIds.items, { enum: evidence.map((item) => item.evidenceId) });
    Object.assign(responseSchema.properties.blocks, { maxItems: 3 });
    Object.assign(responseSchema.properties.blocks.items.properties.text, { minLength: 1, maxLength: 1200 });
    // The server supplies known scope and reliability limits instead of generated caveats.
    Object.assign(responseSchema.properties.limitations, { maxItems: 0 });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new ProviderUnavailableError('timeout')); }, options.timeoutMs ?? LOCAL_AI_TIMEOUT_MS);
    });
    const generate = async () => {
      recordAiDiagnostic({ provider: 'lmstudio', operation: 'request', model });
      const response = await (options.fetch ?? fetch)(`${baseUrl}/chat/completions`, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_INSTRUCTION + "\nFor this local response, use limitations: []. The server adds known scope and reliability limits. Use one to three focused blocks, at most 180 words total, to explain the relevant conditions, data flow and result. Keep each claim near its own supporting references. Use observed for visible operations, inferred only for a requested interpretation, or unknown for missing evidence. Do not add background advice or related APIs. Unknown blocks have no evidenceIds. Do not speculate about missing implementations. If the evidence cannot answer the question, use evidence_gap." },
            { role: 'user', content: JSON.stringify({
              question: input.question, depth: input.depth ?? 'beginner', snapshotId: input.snapshotId,
              ...(walkthrough ? { walkthrough } : {}),
              sourceMechanisms: sourceMechanisms(evidence),
              evidence: evidence.map(({ evidenceId, fileId, startLine, endLine, text }) => ({ evidenceId, fileId, path: sourcePaths?.[fileId], startLine, endLine, text })),
            }) },
          ],
          temperature: 0, presence_penalty: 0, frequency_penalty: 0, repeat_penalty: 1, max_tokens: 1200, stream: false, reasoning_effort: 'none',
          response_format: { type: 'json_schema', json_schema: { name: 'mentor_answer', strict: true, schema: responseSchema } },
        }),
      });
      if (!response.ok) { recordAiDiagnostic({ provider: 'lmstudio', operation: 'result', category: 'http_failure', httpStatus: response.status }); await response.body?.cancel(); throw new ProviderUnavailableError('provider_error', response.status); }
      const payload = await readBoundedJson(response) as { choices?: { finish_reason?: string; message?: { content?: string; refusal?: string } }[] };
      const choice = payload.choices?.[0];
      if (choice?.finish_reason !== 'stop' || choice.message?.refusal || typeof choice.message?.content !== 'string') {
        throw new ProviderUnavailableError('invalid_output');
      }
      try { return JSON.parse(choice.message.content); }
      catch { throw new ProviderUnavailableError('invalid_output'); }
    };
    try { return await Promise.race([generate(), timeout]); }
    catch (error) {
      if (error instanceof ProviderUnavailableError) throw error;
      throw new ProviderUnavailableError(controller.signal.aborted ? 'timeout' : 'provider_error');
    } finally { clearTimeout(timer); }
  };
}
