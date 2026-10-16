import "server-only";
import { ProviderUnavailableError, SYSTEM_INSTRUCTION, readBoundedJson, type AnswerProvider } from "./shared";
export { ProviderUnavailableError, type AnswerProvider, type ProviderRequest } from "./shared";
import { modelJsonSchema } from "./schema";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export const AI_TIMEOUT_MS = 12_000;

export function createGeminiProvider(
  options: {
    apiKey?: string;
    model?: string;
    timeoutMs?: number;
    fetch?: typeof fetch;
  } = {},
): AnswerProvider {
  return async ({ input, evidence, walkthrough }) => {
    const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey?.trim()) throw new ProviderUnavailableError("missing_key");
    const model =
      options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
    if (!/^[a-zA-Z0-9.-]{1,80}$/.test(model))
      throw new ProviderUnavailableError("provider_error");
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ProviderUnavailableError("timeout"));
      }, options.timeoutMs ?? AI_TIMEOUT_MS);
    });
    const generate = async () => {
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
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: JSON.stringify({
                      question: input.question,
                      depth: input.depth ?? "beginner",
                      snapshotId: input.snapshotId,
                      ...(walkthrough ? { walkthrough } : {}),
                      evidence: evidence.map(
                        ({ evidenceId, fileId, startLine, endLine, text }) => ({
                          evidenceId,
                          fileId,
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
              temperature: 0.1,
              maxOutputTokens: 1800,
              responseFormat: {
                text: { mimeType: "application/json", schema: modelJsonSchema },
              },
            },
          }),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new ProviderUnavailableError("provider_error", response.status);
      }
      const payload = (await readBoundedJson(response)) as {
        candidates?: {
          finishReason?: string;
          content?: { parts?: { text?: string; thought?: boolean }[] };
        }[];
      };
      const candidate = payload.candidates?.[0];
      if (candidate?.finishReason !== "STOP")
        throw new ProviderUnavailableError("invalid_output");
      const text =
        candidate.content?.parts
          ?.filter((part) => !part.thought)
          .map((part) => part.text ?? "")
          .join("") ?? "";
      try {
        return JSON.parse(text);
      } catch {
        throw new ProviderUnavailableError("invalid_output");
      }
    };
    try {
      return await Promise.race([generate(), timeout]);
    } catch (error) {
      if (error instanceof ProviderUnavailableError) throw error;
      throw new ProviderUnavailableError(
        controller.signal.aborted ? "timeout" : "provider_error",
      );
    } finally {
      clearTimeout(timer);
    }
  };
}
