import "server-only";
import { ProviderUnavailableError, SYSTEM_INSTRUCTION, readBoundedJson, type AnswerProvider } from "./shared";
export { ProviderUnavailableError, type AnswerProvider, type ProviderRequest } from "./shared";
import { modelJsonSchema } from "./schema";
import { sourceMechanisms } from "./mechanisms";
import { recordAiDiagnostic } from './diagnostics';
import { GEMINI_TOTAL_BUDGET_MS, GEMINI_MAX_ATTEMPTS, GEMINI_BACKOFF_MS, geminiGenerationSettings } from './generation';

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export const AI_TIMEOUT_MS = GEMINI_TOTAL_BUDGET_MS;

export function createGeminiProvider(
  options: {
    apiKey?: string;
    model?: string;
    timeoutMs?: number;
    fetch?: typeof fetch;
  } = {},
): AnswerProvider {
  return async ({ input, evidence, walkthrough, sourcePaths }) => {
    const started = Date.now();
    const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey?.trim()) {
      recordAiDiagnostic({ provider: 'gemini', operation: 'result', category: 'missing_credential' });
      throw new ProviderUnavailableError("missing_key");
    }
    const model =
      options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
    if (!/^[a-zA-Z0-9.-]{1,80}$/.test(model))
      throw new ProviderUnavailableError("provider_error");
    const budget = Number.isFinite(options.timeoutMs) ? Math.max(1, Math.min(options.timeoutMs!, 60_000)) : AI_TIMEOUT_MS;
    const schema = structuredClone(modelJsonSchema);
    Object.assign(schema.properties.blocks, { maxItems: 4 });
    Object.assign(schema.properties.blocks.items.properties.text, { maxLength: 1400 });
    Object.assign(schema.properties.blocks.items.properties.evidenceIds.items, { enum: evidence.map(item => item.evidenceId) });
    Object.assign(schema.properties.limitations, { maxItems: 3 });
    const controller = new AbortController();
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ProviderUnavailableError("timeout"));
      }, budget);
    });
    const generateAttempt = async () => {
      recordAiDiagnostic({ provider: 'gemini', operation: 'request', model, attempt });
      const response = await (options.fetch ?? fetch)(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION + '\nUse at most four concise blocks and 220 words total. Explain the requested mechanism without repeating source excerpts or adding unrelated background. Include only material limitations.' }] },
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: JSON.stringify({
                      question: input.question,
                      depth: input.depth ?? "beginner",
                      snapshotId: input.snapshotId,
                      sourceMechanisms: sourceMechanisms(evidence),
                      ...(walkthrough ? { walkthrough } : {}),
                      evidence: evidence.map(
                        ({ evidenceId, fileId, startLine, endLine, text }) => ({
                          evidenceId,
                          fileId,
                          path: sourcePaths?.[fileId],
                          startLine,
                          endLine,
                          text,
                        }),
                      ),
                    }),
                  },
                ],
              },
            ],
            generationConfig: {
              ...geminiGenerationSettings(model),
              responseFormat: {
                text: { mimeType: "APPLICATION_JSON", schema },
              },
            },
          }),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new ProviderUnavailableError("provider_error", response.status, { category: 'http_failure' });
      }
      let responseBytes = 0;
      const payload = (await readBoundedJson(response, bytes => { responseBytes = bytes; })) as {
        candidates?: {
          finishReason?: string;
          content?: { parts?: { text?: string; thought?: boolean }[] };
        }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number };
      };
      const candidate = payload?.candidates?.[0];
      const usage = payload?.usageMetadata;
      recordAiDiagnostic({ provider: 'gemini', operation: 'result', model, durationMs: Date.now() - started,
        attempt, httpStatus: response.status, finishReason: candidate?.finishReason, responseBytes,
        promptTokens: usage?.promptTokenCount, outputTokens: usage?.candidatesTokenCount,
        thoughtTokens: usage?.thoughtsTokenCount, totalTokens: usage?.totalTokenCount,
        ...(!candidate ? { category: 'missing_candidate' as const } : candidate.finishReason !== 'STOP' ? { category: 'finish_reason' as const } : {}),
      });
      if (!candidate) throw new ProviderUnavailableError('invalid_output', undefined, { category: 'missing_candidate' });
      if (candidate?.finishReason !== "STOP")
        throw new ProviderUnavailableError("invalid_output", undefined, { category: 'finish_reason' });
      const text =
        candidate.content?.parts
          ?.filter((part) => !part.thought)
          .map((part) => part.text ?? "")
          .join("") ?? "";
      try {
        return JSON.parse(text);
      } catch {
        throw new ProviderUnavailableError("invalid_output", undefined, { category: 'invalid_json' });
      }
    };
    const generate = async () => {
      for (attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
        try { return await generateAttempt(); }
        catch (error) {
          const transient = error instanceof ProviderUnavailableError && error.diagnostic?.category === 'http_failure'
            && [429, 500, 502, 503, 504].includes(error.httpStatus ?? 0);
          if (!transient || attempt === GEMINI_MAX_ATTEMPTS || controller.signal.aborted || Date.now() - started + GEMINI_BACKOFF_MS >= budget) throw error;
          recordAiDiagnostic({ provider: 'gemini', operation: 'result', model, attempt, category: 'http_failure', httpStatus: error.httpStatus, durationMs: Date.now() - started });
          await new Promise<void>((resolve, reject) => {
            const abort = () => { clearTimeout(wait); reject(new ProviderUnavailableError('timeout', undefined, { category: 'timeout' })); };
            const wait = setTimeout(() => { controller.signal.removeEventListener('abort', abort); resolve(); }, GEMINI_BACKOFF_MS);
            controller.signal.addEventListener('abort', abort, { once: true });
          });
        }
      }
      throw new ProviderUnavailableError('provider_error');
    };
    try {
      return await Promise.race([generate(), timeout]);
    } catch (error) {
      recordAiDiagnostic({ provider: 'gemini', operation: 'result', model, durationMs: Date.now() - started,
        attempt,
        category: controller.signal.aborted || (error instanceof ProviderUnavailableError && error.reason === 'timeout') ? 'timeout'
          : error instanceof ProviderUnavailableError ? error.diagnostic?.category ?? 'network_failure' : 'network_failure',
        ...(error instanceof ProviderUnavailableError ? { httpStatus: error.httpStatus, responseBytes: error.diagnostic?.responseBytes } : {}),
      });
      if (error instanceof ProviderUnavailableError) throw error;
      throw new ProviderUnavailableError(
        controller.signal.aborted ? "timeout" : "provider_error",
      );
    } finally {
      clearTimeout(timer);
    }
  };
}
