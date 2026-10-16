'use client';

import { useEffect, useState } from 'react';
import type { Depth, Evidence, Feedback, PublicTask, Results } from '@/contracts';
import './missions.css';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'The request failed. Try again.');
  return data;
}

type Range = { fileId: string; startLine: number; endLine: number };
export function MissionPanel({ taskId, depth, onEvidence, onComplete, selectedRange }: { taskId: string; depth: Depth; onEvidence: (evidenceId: string) => void; onComplete: () => void; selectedRange?: Range }) {
  const [task, setTask] = useState<PublicTask | null>(null);
  const [choice, setChoice] = useState('');
  const [order, setOrder] = useState<string[]>([]);
  const [range, setRange] = useState({ startLine: '', endLine: '' });
  const [rangeFile, setRangeFile] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hint, setHint] = useState('');
  const [hintCount, setHintCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    setTask(null); setChoice(''); setOrder([]); setRange({ startLine: '', endLine: '' }); setRangeFile(''); setFeedback(null); setHint(''); setHintCount(0); setError('');
    api<PublicTask>(`/api/tasks/${encodeURIComponent(taskId)}`).then(async (value) => {
      if (!current) return;
      setTask(value); setOrder(value.choices.map((entry) => entry.id));
      if (value.type === 'range') {
        const target = await api<Evidence>(`/api/evidence/${encodeURIComponent(value.contextEvidenceIds[0])}?snapshotId=${encodeURIComponent(value.snapshotId)}`);
        if (current) setRangeFile(target.fileId);
      }
    }).catch((failure) => { if (current) setError(failure.message); });
    return () => { current = false; };
  }, [taskId]);

  useEffect(() => {
    if (selectedRange && rangeFile && selectedRange.fileId === rangeFile && !feedback) setRange({ startLine: String(selectedRange.startLine), endLine: String(selectedRange.endLine) });
  }, [selectedRange, rangeFile, feedback]);

  function move(index: number, direction: number) {
    const next = [...order];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setOrder(next);
  }

  async function submit() {
    if (!task) return;
    setBusy(true); setError('');
    const answer = task.type === 'choice' ? choice : task.type === 'ordering' ? order : { startLine: Number(range.startLine), endLine: Number(range.endLine) };
    try {
      const value = await api<Feedback>(`/api/tasks/${task.id}/attempt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshotId: task.snapshotId, answer }) });
      setFeedback(value); setHintCount(value.hintsUsed); onComplete();
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  async function getHint() {
    if (!task) return;
    setBusy(true); setError('');
    try { const value = await api<{ hint: string; hintsUsed: number }>(`/api/tasks/${task.id}/hint`, { method: 'POST' }); setHint(value.hint); setHintCount(value.hintsUsed); onComplete(); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  if (!task) return <section className="mission-panel" aria-live="polite">{error ? <p role="alert">{error}</p> : <p className="muted">Loading checkpoint…</p>}</section>;
  const ready = task.type === 'choice' ? Boolean(choice) : task.type === 'ordering' ? order.length > 0 : Number(range.startLine) >= 1 && Number(range.endLine) >= Number(range.startLine);
  return <section className="mission-panel" aria-label="Prediction checkpoint">
    <div className="mission-heading"><span className="mission-kicker">PREDICT BEFORE REVEAL</span><span className="mission-type">{task.type === 'range' ? 'Source range' : task.type === 'ordering' ? 'Order the steps' : 'Choose one'}</span></div>
    <h3>{task.title}</h3><p className="mission-prompt">{task.prompt}</p>
    <div className="mission-context">{task.contextEvidenceIds.map((id, index) => <button type="button" className="evidence-link" onClick={() => onEvidence(id)} key={id}>↗ Inspect source{task.contextEvidenceIds.length > 1 ? ` ${index + 1}` : ''}</button>)}</div>
    {!feedback && <>
      {task.type === 'choice' && <fieldset className="mission-choices"><legend className="sr-only">Your prediction</legend>{task.choices.map((option) => <label key={option.id} className={`mission-choice ${choice === option.id ? 'selected' : ''}`}><input type="radio" name={`answer-${task.id}`} value={option.id} checked={choice === option.id} onChange={() => setChoice(option.id)} /><span>{option.label}</span></label>)}</fieldset>}
      {task.type === 'ordering' && <ol className="mission-order">{order.map((id, index) => <li key={id}><span className="mission-order-number">{index + 1}</span><span>{task.choices.find((item) => item.id === id)?.label}</span><div className="mission-order-actions"><button type="button" aria-label={`Move step ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label={`Move step ${index + 1} down`} disabled={index === order.length - 1} onClick={() => move(index, 1)}>↓</button></div></li>)}</ol>}
      {task.type === 'range' && <div className="mission-range"><p className="muted">Select lines in the source viewer, or enter the inclusive range in src/vanilla.ts.</p><label>Start line<input aria-label="Start line" type="number" min={1} max={100} value={range.startLine} onChange={(event) => setRange({ ...range, startLine: event.target.value })} /></label><span>→</span><label>End line<input aria-label="End line" type="number" min={1} max={100} value={range.endLine} onChange={(event) => setRange({ ...range, endLine: event.target.value })} /></label>{selectedRange && rangeFile && selectedRange.fileId !== rangeFile && <p role="status" className="mission-warning">Open src/vanilla.ts to use a source selection for this checkpoint.</p>}</div>}
      <div className="mission-actions"><button type="button" className="primary-button" onClick={submit} disabled={!ready || busy}>{busy ? 'Working…' : 'Submit prediction'}</button><button type="button" className="text-button" onClick={getHint} disabled={busy || Boolean(hint)}> {hint ? 'Hint recorded' : 'Get a hint'}</button></div>
      {hint && <aside className="mission-hint"><strong>Hint · recorded in your results</strong><p>{hint}</p></aside>}
      <p className="mission-note">Your explanation appears after an attempt. {hintCount > 0 ? `${hintCount} hint request${hintCount === 1 ? '' : 's'} recorded.` : 'Hints and retries count in your session summary.'}</p>
    </>}
    {feedback && <div className={`mission-feedback ${feedback.correct ? 'correct' : 'incorrect'}`} aria-live="polite"><strong>{feedback.correct ? 'Prediction confirmed' : 'A useful place to look again'}</strong><p>{feedback.explanation[depth]}</p><div className="mission-context">{feedback.evidenceIds.map((id, index) => <button type="button" className="evidence-link" onClick={() => onEvidence(id)} key={id}>↗ Verify explanation{feedback.evidenceIds.length > 1 ? ` ${index + 1}` : ''}</button>)}</div><p className="mission-note">Attempt {feedback.attemptNumber} · {feedback.hintsUsed} hint request{feedback.hintsUsed === 1 ? '' : 's'} · Prepared, source-checked explanation</p><button type="button" className="text-button" onClick={() => setFeedback(null)}>{feedback.correct ? 'Try this checkpoint again' : 'Try again'}</button></div>}
    {error && <p role="alert" className="mission-warning">{error}</p>}
  </section>;
}

