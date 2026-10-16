'use client';

import { useEffect, useState } from 'react';
import type { Results } from '@/contracts';
import './missions.css';
export { MissionPanel } from './MissionPanel';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error?.message || 'The request failed. Try again.');
  return value;
}

function contributionRationale(task: Results['tasks'][number]): string {
  if (!task.attempts) return 'Try this checkpoint before drafting the related explanation.';
  if (!task.completed || !task.lastCorrect) return 'Revisit the source and your latest feedback before drafting the related explanation.';
  if (task.firstAttemptCorrect && task.hintsUsed === 0 && task.attempts === 1) return 'Explain your first-attempt reasoning in your own words, then check it against the source.';
  return 'Hints or retries are recorded here. Revisit the source range and explain what changed in your reasoning before drafting.';
}

interface ResultsProps {
  onEvidence: (evidenceId: string) => void;
  onReset?: () => void;
  onContinue?: () => void;
  onTask?: (taskId: string) => void;
}

export function ResultsPanel({ onEvidence, onReset, onContinue, onTask }: ResultsProps) {
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  async function load() {
    setError('');
    try { setResults(await api<Results>('/api/results')); }
    catch (failure) { setError((failure as Error).message); }
  }
  useEffect(() => { void load(); }, []);

  async function reset() {
    setBusy(true); setError('');
    try {
      await api('/api/session/reset', { method: 'POST' });
      setResults(null); setConfirmReset(false); onReset?.(); await load();
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  if (!results) return <section className="results-panel" aria-live="polite">
    {error ? <><p role="alert">{error}</p><button type="button" className="text-button" onClick={load}>Try loading again</button></> : <p role="status">Loading your progress…</p>}
  </section>;

  const nextTask = results.tasks.find(task => !task.completed);
  return <section className="results-panel">
    <div className="results-intro"><span className="mission-kicker">My progress</span><h2>Your learning, so far.</h2><p>See what you solved, the support you used, and what to inspect next.</p></div>
    <div className="results-stats">
      <div><strong>{results.completed}<span> / {results.totalTasks}</span></strong><span>Checkpoints solved</span></div>
      <div><strong>{results.firstAttemptCorrect}</strong><span>First attempts correct</span></div>
      <div><strong>{results.totalAttempts}</strong><span>Total attempts</span></div>
      <div><strong>{results.hintsUsed}</strong><span>Hint requests</span></div>
    </div>
    <p className="mission-note">First-attempt correctness may include hints. These checkpoints are source-reading practice, not a measure of professional readiness.</p>
    {onContinue && <div className="results-next-action"><div><h3>{nextTask ? `Next: ${nextTask.title}` : 'Keep exploring what you learned'}</h3><p>{nextTask ? 'Open this checkpoint in its walkthrough, with previous attempts and feedback preserved.' : 'Revisit a source range or inspect one of the prepared contribution briefs below.'}</p></div><button type="button" className="primary-button" onClick={nextTask && onTask ? () => onTask(nextTask.taskId) : onContinue}>{nextTask ? 'Continue learning' : 'Return to learning'} →</button></div>}
    <div className="results-task-list">{results.tasks.map(task => <article className="results-task" key={task.taskId}>
      <span className={`result-indicator ${task.completed ? 'solved' : ''}`} aria-hidden="true">{task.completed ? '✓' : '○'}</span>
      <div><h3>{onTask ? <button type="button" className="results-task-link" onClick={() => onTask(task.taskId)}>{task.title}</button> : task.title}</h3><p>{task.attempts === 0 ? 'Not attempted yet' : `${task.attempts} attempt${task.attempts === 1 ? '' : 's'} · ${Math.max(0, task.attempts - 1)} retries · ${task.hintsUsed} hint request${task.hintsUsed === 1 ? '' : 's'} · ${task.firstAttemptCorrect ? 'First attempt correct' : 'First attempt needs review'}`}</p></div>
      <span className="result-status">{task.completed ? 'Solved' : task.attempts ? 'Needs another look' : 'Not started'}</span>
    </article>)}</div>
    <div className="results-revisit"><h3>Concepts to revisit</h3>{results.topicsToRevisit.length ? <div className="results-topics">{results.topicsToRevisit.map(topic => <span key={topic}>{topic}</span>)}</div> : <p className="muted">{results.totalAttempts ? 'No review flags yet. Keep checking your reasoning against the source.' : 'Attempt a checkpoint to build your review list.'}</p>}</div>
    <div className="results-briefs-heading"><span className="mission-kicker">A first contribution</span><h2>Prepared contribution briefs</h2><p>These fixed documentation briefs were checked against the source. Your attempt and hint history provides review context below; it does not generate or rank the briefs.</p></div>
    <div className="contribution-briefs">{results.briefs.map(brief => <article className="contribution-brief" key={brief.id}>
      <span className="brief-type">Prepared documentation brief</span><h3>{brief.title}</h3><p>{brief.goal}</p>
      <details><summary>Review scope and verification steps</summary><h4>Before you begin</h4><ul>{brief.prerequisites.map(item => <li key={item}>{item}</li>)}</ul><h4>Suggested change</h4><p>{brief.suggestedChange}</p><h4>Verify your explanation</h4><ol>{brief.verificationSteps.map(item => <li key={item}>{item}</li>)}</ol><h4>How your results relate to this brief</h4><ul className="brief-result-context">{brief.informedByTaskIds.map(id => {
        const task = results.tasks.find(entry => entry.taskId === id);
        if (!task) return null;
        return <li key={id}><strong>{onTask ? <button type="button" className="results-task-link" onClick={() => onTask(id)}>{task.title}</button> : task.title}</strong><p>{task.attempts ? `${task.completed ? 'Solved' : 'Needs review'} · ${task.firstAttemptCorrect ? 'first attempt correct' : 'first attempt incorrect'} · ${task.attempts} attempt${task.attempts === 1 ? '' : 's'} · ${task.hintsUsed} hint request${task.hintsUsed === 1 ? '' : 's'}` : 'Not attempted'}</p><p>{contributionRationale(task)}</p></li>;
      })}</ul></details>
      <div className="mission-context">{brief.evidenceIds.map((id, index) => <button type="button" className="evidence-link" key={id} onClick={() => onEvidence(id)}>Inspect source {index + 1} ↗</button>)}</div>
    </article>)}</div>
    <p className="mission-note">Check upstream contribution guidance and ask a peer to review your draft. Independent human review of the prepared material and a participant study remain pending.</p>
    <div className="results-reset">{confirmReset ? <>
      <div className="results-reset-copy"><strong>Reset this learning session?</strong><p>This clears this session’s attempts, hints and teach-back submissions. Other sessions are unaffected. Saved answers, notes, goals and walkthrough position remain. Visited steps, question history and layout preferences remain on this device.</p></div>
      <button type="button" onClick={reset} disabled={busy}>{busy ? 'Clearing…' : 'Clear my session'}</button><button type="button" onClick={() => setConfirmReset(false)} disabled={busy}>Keep my progress</button>
    </> : <button type="button" className="text-button" onClick={() => setConfirmReset(true)}>Reset this learning session</button>}</div>
    {error && <p role="alert" className="mission-warning">{error}</p>}
  </section>;
}
