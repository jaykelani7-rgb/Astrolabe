"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, BookmarkPlus, Target } from "lucide-react";
import type { ContributionBrief, LearningGoal, Results } from "@/contracts";
import { api } from "@/lib/client/api";
import "./goals.css";

type Recommendation = ContributionBrief & {
  goalMatch: "direct" | "partial";
  status: "review_prerequisites" | "ready_to_explore";
  remediationTaskIds: string[];
  reason: string;
  score: number;
};

type GoalRecord = { snapshotId: string; goal: LearningGoal | null };
type ContributionPlan = {
  snapshotId: string;
  goal: LearningGoal;
  recommendations: Recommendation[];
  limitations: string[];
};
type LoadedGoals = GoalRecord & { plan: ContributionPlan; results: Results };

const goals: { value: LearningGoal; label: string }[] = [
  { value: "architecture", label: "Understand the architecture" },
  { value: "debug", label: "Investigate a bug" },
  { value: "tests", label: "Explore testing" },
  { value: "documentation", label: "Improve documentation" },
];

function prerequisiteReason(task: Results["tasks"][number] | undefined): string {
  if (!task) return "Practice details could not be found in this snapshot. Reload the recommendations before continuing.";
  if (!task.attempts) return "Not attempted yet. Read its source and try the checkpoint before drafting this explanation.";
  const flags = [
    ...(!task.completed || !task.lastCorrect ? ["the latest prediction needs review"] : []),
    ...(!task.firstAttemptCorrect ? ["the first prediction was incorrect"] : []),
    ...(task.hintsUsed ? [`${task.hintsUsed} hint request${task.hintsUsed === 1 ? " was" : "s were"} recorded`] : []),
  ];
  return flags.length
    ? `Revisit this concept: ${flags.join("; ")}. ${task.hintsUsed || task.attempts > 1 ? "Hints or retries are recorded here. " : ""}Explain your reasoning again and check it against the source.`
    : "Related practice is complete. Check the source and upstream contribution guidance before drafting.";
}

