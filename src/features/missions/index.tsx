'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Results } from '@/contracts';
import './missions.css';
export { MissionPanel } from './MissionPanel';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error?.message || 'The request failed. Try again.');
  return value;
}

interface ResultsProps {
  snapshotId: string;
  onEvidence: (evidenceId: string) => void;
  onReset?: () => void;
  onContinue?: () => void;
  onTask?: (taskId: string) => void;
}

export function ResultsPanel({ snapshotId, onReset, onContinue, onTask }: ResultsProps) {
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const generation = useRef(0);

  const load = useCallback(async (current: number, signal?: AbortSignal) => {
    setError('');
    try {
      const value = await api<Results>(`/api/results?${new URLSearchParams({ snapshotId })}`, { signal });
      if (current === generation.current) setResults(value);
    } catch (failure) {
      if (current === generation.current && (failure as Error).name !== 'AbortError') setError((failure as Error).message);
    }
  }, [snapshotId]);
  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    setResults(null); setConfirmReset(false); setBusy(false);
    void load(current, controller.signal);
    return () => { generation.current++; controller.abort(); };
  }, [load]);

  async function reset() {
    const current = generation.current;
    setBusy(true); setError('');
    try {
      await api('/api/session/reset', { method: 'POST' });
      if (current !== generation.current) return;
      setResults(null); setConfirmReset(false); onReset?.(); await load(current);
    } catch (failure) { if (current === generation.current) setError((failure as Error).message); }
    finally { if (current === generation.current) setBusy(false); }
  }

  if (!results) return <section className="results-panel" aria-live="polite">
    {error ? <><p role="alert">{error}</p><button type="button" className="text-button" onClick={() => void load(generation.current)}>Try loading again</button></> : <p role="status">Loading your progress…</p>}
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
    {onContinue && <div className="results-next-action"><div><h3>{nextTask ? `Next: ${nextTask.title}` : 'Keep exploring what you learned'}</h3><p>{nextTask ? 'Open this checkpoint in its walkthrough, with previous attempts and feedback preserved.' : 'Revisit a source range or inspect a curated documentation proposal.'}</p></div><button type="button" className="primary-button" onClick={nextTask && onTask ? () => onTask(nextTask.taskId) : onContinue}>{nextTask ? 'Continue learning' : 'Return to learning'} →</button></div>}
    <div className="results-task-list">{results.tasks.map(task => <article className="results-task" key={task.taskId}>
      <span className={`result-indicator ${task.completed ? 'solved' : ''}`} aria-hidden="true">{task.completed ? '✓' : '○'}</span>
      <div><h3>{onTask ? <button type="button" className="results-task-link" onClick={() => onTask(task.taskId)}>{task.title}</button> : task.title}</h3><p>{task.attempts === 0 ? 'Not attempted yet' : `${task.attempts} attempt${task.attempts === 1 ? '' : 's'} · ${Math.max(0, task.attempts - 1)} retries · ${task.hintsUsed} hint request${task.hintsUsed === 1 ? '' : 's'} · ${task.firstAttemptCorrect ? 'First attempt correct' : 'First attempt needs review'}`}</p></div>
      <span className="result-status">{task.completed ? 'Solved' : task.attempts ? 'Needs another look' : 'Not started'}</span>
    </article>)}</div>
    <div className="results-revisit"><h3>Concepts to revisit</h3>{results.topicsToRevisit.length ? <div className="results-topics">{results.topicsToRevisit.map(topic => <span key={topic}>{topic}</span>)}</div> : <p className="muted">{results.totalAttempts ? 'No review flags yet. Keep checking your reasoning against the source.' : 'Attempt a checkpoint to build your review list.'}</p>}</div>
    <div className="results-reset">{confirmReset ? <>
      <div className="results-reset-copy"><strong>Reset this learning session?</strong><p>This clears this session’s attempts, hints and teach-back submissions across snapshots. Other sessions are unaffected. Saved answers, bookmarks, goals and walkthrough position remain. Visited steps, question history and layout preferences remain on this device.</p></div>
      <button type="button" onClick={reset} disabled={busy}>{busy ? 'Clearing…' : 'Clear my session'}</button><button type="button" onClick={() => setConfirmReset(false)} disabled={busy}>Keep my progress</button>
    </> : <button type="button" className="text-button" onClick={() => setConfirmReset(true)}>Reset this learning session</button>}</div>
    {error && <p role="alert" className="mission-warning">{error}</p>}
  </section>;
}
