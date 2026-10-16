import 'server-only';
import { createGeminiProvider, DEFAULT_GEMINI_MODEL } from './gemini';
import { createLocalProvider, DEFAULT_LOCAL_BASE_URL, DEFAULT_LOCAL_MODEL, localBaseUrl } from './local';
import { ProviderUnavailableError, type AnswerProvider } from './shared';

export function providerConfiguration() {
  const provider = process.env.AI_PROVIDER?.trim() || 'gemini';
  let localValid = true;
  try { localBaseUrl(process.env.LMSTUDIO_BASE_URL ?? DEFAULT_LOCAL_BASE_URL); } catch { localValid = false; }
  const localModel = process.env.LMSTUDIO_MODEL ?? DEFAULT_LOCAL_MODEL;
  localValid = localValid && !!localModel.trim() && localModel.length <= 200;
  return {
    provider,
    model: provider === 'lmstudio' ? process.env.LMSTUDIO_MODEL ?? DEFAULT_LOCAL_MODEL : process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL,
    baseUrl: provider === 'lmstudio' ? process.env.LMSTUDIO_BASE_URL ?? DEFAULT_LOCAL_BASE_URL : undefined,
    configured: (provider === 'lmstudio' && localValid) || (provider === 'gemini' && Boolean(process.env.GEMINI_API_KEY?.trim())),
  };
}

export function createConfiguredProvider(): AnswerProvider {
  const { provider } = providerConfiguration();
  if (provider === 'lmstudio') return createLocalProvider();
  if (provider === 'gemini') return createGeminiProvider();
  return async () => { throw new ProviderUnavailableError(provider === 'disabled' ? 'disabled' : 'invalid_configuration'); };
}
