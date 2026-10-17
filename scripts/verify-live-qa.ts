import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { answerQuestion } from '../src/lib/ai';
import { getSnapshot } from '../src/lib/repository';
import { providerConfiguration } from '../src/lib/ai/provider';
import { captureAiDiagnostics } from '../src/lib/ai/diagnostics';
import { evaluationProvenance } from '../src/lib/ai/provenance';
import { LIVE_CASES, assessLiveCase, externalBlocker, verificationPassed } from '../src/lib/ai/verification';
async function main() {
  const directory = path.resolve('.data/verification'); mkdirSync(directory, { recursive: true });
  const output = path.join(directory, `live-qa-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const configuration = providerConfiguration(), snapshot = getSnapshot(), provenance = evaluationProvenance();
  if (snapshot.snapshotId !== 'zustand-0ea8be27db13' || snapshot.commitSha !== '0ea8be27db13019819fc1c0492e5b672dd7b6f4b') throw new Error('Live development cases do not match the pinned snapshot.');
  const results = [];
  let actualProviderRequests = 0, stopped = !configuration.configured;
  for (const test of LIVE_CASES) {
    if (stopped) { results.push({ id: test.id, expected: test.expected, passed: false, failures: ['not_run_external_blocker'] }); continue; }
    const started = Date.now();
    const { value: response, diagnostics } = await captureAiDiagnostics(() => answerQuestion({ question: test.question, snapshotId: snapshot.snapshotId, scope: 'repository', depth: 'developer' }, { prepared: false, useCache: false }));
    const actualRequests = diagnostics.filter(event => event.operation === 'request').length;
    actualProviderRequests += actualRequests;
    const assessment = assessLiveCase(test, response, actualRequests, snapshot.snapshotId);
    const { citations, ...answer } = response;
    results.push({ id: test.id, expected: test.expected, requiredSourcePaths: test.paths, ...assessment, latencyMs: Date.now() - started,
      actualProviderRequests: actualRequests, diagnostics, response: { ...answer, citations: citations.map(({ text: _source, ...metadata }) => metadata) }, humanClaimReview: 'pending' });
    stopped = !assessment.passed && externalBlocker(diagnostics);
  }
  const passed = verificationPassed(results);
  const report = { recordedAt: new Date().toISOString(), status: passed ? 'passed' : stopped ? 'blocked' : 'failed',
    reason: !configuration.configured ? configuration.provider === 'gemini' ? 'missing_server_credential' : 'provider_not_configured' : undefined,
    snapshotId: snapshot.snapshotId, sourceCommit: snapshot.commitSha, provenance, preparedMatching: false, cache: false,
    actualProviderRequests, liveRequests: actualProviderRequests, answered: results.filter(result => 'response' in result && result.response?.status === 'answered').length,
    casesPassed: results.filter(result => result.passed).length, casesRequired: LIVE_CASES.length, includedHeldOut: false, results,
    limitations: ['Outcome gates and canonical reference checks do not establish factual correctness. Independent claim review remains pending.', 'No private model reasoning, raw prompts or retrieved source bodies are recorded.'] };
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, status: report.status, reason: report.reason, actualProviderRequests, answered: report.answered, casesPassed: report.casesPassed, casesRequired: report.casesRequired, preparedMatching: false, cache: false }));
  if (!passed) process.exitCode = configuration.configured ? 1 : 2;
}
main().catch(() => { console.error('Live verification could not complete; inspect configuration without sharing credentials.'); process.exitCode = 1; });
