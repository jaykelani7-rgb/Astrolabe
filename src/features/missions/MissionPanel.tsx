'use client';

import { useEffect, useRef, useState } from 'react';
import type { Depth, Evidence, Feedback, PublicTask, SourceFile } from '@/contracts';
import './missions.css';
import { TeachBackPanel } from './TeachBackPanel';

type Range = { fileId: string; startLine: number; endLine: number };
type Progress = { snapshotId: string; contentVersion: string; feedback: Feedback | null; hintsUsed: number; hint?: string };
interface MissionProps {
  taskId: string;
  snapshotId: string;
  sourceFiles: SourceFile[];
  depth: Depth;
  onEvidence: (evidenceId: string) => void;
  onComplete: () => void;
  selectedRange?: Range;
  onContinue?: () => void;
  onTask?: (taskId: string) => void;
  continueLabel?: string;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error?.message || 'This request failed. Your prediction is still here; try again.');
  return value;
}

export function MissionPanel({ taskId, snapshotId, sourceFiles, depth, onEvidence, onComplete, selectedRange, onContinue, onTask, continueLabel = 'Continue walkthrough' }: MissionProps) {
  const [task, setTask] = useState<PublicTask | null>(null);
  const [choice, setChoice] = useState('');
  const [order, setOrder] = useState<string[]>([]);
  const [range, setRange] = useState({ startLine: '', endLine: '' });
  const [rangeSource, setRangeSource] = useState<SourceFile | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hint, setHint] = useState('');
  const [hintCount, setHintCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadVersion, setLoadVersion] = useState(0);
  const generation = useRef(0);
  const lastSelection = useRef('');

  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    setTask(null); setChoice(''); setOrder([]); setRange({ startLine: '', endLine: '' });
    setRangeSource(null); setFeedback(null); setHint(''); setHintCount(0); setError(''); setBusy(false);
    lastSelection.current = '';
    const context = new URLSearchParams({ snapshotId });
    api<PublicTask>(`/api/tasks/${encodeURIComponent(taskId)}?${context}`, { signal: controller.signal }).then(async value => {
      if (current !== generation.current) return;
      if (value.snapshotId !== snapshotId || value.id !== taskId) throw new Error('This checkpoint belongs to a different source snapshot. Open it again from the selected repository.');
      if (!value.contentVersion) throw new Error('This checkpoint has no content version. Reload it before restoring or saving practice.');
      const versioned = new URLSearchParams({ snapshotId, contentVersion: value.contentVersion });
      const [progress, target] = await Promise.all([
        api<Progress>(`/api/tasks/${encodeURIComponent(taskId)}/progress?${versioned}`, { signal: controller.signal }),
        value.type === 'range'
          ? api<Evidence>(`/api/evidence/${encodeURIComponent(value.contextEvidenceIds[0])}?${context}`, { signal: controller.signal })
          : Promise.resolve(undefined),
      ]);
      if (current !== generation.current) return;
      if (progress.snapshotId !== snapshotId || progress.contentVersion !== value.contentVersion) throw new Error('Saved practice belongs to a different checkpoint version. Reload the checkpoint.');
      const targetFile = target ? sourceFiles.find(file => file.fileId === target.fileId && file.snapshotId === snapshotId) : undefined;
      if (value.type === 'range' && !targetFile) throw new Error('The source metadata for this checkpoint is unavailable. Reload the repository before selecting lines.');
      setTask(value); setOrder(value.choices.map(entry => entry.id)); setRangeSource(targetFile || null);
      setFeedback(progress.feedback); setHint(progress.hint || ''); setHintCount(progress.hintsUsed);
      const answer = progress.feedback?.submittedAnswer;
      if (value.type === 'choice' && typeof answer === 'string') setChoice(answer);
      if (value.type === 'ordering' && Array.isArray(answer)) setOrder(answer as string[]);
      if (value.type === 'range' && answer && typeof answer === 'object' && 'startLine' in answer && 'endLine' in answer) {
        setRange({ startLine: String(answer.startLine), endLine: String(answer.endLine) });
      }
    }).catch(failure => { if (current === generation.current) setError(failure.message); });
    return () => { generation.current++; controller.abort(); };
  }, [taskId, snapshotId, sourceFiles, loadVersion]);

  useEffect(() => {
    if (!selectedRange || !rangeSource || selectedRange.fileId !== rangeSource.fileId) return;
    const key = `${selectedRange.fileId}:${selectedRange.startLine}:${selectedRange.endLine}`;
    if (lastSelection.current === key) return;
    lastSelection.current = key;
    if (!feedback) setRange({ startLine: String(selectedRange.startLine), endLine: String(selectedRange.endLine) });
  }, [selectedRange, rangeSource, feedback]);

  function move(index: number, direction: number) {
    const next = [...order];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setOrder(next);
  }

  async function submit() {
    if (!task || busy) return;
    const current = generation.current;
    setBusy(true); setError('');
    const answer = task.type === 'choice' ? choice : task.type === 'ordering' ? order : { startLine: Number(range.startLine), endLine: Number(range.endLine) };
    try {
      const value = await api<Feedback>(`/api/tasks/${encodeURIComponent(task.id)}/attempt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshotId: task.snapshotId, contentVersion: task.contentVersion, answer }) });
      if (current !== generation.current) return;
      if (value.snapshotId !== task.snapshotId || value.contentVersion !== task.contentVersion || value.taskId !== task.id) throw new Error('This response belongs to another checkpoint version. Reload your saved practice.');
      onComplete();
      setFeedback(value); setHintCount(value.hintsUsed);
    } catch (failure) { if (current === generation.current) setError((failure as Error).message); }
    finally { if (current === generation.current) setBusy(false); }
  }

  async function getHint() {
    if (!task || busy) return;
    const current = generation.current;
    setBusy(true); setError('');
    try {
      const context = new URLSearchParams({ snapshotId: task.snapshotId, contentVersion: task.contentVersion! });
      const value = await api<{ snapshotId: string; contentVersion: string; hint: string; hintsUsed: number }>(`/api/tasks/${encodeURIComponent(task.id)}/hint?${context}`, { method: 'POST' });
      if (current !== generation.current) return;
      if (value.snapshotId !== task.snapshotId || value.contentVersion !== task.contentVersion) throw new Error('This hint belongs to another checkpoint version. Reload your saved practice.');
      onComplete();
      setHint(value.hint); setHintCount(value.hintsUsed);
    } catch (failure) { if (current === generation.current) setError((failure as Error).message); }
    finally { if (current === generation.current) setBusy(false); }
  }

  if (!task) return <section className="mission-panel" aria-label="Prediction checkpoint" aria-live="polite" aria-busy={!error} data-checkpoint-state={error ? 'error' : 'restoring'}>
    {error ? <><p role="alert">{error}</p><button type="button" className="text-button" onClick={() => setLoadVersion(value => value + 1)}>Try loading again</button></> : <p role="status" className="muted">Loading checkpoint and your saved attempt…</p>}
  </section>;

  const ready = task.type === 'choice' ? Boolean(choice) : task.type === 'ordering' ? order.length > 0 : Boolean(rangeSource) && Number.isInteger(Number(range.startLine)) && Number.isInteger(Number(range.endLine)) && Number(range.startLine) >= 1 && Number(range.endLine) >= Number(range.startLine) && Number(range.endLine) <= rangeSource!.lineCount;
  return <section className="mission-panel" aria-label="Prediction checkpoint" aria-busy={busy} data-checkpoint-state="ready" data-snapshot-id={task.snapshotId} data-content-version={task.contentVersion}>
    <div className="mission-heading"><span className="mission-kicker">Prediction checkpoint</span><span className="mission-type">{task.type === 'range' ? 'Select source lines' : task.type === 'ordering' ? 'Order the steps' : 'Choose one'}</span></div>
    <h3>{task.title}</h3><p className="mission-prompt">{task.prompt}</p>
    <div className="mission-context">{task.contextEvidenceIds.map((id, index) => <button type="button" className="evidence-link" onClick={() => onEvidence(id)} key={id}>Inspect source{task.contextEvidenceIds.length > 1 ? ` ${index + 1}` : ''} ↗</button>)}</div>
    {!feedback && <>
      {task.type === 'choice' && <fieldset className="mission-choices"><legend className="sr-only">Your prediction</legend>{task.choices.map(option => <label key={option.id} className={`mission-choice ${choice === option.id ? 'selected' : ''}`}><input type="radio" name={`answer-${task.id}`} value={option.id} checked={choice === option.id} onChange={() => setChoice(option.id)} disabled={busy} /><span>{option.label}</span></label>)}</fieldset>}
      {task.type === 'ordering' && <ol className="mission-order">{order.map((id, index) => <li key={id}><span className="mission-order-number">{index + 1}</span><span>{task.choices.find(item => item.id === id)?.label}</span><div className="mission-order-actions"><button type="button" aria-label={`Move step ${index + 1} up`} disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label={`Move step ${index + 1} down`} disabled={busy || index === order.length - 1} onClick={() => move(index, 1)}>↓</button></div></li>)}</ol>}
      {task.type === 'range' && <div className="mission-range"><p className="muted">Select lines in the source viewer, or enter the inclusive range in {rangeSource?.path} (1–{rangeSource?.lineCount}).</p><label>Start line<input aria-label="Start line" type="number" min={1} max={rangeSource?.lineCount} value={range.startLine} onChange={event => setRange({ ...range, startLine: event.target.value })} disabled={busy} /></label><span aria-hidden="true">→</span><label>End line<input aria-label="End line" type="number" min={1} max={rangeSource?.lineCount} value={range.endLine} onChange={event => setRange({ ...range, endLine: event.target.value })} disabled={busy} /></label>{selectedRange && rangeSource && selectedRange.fileId !== rangeSource.fileId && <p role="status" className="mission-warning">Open {rangeSource.path} to use a source selection for this checkpoint.</p>}</div>}
      <div className="mission-actions"><button type="button" className="primary-button" onClick={submit} disabled={!ready || busy}>{busy ? 'Saving…' : 'Submit prediction'}</button><button type="button" className="text-button" onClick={getHint} disabled={busy || Boolean(hint)}>{hint ? 'Hint saved' : 'Get a hint'}</button></div>
      {hint && <aside className="mission-hint"><strong>Hint · saved in your session</strong><p>{hint}</p></aside>}
      <p className="mission-note">Your explanation appears after an attempt. {hintCount > 0 ? `${hintCount} hint request${hintCount === 1 ? '' : 's'} recorded.` : 'Hints and retries appear in your progress.'}</p>
    </>}
    {feedback && <div className={`mission-feedback ${feedback.correct ? 'correct' : 'incorrect'}`} aria-live="polite">
      <strong>{feedback.correct ? 'Your prediction matches the source' : 'Compare your prediction with the source'}</strong>
      <p>{feedback.explanation[depth]}</p>
      <div className="mission-context">{feedback.evidenceIds.map((id, index) => <button type="button" className="evidence-link" onClick={() => onEvidence(id)} key={id}>Verify explanation{feedback.evidenceIds.length > 1 ? ` ${index + 1}` : ''} ↗</button>)}</div>
      <p className="mission-note">Attempt {feedback.attemptNumber} · {feedback.hintsUsed} hint request{feedback.hintsUsed === 1 ? '' : 's'} at submission. Prepared explanation, checked against source.</p>
      {hintCount > feedback.hintsUsed && <p className="mission-note">{hintCount} hint requests are now recorded for this checkpoint.</p>}
      <div className="mission-feedback-actions">{onContinue && <button type="button" className="primary-button" onClick={onContinue}>{continueLabel} →</button>}<button type="button" className="text-button" onClick={() => setFeedback(null)}>{feedback.correct ? 'Try this checkpoint again' : 'Make another attempt'}</button></div>
    </div>}
    {feedback && <TeachBackPanel key={`${task.snapshotId}:${task.contentVersion}:${task.id}`} task={task} onEvidence={onEvidence} onTask={id => { if (id === task.id) setFeedback(null); else onTask?.(id); }} />}
    {error && <p role="alert" className="mission-warning">{error}</p>}
  </section>;
}
