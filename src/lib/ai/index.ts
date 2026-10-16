import 'server-only';
import type { QuestionInput, QaResponse } from '@/contracts';
import { questionSchema } from '@/contracts';
import { defaultRepository, retrieveContext, validateEvidence, type EvidenceRepository } from '@/lib/retrieval';
import { createGeminiProvider, DEFAULT_GEMINI_MODEL, ProviderUnavailableError, type AnswerProvider } from './gemini';
import { modelAnswerSchema } from './schema';
import { reviewedAnswer } from './reviewed';

const LIVE_LIMITATION = 'Live AI output: citation structure is validated, but that does not prove every claim is correct. Verify the source.';
const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { expires: number; response: QaResponse }>();

export interface AnswerOptions {
  repository?: EvidenceRepository;
  provider?: AnswerProvider;
  useCache?: boolean;
  prepared?: boolean;
}

export function clearAnswerCache() { cache.clear(); }

function gap(limitations: string[], answer = 'The selected source does not provide enough evidence to answer this question. Try a source-level question or select a relevant file and range.'): QaResponse {
  return { status: 'evidence_gap', mode: 'live', answer, citations: [], limitations };
}

export async function answerQuestion(rawInput: QuestionInput, options: AnswerOptions = {}): Promise<QaResponse> {
  const input = questionSchema.parse(rawInput);
  const store = options.repository ?? defaultRepository;
  const context = retrieveContext(input, store);
  // A prepared answer only matches an explicit known question and the same source context.
  if (options.prepared !== false) {
    const prepared = reviewedAnswer(input, store);
    const withinWalkthrough = prepared?.citations.every((citation) => context.evidence.some((range) =>
      range.fileId === citation.fileId && range.startLine <= citation.startLine && range.endLine >= citation.endLine));
    if (prepared && (!context.walkthrough || withinWalkthrough)) {
      return context.walkthrough ? { ...prepared, limitations: [...prepared.limitations, ...context.limitations] } : prepared;
    }
  }
  if (!context.evidence.length) return gap(context.limitations);

  const cacheKey = JSON.stringify({
    snapshot: input.snapshotId, file: input.fileId ?? '', start: input.startLine ?? null, end: input.endLine ?? null,
    depth: input.depth ?? 'beginner', question: input.question.trim().toLowerCase(),
    guide: input.guideId ?? '', step: input.stepId ?? '',
    model: process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL,
    configured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    evidence: context.evidence.map((item) => [item.evidenceId, item.contentHash]),
  });
  const useCache = options.useCache ?? !options.provider;
  const now = Date.now();
  if (useCache) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > now) return { ...structuredClone(cached.response), cached: true };
    if (cached) cache.delete(cacheKey);
  }
  try {
    const raw = await (options.provider ?? createGeminiProvider())({ input, evidence: context.evidence, walkthrough: context.walkthrough });
    const parsed = modelAnswerSchema.safeParse(raw);
    if (!parsed.success) return gap([...context.limitations, 'The AI response failed structured validation and was withheld.']);
    const model = parsed.data;
    if (model.status === 'evidence_gap') return gap([...context.limitations, ...model.limitations], model.answer);
    if (!model.citationIds.length) return gap([...context.limitations, 'The AI supplied no source citations; its answer was withheld.']);
    const allowed = new Map(context.evidence.map((item) => [item.evidenceId, item]));
    if (model.citationIds.some((id) => !allowed.has(id))) return gap([...context.limitations, 'The AI referenced evidence outside this question; its answer was withheld.']);
    const citations = [...new Set(model.citationIds)].map((id) => validateEvidence(allowed.get(id)!, input.snapshotId, store));
    const result: QaResponse = {
      status: 'answered', mode: 'live', answer: model.answer, citations,
      limitations: [...context.limitations, ...model.limitations, LIVE_LIMITATION],
    };
    if (useCache) {
      for (const [key, value] of cache) if (value.expires <= now) cache.delete(key);
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, { expires: now + CACHE_TTL_MS, response: structuredClone(result) });
    }
    return result;
  } catch (error) {
    const reason = error instanceof ProviderUnavailableError ? error.reason : 'provider_error';
    return {
      status: 'unavailable', mode: 'live', citations: [],
      answer: reason === 'missing_key'
        ? 'Live Q&A is unavailable because no server-side Gemini credential is configured. Prepared walkthroughs, tasks, and known prepared questions remain available.'
        : reason === 'timeout' ? 'The AI request timed out. Try again or continue with the prepared learning content.'
          : 'The AI service could not provide a verified response. Try again or continue with the prepared learning content.',
      limitations: [...context.limitations, reason === 'missing_key' ? 'GEMINI_API_KEY must be configured on the server for live Q&A.' : 'Provider failure details are intentionally omitted from the public response.'],
    };
  }
}
