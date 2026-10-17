import 'server-only';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { providerConfiguration } from './provider';
import { GEMINI_TOTAL_BUDGET_MS, GEMINI_MAX_ATTEMPTS, GEMINI_BACKOFF_MS, geminiGenerationSettings } from './generation';
export function evaluationProvenance() {
  const configuration = providerConfiguration();
  const paths = ['src/lib/ai/index.ts', 'src/lib/ai/gemini.ts', 'src/lib/ai/provider.ts', 'src/lib/ai/schema.ts', 'src/lib/ai/shared.ts', 'src/lib/ai/mechanisms.ts', 'src/lib/ai/generation.ts', 'src/lib/ai/diagnostics.ts', 'src/lib/ai/local.ts', 'src/lib/ai/verification.ts', 'src/lib/retrieval/index.ts', 'src/lib/repository/index.ts', 'scripts/verify-live-qa.ts', 'scripts/evaluate-qa.ts'];
  const implementationHashes = Object.fromEntries(paths.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
  let gitHead: string | null = null, workingTreeDirty: boolean | null = null;
  try { gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(); workingTreeDirty = !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', windowsHide: true }).trim(); } catch {}
  return { gitHead, workingTreeDirty, node: process.version, implementationHashes,
    provider: ['gemini', 'lmstudio', 'disabled'].includes(configuration.provider) ? configuration.provider : 'invalid',
    model: /^[a-zA-Z0-9._-]{1,80}$/.test(configuration.model) && !configuration.model.startsWith('AIza') ? configuration.model : 'invalid',
    generation: configuration.provider === 'gemini' ? { ...geminiGenerationSettings(configuration.model), responseFormat: 'APPLICATION_JSON', maxBlocks: 4, maxBlockCharacters: 1400, maxLimitations: 3, totalBudgetMs: GEMINI_TOTAL_BUDGET_MS, maxAttempts: GEMINI_MAX_ATTEMPTS, backoffMs: GEMINI_BACKOFF_MS, maxResponseBytes: 64000 } : { maxOutputTokens: 1200, maxBlocks: 3, totalBudgetMs: 60000 },
  };
}
