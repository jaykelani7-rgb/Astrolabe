import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { appendFileSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

export type FailureCategory = 'http_failure' | 'timeout' | 'missing_candidate' | 'finish_reason' |
  'oversized_response' | 'empty_body' | 'invalid_json' | 'structured_validation' |
  'citation_validation' | 'network_failure' | 'missing_credential';
export interface AiDiagnostic {
  provider: 'gemini' | 'lmstudio' | 'pipeline';
  operation: 'request' | 'result' | 'validation';
  category?: FailureCategory;
  model?: string;
  attempt?: number;
  durationMs?: number;
  httpStatus?: number;
  finishReason?: string;
  responseBytes?: number;
  promptTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
  totalTokens?: number;
  issueCodes?: string[];
}
const context = new AsyncLocalStorage<AiDiagnostic[]>();
const categories = new Set<FailureCategory>(['http_failure', 'timeout', 'missing_candidate', 'finish_reason',
  'oversized_response', 'empty_body', 'invalid_json', 'structured_validation', 'citation_validation', 'network_failure', 'missing_credential']);
const issueCodes = new Set(['invalid_type', 'too_big', 'too_small', 'invalid_format', 'not_multiple_of', 'unrecognized_keys',
  'invalid_union', 'invalid_key', 'invalid_element', 'invalid_value', 'custom']);
export const MAX_DIAGNOSTIC_BYTES = 65_536;

/** Explicit allowlist: never accept messages, headers, prompts, source, output or thought text. */
export function recordAiDiagnostic(input: AiDiagnostic): void {
  if (!['gemini', 'lmstudio', 'pipeline'].includes(input.provider) || !['request', 'result', 'validation'].includes(input.operation)) return;
  const safe: AiDiagnostic = { provider: input.provider, operation: input.operation };
  if (input.category && categories.has(input.category)) safe.category = input.category;
  if (input.model && /^[a-zA-Z0-9._-]{1,80}$/.test(input.model) && !input.model.startsWith('AIza')) safe.model = input.model;
  if (input.finishReason) safe.finishReason = /^[A-Z_]{1,48}$/.test(input.finishReason) ? input.finishReason : 'OTHER';
  for (const key of ['attempt', 'durationMs', 'httpStatus', 'responseBytes', 'promptTokens', 'outputTokens', 'thoughtTokens', 'totalTokens'] as const) {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e9) safe[key] = Math.round(value);
  }
  if (input.issueCodes) safe.issueCodes = [...new Set(input.issueCodes.filter(code => issueCodes.has(code)))].slice(0, 8);
  const events = context.getStore();
  if (events && events.length < 128) events.push(safe);
  if (process.env.MENTOR_AI_DIAGNOSTICS !== '1') return;
  try {
    const directory = path.resolve(process.env.MENTOR_DATA_DIR ?? '.data', 'ai-diagnostics');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (lstatSync(directory).isSymbolicLink()) return;
    const file = path.join(directory, 'events.jsonl'), previous = path.join(directory, 'events.previous.jsonl');
    if ([file, previous].some(name => existsSync(name) && lstatSync(name).isSymbolicLink())) return;
    const line = JSON.stringify({ recordedAt: new Date().toISOString(), ...safe }) + '\n';
    if (existsSync(file) && statSync(file).size + Buffer.byteLength(line) > MAX_DIAGNOSTIC_BYTES) {
      rmSync(previous, { force: true });
      renameSync(file, previous);
    }
    appendFileSync(file, line, { mode: 0o600 });
  } catch { /* Private diagnostics must never break an otherwise valid answer. */ }
}

export async function captureAiDiagnostics<T>(action: () => Promise<T>) {
  const diagnostics: AiDiagnostic[] = [];
  const value = await context.run(diagnostics, action);
  return { value, diagnostics };
}
