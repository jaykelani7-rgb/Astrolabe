import 'server-only';
export const GEMINI_TOTAL_BUDGET_MS = 45_000;
export const GEMINI_MAX_ATTEMPTS = 2;
export const GEMINI_BACKOFF_MS = 500;
/** Selected-model policy; never chooses a different model or provider. */
export function geminiGenerationSettings(model: string) {
  return {
    maxOutputTokens: 4096,
    ...(/^gemini-[34](?:[.-])/.test(model) && !/(image|tts)/.test(model)
      ? { thinkingConfig: { thinkingLevel: 'LOW', includeThoughts: false } }
      : /^gemini-2\.5-/.test(model) && !/(image|tts)/.test(model)
        ? { thinkingConfig: { thinkingBudget: 512, includeThoughts: false } }
        : {}),
  };
}
