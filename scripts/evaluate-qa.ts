import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { retrieveContext } from '../src/lib/retrieval';
import { performance } from 'node:perf_hooks';
import { answerQuestion } from '../src/lib/ai';
import { providerConfiguration } from '../src/lib/ai/provider';
import { getSnapshot, getSource } from '../src/lib/repository';
import { evaluationProvenance } from '../src/lib/ai/provenance';
import { captureAiDiagnostics } from '../src/lib/ai/diagnostics';

type EvaluationQuestion = { id: string; split: 'development' | 'held_out'; question: string; expectation: string; sourcePaths: string[]; preparedMatch?: boolean };

async function main() {
  const includeHeldOut = process.argv.includes('--held-out');
  const live = process.argv.includes('--live');
  if (!live) { process.env.AI_PROVIDER = 'gemini'; delete process.env.GEMINI_API_KEY; }
  const bank = JSON.parse(readFileSync(resolve('docs/questions.json'), 'utf8')) as { snapshotId: string; commitSha: string; questions: EvaluationQuestion[] };
  const snapshot = getSnapshot();
  if (snapshot.snapshotId !== bank.snapshotId || snapshot.commitSha !== bank.commitSha) throw new Error('Evaluation bank and prepared snapshot do not match.');
  const questions = bank.questions.filter((question) => includeHeldOut || question.split === 'development');
  const results = [];
  const configuration = providerConfiguration();
  const provenance = evaluationProvenance();
  const implementationHashes = provenance.implementationHashes;
  for (const question of questions) {
    const context = retrieveContext({ question: question.question, snapshotId: bank.snapshotId, depth: 'developer' });
    const retrievedContext = context.evidence.map(e => ({ evidenceId: e.evidenceId, path: getSource(e.fileId, bank.snapshotId).file.path, startLine: e.startLine, endLine: e.endLine, contentHash: e.contentHash, characters: e.text.length }));
    const started = performance.now();
    const { value: response, diagnostics } = await captureAiDiagnostics(() => answerQuestion({ question: question.question, snapshotId: bank.snapshotId, depth: 'developer' }, { useCache: false, prepared: !live }));
    const latencyMs = Number((performance.now() - started).toFixed(2));
    const referenceValidity = response.citations.length ? response.citations.every((citation) => {
      const source = getSource(citation.fileId, bank.snapshotId);
      return citation.snapshotId === bank.snapshotId && citation.contentHash === source.file.contentHash
        && citation.startLine >= 1 && citation.endLine <= source.lines.length
        && citation.text === source.lines.slice(citation.startLine - 1, citation.endLine).join('\n');
    }) : null;
    results.push({ id: question.id, retrievedContext, split: question.split, question: question.question, expectation: question.expectation, latencyMs, referenceValidity, diagnostics, actualProviderRequests: diagnostics.filter(event => event.operation === 'request').length,
      citedExpectedPath: response.citations.some((citation) => question.sourcePaths.includes(getSource(citation.fileId).file.path)),
      response, humanClaimSupport: 'pending', reviewerNotes: '' });
  }
  const times = results.map((result) => result.latencyMs).sort((a, b) => a - b);
  const report = {
    generatedAt: new Date().toISOString(), snapshotId: snapshot.snapshotId, commitSha: snapshot.commitSha,
    configuration: { ...provenance, implementationHashes, provider: configuration.provider, model: configuration.model, requestedLive: live, providerConfigured: configuration.configured, credentialPresent: Boolean(process.env.GEMINI_API_KEY), includedHeldOut: includeHeldOut, preparedMatching: !live, cache: false },
    summary: {
      questionsRun: results.length,
      answeredReviewed: results.filter((result) => result.response.status === 'answered' && result.response.mode === 'reviewed').length,
      answeredLive: results.filter((result) => result.response.status === 'answered' && result.response.mode === 'live').length,
      evidenceGaps: results.filter((result) => result.response.status === 'evidence_gap').length,
      unavailable: results.filter((result) => result.response.status === 'unavailable').length,
      responsesWithReferences: results.filter((result) => result.referenceValidity !== null).length,
      invalidReferences: results.filter((result) => result.referenceValidity === false).length,
      medianLatencyMs: times.length ? times[Math.floor(times.length / 2)] : null,
      p95LatencyMs: times.length ? times[Math.min(times.length - 1, Math.ceil(times.length * .95) - 1)] : null,
    },
    limitations: [
      'Reference validity checks IDs, snapshot, source hash, ranges and exact text. It does not establish semantic claim support.',
      'Independent human claim review is pending.',
      ...(includeHeldOut ? ['Held-out questions were included in this run; preserve these responses for an independent reviewer.'] : ['Eight held-out questions were excluded from this implementation run.']),
      ...(!live || !configuration.configured ? ['Live answer quality was not measured because this run used prepared mode or no provider was configured.'] : []),
      'The 6–8 participant comparison is pending. No learning-effectiveness claim is established.',
    ], results,
  };
  if (live) mkdirSync(resolve('.data/verification'), { recursive: true });
  const output = resolve(live ? `.data/verification/${includeHeldOut ? 'held-out' : 'development'}-live-${new Date().toISOString().replace(/[:.]/g, '-')}.json` : includeHeldOut ? 'docs/qa-held-out-evaluation.json' : 'docs/qa-evaluation.json');
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, ...report.summary }, null, 2));
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Evaluation failed'); process.exitCode = 1; });
