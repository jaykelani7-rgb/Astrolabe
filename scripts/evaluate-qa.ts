import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { answerQuestion } from '../src/lib/ai';
import { getSnapshot, getSource } from '../src/lib/repository';

type EvaluationQuestion = { id: string; split: 'development' | 'held_out'; question: string; expectation: string; sourcePaths: string[]; preparedMatch?: boolean };

async function main() {
  const includeHeldOut = process.argv.includes('--held-out');
  const live = process.argv.includes('--live');
  if (!live) delete process.env.GEMINI_API_KEY;
  const bank = JSON.parse(readFileSync(resolve('docs/questions.json'), 'utf8')) as { snapshotId: string; commitSha: string; questions: EvaluationQuestion[] };
  const snapshot = getSnapshot();
  if (snapshot.snapshotId !== bank.snapshotId || snapshot.commitSha !== bank.commitSha) throw new Error('Evaluation bank and prepared snapshot do not match.');
  const questions = bank.questions.filter((question) => includeHeldOut || question.split === 'development');
  const results = [];
  for (const question of questions) {
    const started = performance.now();
    const response = await answerQuestion({ question: question.question, snapshotId: bank.snapshotId, depth: 'developer' }, { useCache: false, prepared: !live });
    const latencyMs = Number((performance.now() - started).toFixed(2));
    const referenceValidity = response.citations.length ? response.citations.every((citation) => {
      const source = getSource(citation.fileId, bank.snapshotId);
      return citation.snapshotId === bank.snapshotId && citation.contentHash === source.file.contentHash
        && citation.startLine >= 1 && citation.endLine <= source.lines.length
        && citation.text === source.lines.slice(citation.startLine - 1, citation.endLine).join('\n');
    }) : null;
    results.push({ id: question.id, split: question.split, question: question.question, expectation: question.expectation, latencyMs, referenceValidity,
      citedExpectedPath: response.citations.some((citation) => question.sourcePaths.includes(getSource(citation.fileId).file.path)),
      response, humanClaimSupport: 'pending', reviewerNotes: '' });
  }
  const times = results.map((result) => result.latencyMs).sort((a, b) => a - b);
  const report = {
    generatedAt: new Date().toISOString(), snapshotId: snapshot.snapshotId, commitSha: snapshot.commitSha,
    configuration: { model: process.env.GEMINI_MODEL ?? 'gemini-3.8-flash', requestedLive: live, credentialPresent: Boolean(process.env.GEMINI_API_KEY), includedHeldOut: includeHeldOut, cache: false },
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
      ...(!live || !process.env.GEMINI_API_KEY ? ['Live answer quality and network latency were not measured because this run used prepared mode or no credential.'] : []),
      'The 6–8 participant comparison is pending. No learning-effectiveness claim is established.',
    ], results,
  };
  const output = resolve(includeHeldOut ? 'docs/qa-held-out-evaluation.json' : 'docs/qa-evaluation.json');
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, ...report.summary }, null, 2));
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Evaluation failed'); process.exitCode = 1; });