export function LearningGoals({ snapshotId, onPractice, onEvidence, refreshKey = 0, onBookmarkBrief }: {
  snapshotId: string;
  onPractice: (taskId: string, snapshotId: string) => void;
  onEvidence: (id: string, snapshotId?: string) => void;
  refreshKey?: number;
  onBookmarkBrief?: (briefId: string, title: string) => void;
}) {
  const headingId = useId();
  const [loaded, setLoaded] = useState<LoadedGoals | null>(null);
  const [draft, setDraft] = useState<{ snapshotId: string; goal: LearningGoal }>({ snapshotId, goal: "documentation" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [savedMessage, setSavedMessage] = useState("");
  const requestId = useRef(0);
  const currentSnapshot = useRef(snapshotId);
  currentSnapshot.current = snapshotId;

  async function loadPlan(id: string, goal: LearningGoal | null, signal?: AbortSignal) {
    const query = new URLSearchParams({ snapshotId: id, ...(goal ? { goal } : {}) });
    const [plan, results] = await Promise.all([
      api<ContributionPlan>(`/api/contributions?${query}`, { cache: "no-store", signal }),
      api<Results>(`/api/results?${new URLSearchParams({ snapshotId: id })}`, { cache: "no-store", signal }),
    ]);
    if (plan.snapshotId !== id || (goal && plan.goal !== goal)) throw new Error("The recommendations belong to a different snapshot or goal. Reload to continue.");
    return { plan, results };
  }

  useEffect(() => {
    const controller = new AbortController();
    const request = ++requestId.current;
    setLoading(true); setSaving(false); setError(""); setSavedMessage("");
    async function restore() {
      try {
        const record = await api<GoalRecord>(`/api/learning/goal?${new URLSearchParams({ snapshotId })}`, { cache: "no-store", signal: controller.signal });
        if (record.snapshotId !== snapshotId) throw new Error("The saved goal belongs to a different source snapshot.");
        const recommendation = await loadPlan(snapshotId, record.goal, controller.signal);
        if (requestId.current !== request || currentSnapshot.current !== snapshotId) return;
        setLoaded({ ...record, ...recommendation });
        setDraft((previous) => ({ snapshotId, goal: previous.snapshotId === snapshotId && loaded?.snapshotId === snapshotId ? previous.goal : record.goal ?? "documentation" }));
      } catch (failure) {
        if (requestId.current === request && currentSnapshot.current === snapshotId && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Your learning goal could not be restored.");
      } finally {
        if (requestId.current === request && currentSnapshot.current === snapshotId) setLoading(false);
      }
    }
    void restore();
    return () => { ++requestId.current; controller.abort(); };
    // refreshKey updates prerequisite status while retaining an unsaved goal selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotId, refreshKey, retry]);

  const current = loaded?.snapshotId === snapshotId ? loaded : null;
  const selectedGoal = draft.snapshotId === snapshotId ? draft.goal : "documentation";

  async function saveGoal() {
    const id = snapshotId, goal = selectedGoal, request = ++requestId.current;
    setSaving(true); setError(""); setSavedMessage("");
    try {
      const record = await api<GoalRecord>("/api/learning/goal", { method: "POST", cache: "no-store", body: JSON.stringify({ snapshotId: id, goal }) });
      if (record.snapshotId !== id || record.goal !== goal) throw new Error("The saved goal response does not match this snapshot. Reload your goal before continuing.");
      const recommendation = await loadPlan(id, goal);
      if (requestId.current !== request || currentSnapshot.current !== id) return;
      setLoaded({ ...record, ...recommendation });
      setSavedMessage("Goal saved for this snapshot.");
    } catch (failure) {
      if (requestId.current === request && currentSnapshot.current === id) setError(failure instanceof Error ? failure.message : "The goal could not be saved. Your selection is still here.");
    } finally {
      if (requestId.current === request && currentSnapshot.current === id) setSaving(false);
    }
  }

  return <section className="learning-goals" aria-labelledby={headingId} aria-busy={loading || saving}>
    <div className="section-heading"><div><span className="section-label">CHOOSE YOUR NEXT THREAD</span><h2 id={headingId}>Prepared contribution briefs</h2></div><Target size={20} aria-hidden="true" /></div>
    <p className="goals-intro">Save a direction for this snapshot, then review source-linked proposals and the practice behind them.</p>
    <form className="goal-form" onSubmit={(event) => { event.preventDefault(); void saveGoal(); }}>
      <label htmlFor={`${headingId}-goal`}>My learning goal</label>
      <div className="goal-form-controls"><select id={`${headingId}-goal`} value={selectedGoal} disabled={loading || saving || !current} onChange={(event) => { setDraft({ snapshotId, goal: event.target.value as LearningGoal }); setSavedMessage(""); }}>
        {goals.map((goal) => <option key={goal.value} value={goal.value}>{goal.label}</option>)}
      </select><button type="submit" className="primary-button" disabled={loading || saving || !current}>{saving ? "Saving goal…" : "Save learning goal"}</button></div>
    </form>
    {loading && <p role="status">Restoring your goal and recommendations…</p>}
    {savedMessage && <p role="status" className="goal-save-status">{savedMessage}</p>}
    {error && <div className="goal-error" role="alert"><p>{error}</p><button type="button" className="text-button" onClick={() => setRetry((value) => value + 1)}>Reload goal and recommendations</button></div>}
    {current && !loading && <>
      <p className="goal-ranking-context">{current.goal ? `Saved goal: ${goals.find((goal) => goal.value === current.goal)?.label}.` : "No saved goal yet. Showing documentation ideas by default."} {selectedGoal !== current.plan.goal && "Save your selection to update the recommendations."}</p>
      <p className="goal-boundary">Curated documentation proposals, ranked for your goal. The ordering is not a mastery score. Practice completion does not establish mastery or contribution readiness; check current upstream guidance and ask a peer to review your proposal.</p>
      <ol className="goal-recommendations contribution-briefs" aria-label="Ranked contribution recommendations">{current.plan.recommendations.map((brief, index) => <li key={brief.id}>
        <article className="goal-recommendation contribution-brief" aria-label={brief.title}>
          <div className="goal-recommendation-heading"><span className="goal-rank" aria-label={`Rank ${index + 1}`}>{String(index + 1).padStart(2, "0")}</span><div><span className="goal-proposal-label">Curated documentation proposal</span><h3>{brief.title}</h3></div></div>
          <p>{brief.goal}</p><p className="goal-match">{brief.goalMatch === "direct" ? "Direct documentation goal match" : "Partial goal match · documentation proposal"}</p>
          <div className="goal-prerequisites"><h4>{brief.remediationTaskIds.length ? "Practice to revisit" : "Related practice checked"}</h4><p>{brief.reason}</p>
            {brief.remediationTaskIds.length > 0 && <ul>{brief.remediationTaskIds.map((taskId) => {
              const task = current.results.tasks.find((entry) => entry.taskId === taskId);
              return <li key={taskId}><strong>{task?.title ?? taskId}</strong><p>{prerequisiteReason(task)}</p><button type="button" className="text-button" disabled={!task} onClick={() => onPractice(taskId, snapshotId)}>Practice: {task?.title ?? taskId}<ArrowUpRight size={14} aria-hidden="true" /></button></li>;
            })}</ul>}
          </div>
          <details><summary>Review scope and verification steps</summary><h4>Before you begin</h4><ul>{brief.prerequisites.map((item) => <li key={item}>{item}</li>)}</ul><h4>Suggested change</h4><p>{brief.suggestedChange}</p><h4>Verification steps</h4><ol>{brief.verificationSteps.map((step) => <li key={step}>{step}</li>)}</ol>
            <h4>How your results relate to this brief</h4><ul className="brief-result-context">{brief.informedByTaskIds.map((taskId) => {
              const task = current.results.tasks.find((entry) => entry.taskId === taskId);
              return <li key={taskId}><strong>{task?.title ?? taskId}</strong>{task && <p>{task.attempts ? `${task.completed ? "Solved" : "Needs review"} · ${task.firstAttemptCorrect ? "first attempt correct" : "first attempt incorrect"} · ${task.attempts} attempt${task.attempts === 1 ? "" : "s"} · ${task.hintsUsed} hint request${task.hintsUsed === 1 ? "" : "s"}` : "Not attempted"}</p>}<p>{prerequisiteReason(task)}</p></li>;
            })}</ul>
            {brief.remediationTaskIds.length === 0 && <div className="goal-completed-practice">{brief.informedByTaskIds.map((taskId) => {
              const task = current.results.tasks.find((entry) => entry.taskId === taskId);
              return task && <button key={taskId} type="button" className="text-button" onClick={() => onPractice(taskId, snapshotId)}>Revisit: {task.title}<ArrowUpRight size={14} aria-hidden="true" /></button>;
            })}</div>}
          </details>
          <div className="goal-proposal-actions">{brief.evidenceIds.map((id, evidenceIndex) => <button type="button" className="text-button" key={id} onClick={() => onEvidence(id, snapshotId)}>Inspect proposal source {evidenceIndex + 1}<ArrowUpRight size={14} aria-hidden="true" /></button>)}
            {onBookmarkBrief && <button type="button" className="text-button" onClick={() => onBookmarkBrief(brief.id, brief.title)}><BookmarkPlus size={15} aria-hidden="true" />Save proposal to notebook</button>}
          </div>
        </article>
      </li>)}</ol>
      {!current.plan.recommendations.length && <p>No curated documentation proposals are available for this snapshot.</p>}
      <ul className="goal-limitations" aria-label="Recommendation limitations">{current.plan.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
      <p className="goal-boundary">Independent human review of the prepared material is pending.</p>
    </>}
  </section>;
}
