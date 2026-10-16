'use client';

import { useEffect, useRef, useState } from 'react';
import type { PublicTask, TeachBackAssessment, TeachBackProgress, TeachBackSubmission } from '@/contracts';
import { api } from '@/lib/client/api';

interface Props {
  task: PublicTask;
  onEvidence: (id: string) => void;
  onTask?: (id: string) => void;
}

export function TeachBackPanel({ task, onEvidence, onTask }: Props) {
  const [progress, setProgress] = useState<TeachBackProgress | null>(null);
  const [text, setText] = useState('');
  const [assessments, setAssessments] = useState<Record<string, TeachBackAssessment>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const generation = useRef(0);

  function restore(submission: TeachBackSubmission | null) {
    setText(submission?.text || '');
    setAssessments(Object.fromEntries((submission?.concepts || [])
      .filter(concept => concept.state !== 'unassessed')
      .map(concept => [concept.id, concept.state as TeachBackAssessment])));
  }

  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setProgress(null); setError(''); setBusy(false);
    const query = new URLSearchParams({ taskId: task.id, snapshotId: task.snapshotId, contentVersion: task.contentVersion || '' });
    api<TeachBackProgress>(`/api/teach-back?${query}`, { cache: 'no-store', signal: controller.signal })
      .then(value => {
        if (current !== generation.current) return;
        setProgress(value); restore(value.submission);
      }).catch(failure => {
        if (current === generation.current) setError(failure.name === 'AbortError' ? 'Loading took too long. Try loading your explanation again.' : failure.message);
      }).finally(() => clearTimeout(timeout));
    return () => { generation.current++; clearTimeout(timeout); controller.abort(); };
  }, [task.id, task.snapshotId, task.contentVersion, reload]);

  async function save(review: boolean) {
    if (!progress || busy) return;
    const current = generation.current;
    const submission = progress.submission;
    setBusy(true); setError('');
    try {
      const value = await api<TeachBackSubmission>(review ? '/api/teach-back/review' : '/api/teach-back', {
        method: 'POST', signal: AbortSignal.timeout(15_000),
        body: JSON.stringify(review && submission ? {
          snapshotId: task.snapshotId, submissionId: submission.id,
          assessments: submission.concepts.map(concept => ({ conceptId: concept.id, state: assessments[concept.id] })),
        } : { taskId: task.id, snapshotId: task.snapshotId, contentVersion: task.contentVersion, text: text.trim() }),
      });
      if (current !== generation.current) return;
      setProgress({ ...progress, submission: value }); restore(value);
    } catch (failure) {
      if (current === generation.current) setError((failure as Error).name === 'TimeoutError'
        ? 'The request took too long. Your draft is here. Reload the checkpoint to check whether it saved before trying again.'
        : (failure as Error).message);
    } finally { if (current === generation.current) setBusy(false); }
  }

  const submission = progress?.submission;
  const ready = submission?.concepts.every(concept => Boolean(assessments[concept.id]));
  return <section className="teach-back" aria-label="Explain in your own words" aria-busy={busy}>
    <span className="mission-kicker">Teach-back</span>
    <h4>Explain in your own words</h4>
    {!progress ? error ? <><p role="alert" className="mission-warning">{error}</p><button type="button" className="text-button" onClick={() => setReload(value => value + 1)}>Reload explanation</button></> : <p role="status">Loading your saved explanation…</p> : !progress.available ? <p className="mission-note">This checkpoint has no prepared teach-back rubric yet. You can still verify the feedback against its source.</p> : <>
      <p>Explain why your prediction does or does not match the source. Then compare your explanation with each concept.</p>
      <p className="mission-note">Your explanation and self-review are saved in this browser’s anonymous session. They do not receive an automatic mastery score.</p>
      {submission ? <>
        <div className="teach-back-saved"><strong>Your saved explanation</strong><p>{submission.text}</p></div>
        <div className="mission-context">{submission.evidenceIds.map((id, index) => <button type="button" className="evidence-link" key={id} onClick={() => onEvidence(id)}>Check concept source {index + 1} ↗</button>)}</div>
        <form onSubmit={event => { event.preventDefault(); void save(true); }}>
          <p>Check every concept against the source before recording your assessment.</p>
          {submission.concepts.map((concept, index) => <fieldset className="teach-back-concept" key={concept.id} disabled={busy}>
            <legend>{concept.prompt}</legend>
            {(['understood', 'missing', 'uncertain'] as const).map(state => <label key={state}>
              <input type="radio" name={`concept-${submission.id}-${index}`} checked={assessments[concept.id] === state} onChange={() => setAssessments(value => ({ ...value, [concept.id]: state }))} />
              {state === 'understood' ? 'I can explain this' : state === 'missing' ? 'Missing from my explanation' : 'I am unsure'}
            </label>)}
          </fieldset>)}
          <button type="submit" className="primary-button" disabled={busy || !ready}>{busy ? 'Saving…' : 'Save self-review'}</button>
        </form>
        {submission.status === 'self_reviewed' && <div className="teach-back-follow-ups" role="status">
          <strong>Self-review saved</strong>
          <p>{submission.limitations.join(' ')}</p>
          {submission.followUps?.length ? <><h4>Practice the concepts you flagged</h4>{submission.followUps.map(followUp => <article key={followUp.conceptId}>
            <p>{followUp.prompt}</p>
            <div className="mission-context">{followUp.evidenceIds.map((id, index) => <button type="button" className="evidence-link" key={id} onClick={() => onEvidence(id)}>Revisit source {index + 1} ↗</button>)}</div>
            {onTask && <button type="button" className="text-button" onClick={() => onTask(followUp.taskId)}>Practice this concept →</button>}
          </article>)}</> : <p>You marked every concept as explainable. Ask a peer to check your reasoning, or continue the walkthrough.</p>}
        </div>}
        <button type="button" className="text-button" disabled={busy} onClick={() => { setProgress({ ...progress, submission: null }); setAssessments({}); setError(''); }}>Revise my explanation</button>
      </> : <form onSubmit={event => { event.preventDefault(); void save(false); }}>
        <label className="teach-back-draft">Your explanation<textarea rows={5} minLength={10} maxLength={2000} required value={text} disabled={busy} onChange={event => setText(event.target.value)} aria-describedby="teach-back-length" /></label>
        <p id="teach-back-length" className="mission-note">{text.trim().length} / 2,000 characters · at least 10 characters</p>
        <button type="submit" className="primary-button" disabled={busy || text.trim().length < 10}>{busy ? 'Saving…' : 'Save explanation and review concepts'}</button>
      </form>}
      {error && <p role="alert" className="mission-warning">{error}</p>}
    </>}
  </section>;
}