function contributionRationale(task: Results['tasks'][number]): string {
  if (!task.attempts) return 'Complete this checkpoint before drafting the related explanation.';
  if (!task.completed || !task.lastCorrect) return 'Revisit the source and your latest feedback before drafting the related explanation.';
  if (task.firstAttemptCorrect && task.hintsUsed === 0 && task.attempts === 1) return 'Use this brief to explain your first-attempt reasoning in your own words, then check it against the source.';
  return 'Hints or retries are recorded for this checkpoint. Revisit that source range and explain what changed in your reasoning before drafting.';
}

export function ResultsPanel({ onEvidence, onReset }: { onEvidence: (evidenceId: string) => void; onReset?: () => void }) {
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  async function load() { setError(''); try { setResults(await api<Results>('/api/results')); } catch (failure) { setError((failure as Error).message); } }
  useEffect(() => { void load(); }, []);
  async function reset() { setBusy(true); try { await api('/api/session/reset', { method: 'POST' }); await load(); setConfirmReset(false); onReset?.(); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }
  if (!results) return <section className="results-panel" aria-live="polite">{error ? <p role="alert">{error}<button type="button" onClick={load}>Retry</button></p> : <p>Loading your session…</p>}</section>;
  return <section className="results-panel">
    <div className="results-intro"><span className="mission-kicker">YOUR LEARNING SESSION</span><h2>Small predictions. Clearer understanding.</h2><p>Review what you solved, where you used support, and a bounded contribution to explore next.</p></div>
    <div className="results-stats"><div><strong>{results.completed}<span> / {results.totalTasks}</span></strong><span>Checkpoints solved</span></div><div><strong>{results.firstAttemptCorrect}</strong><span>Correct on first attempt</span></div><div><strong>{results.totalAttempts}</strong><span>Total attempts</span></div><div><strong>{results.hintsUsed}</strong><span>Hint requests</span></div></div>
    <p className="mission-note">First-attempt correctness can include hints. These four checkpoints are practice, not a validated measure of professional readiness.</p>
    <div className="results-task-list">{results.tasks.map((task) => <article className="results-task" key={task.taskId}><span className={`result-indicator ${task.completed ? 'solved' : ''}`}>{task.completed ? '✓' : '○'}</span><div><h3>{task.title}</h3><p>{task.attempts === 0 ? 'Not attempted yet' : `${task.attempts} attempt${task.attempts === 1 ? '' : 's'} · ${task.hintsUsed} hint request${task.hintsUsed === 1 ? '' : 's'} · ${task.firstAttemptCorrect ? 'First attempt correct' : 'First attempt needs review'}`}</p></div><span className="result-status">{task.completed ? 'Solved' : task.attempts ? 'Keep exploring' : 'Open'}</span></article>)}</div>
    <div className="results-revisit"><h3>Topics to revisit</h3>{results.topicsToRevisit.length ? <div className="results-topics">{results.topicsToRevisit.map((topic) => <span key={topic}>{topic}</span>)}</div> : <p className="muted">{results.totalAttempts ? 'No review flags yet. Keep checking your reasoning against the source.' : 'Complete a checkpoint to start your review list.'}</p>}</div>
    <div className="results-briefs-heading"><span className="mission-kicker">A FIRST CONTRIBUTION</span><h2>Make the next step a small one.</h2><p>Source-checked ideas for documentation work. Review upstream guidance and ask a peer before proposing a change.</p></div>
    <div className="contribution-briefs">{results.briefs.map((brief) => <article className="contribution-brief" key={brief.id}><span className="brief-type">DOCUMENTATION BRIEF</span><h3>{brief.title}</h3><p>{brief.goal}</p><details><summary>Read the scoped brief</summary><h4>Before you begin</h4><ul>{brief.prerequisites.map((item) => <li key={item}>{item}</li>)}</ul><h4>Suggested change</h4><p>{brief.suggestedChange}</p><h4>Verify your explanation</h4><ol>{brief.verificationSteps.map((item) => <li key={item}>{item}</li>)}</ol><h4>How your results inform this brief</h4><ul className="brief-result-context">{brief.informedByTaskIds.map((id) => { const task = results.tasks.find((entry) => entry.taskId === id); if (!task) return null; return <li key={id}><strong>{task.title}</strong><p>{task.attempts ? `${task.completed ? 'Solved' : 'Needs review'} · ${task.firstAttemptCorrect ? 'first attempt correct' : 'first attempt incorrect'} · ${task.attempts} attempt${task.attempts === 1 ? '' : 's'} · ${task.hintsUsed} hint request${task.hintsUsed === 1 ? '' : 's'}` : 'Not attempted'}</p><p>{contributionRationale(task)}</p></li>; })}</ul><p className="mission-note">These results guide source review for this small practice idea. They do not establish contribution readiness.</p></details><div className="mission-context">{brief.evidenceIds.map((id, index) => <button type="button" className="evidence-link" key={id} onClick={() => onEvidence(id)}>↗ Source {index + 1}</button>)}</div></article>)}</div>
    <p className="mission-note">Independent human review of the prepared material and a participant study are pending.</p>
    <div className="results-reset">{confirmReset ? <><span>Clear attempts and hints for this session?</span><button type="button" onClick={reset} disabled={busy}>Clear my session</button><button type="button" onClick={() => setConfirmReset(false)}>Keep my results</button></> : <button type="button" className="text-button" onClick={() => setConfirmReset(true)}>Reset this learning session</button>}</div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
