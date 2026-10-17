"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, BookmarkPlus, BookOpen, ChevronRight, History, MessageSquare, RotateCcw } from "lucide-react";
import { z } from "zod";
import type { Depth, Guide, GuideStep, QuestionInput, Snapshot, SourceDocument, SourceFile, QaResponse } from "@/contracts";
import { api } from "@/lib/client/api";
import "./question-panel.css";
import "./workspace/notebook.css";

type Scope = "repository" | "file" | "selection" | "walkthrough";
type QuestionContext = { question: string; snapshotId: string; scope: Scope; depth: Depth; fileId?: string; path?: string; startLine?: number; endLine?: number; guideId?: string; guideTitle?: string; stepId?: string; stepTitle?: string };
type HistoryEntry = { id: string; context: QuestionContext; response: QaResponse };
type FailedQuestion = { context: QuestionContext; message: string };
type AnswerStatus = { provider?: string; preparedAvailable: boolean; liveConfigured: boolean; liveStatus: "unverified" };
type StoredAnswer = { id: string; snapshotId: string; createdAt: string; payload: { question: string; context: QuestionInput; response: QaResponse; model?: string | null; provider?: string | null } };
const HISTORY_LIMIT = 12;
const storageKey = (snapshotId: string) => `astrolabe:mentor-history:v1:${snapshotId}`;
const scopeNames: Record<Scope, string> = { repository: "Repository", file: "Current file", selection: "Selected lines", walkthrough: "This walkthrough" };
const depthName = (depth: Depth) => depth === "developer" ? "Developer" : "Beginner";

const contextSchema = z.object({
  question: z.string().min(3).max(1000), snapshotId: z.string().min(1).max(120),
  scope: z.enum(["repository", "file", "selection", "walkthrough"]), depth: z.enum(["beginner", "developer"]),
  fileId: z.string().min(1).max(160).optional(), path: z.string().min(1).max(300).optional(),
  startLine: z.number().int().positive().optional(), endLine: z.number().int().positive().optional(),
  guideId: z.string().min(1).max(120).optional(), guideTitle: z.string().min(1).max(300).optional(),
  stepId: z.string().min(1).max(120).optional(), stepTitle: z.string().min(1).max(300).optional(),
}).refine((value) => {
  const noSource = !value.fileId && !value.path && value.startLine === undefined && value.endLine === undefined;
  const noWalkthrough = !value.guideId && !value.guideTitle && !value.stepId && !value.stepTitle;
  if (value.scope === "walkthrough") return noSource && !!value.guideId && !!value.guideTitle && !!value.stepId && !!value.stepTitle;
  if (value.scope === "repository") return noSource && noWalkthrough;
  return noWalkthrough && !!value.fileId && !!value.path && (value.scope === "file"
    ? value.startLine === undefined && value.endLine === undefined
    : value.startLine !== undefined && value.endLine !== undefined && value.endLine >= value.startLine);
});
const entrySchema = z.object({
  id: z.string().min(1).max(100), context: contextSchema,
  response: z.object({
    status: z.enum(["answered", "evidence_gap", "unavailable"]), mode: z.enum(["live", "reviewed"]),
    answer: z.string().min(1).max(24_000), cached: z.boolean().optional(),
    provider: z.string().max(100).optional(), model: z.string().max(200).optional(),
    answerId: z.string().min(1).max(200).optional(),
    reviewState: z.enum(["authored", "generated", "human_reviewed"]).optional(),
    blocks: z.array(z.object({
      text: z.string().min(1).max(3000), kind: z.enum(["observed", "inferred", "unknown"]),
      evidenceIds: z.array(z.string().min(1).max(200)).max(8),
    }).refine((block) => block.kind === "unknown" ? block.evidenceIds.length === 0 : block.evidenceIds.length > 0)).min(1).max(8).optional(),
    limitations: z.array(z.string().max(1000)).max(16),
    citations: z.array(z.object({
      evidenceId: z.string().min(1).max(200), snapshotId: z.string().min(1).max(120),
      fileId: z.string().min(1).max(160), startLine: z.number().int().positive(), endLine: z.number().int().positive(),
      contentHash: z.string().max(200), text: z.literal(""),
    }).refine((value) => value.endLine >= value.startLine)).max(8),
  }).refine((value) => value.status === "answered" ? value.citations.length > 0 : value.citations.length === 0)
    .refine((value) => !value.blocks || value.blocks.every((block) => block.evidenceIds.every((id) => value.citations.some((citation) => citation.evidenceId === id)))),
});

function readSaved(snapshotId: string): { entries: HistoryEntry[]; selectedId: string | null; draft: string; scope: Scope } {
  const empty = { entries: [], selectedId: null, draft: "", scope: "file" as Scope };
  try {
    const raw = window.localStorage.getItem(storageKey(snapshotId));
    if (!raw || raw.length > 1_000_000) return empty;
    const saved = JSON.parse(raw);
    if (saved?.version !== 1 || saved.snapshotId !== snapshotId || !Array.isArray(saved.entries)) return empty;
    const seen = new Set<string>();
    const entries: HistoryEntry[] = [];
    for (const candidate of saved.entries.slice(0, HISTORY_LIMIT)) {
      const parsed = entrySchema.safeParse(candidate);
      if (!parsed.success || parsed.data.context.snapshotId !== snapshotId || seen.has(parsed.data.id)
        || parsed.data.response.citations.some((citation) => citation.snapshotId !== snapshotId)) continue;
      seen.add(parsed.data.id); entries.push(parsed.data);
    }
    return {
      entries,
      selectedId: entries.some((entry) => entry.id === saved.selectedId) ? saved.selectedId : entries[0]?.id ?? null,
      draft: typeof saved.draft === "string" ? saved.draft.slice(0, 1000) : "",
      scope: ["repository", "file", "selection", "walkthrough"].includes(saved.scope) ? saved.scope : "file",
    };
  } catch { return empty; }
}

function writeSaved(snapshotId: string, entries: HistoryEntry[], selectedId: string | null, draft: string, scope: Scope) {
  const selected = entries.find(entry => entry.id === selectedId);
  const cached = entries.slice(0, HISTORY_LIMIT);
  if (selected && !cached.some(entry => entry.id === selected.id)) cached.splice(HISTORY_LIMIT - 1, 1, selected);
  try { window.localStorage.setItem(storageKey(snapshotId), JSON.stringify({ version: 1, snapshotId, entries: cached, selectedId, draft, scope })); }
  catch { /* The session still works if browser storage is unavailable or full. */ }
}

function contextLabel(context: QuestionContext, repositoryName: string) {
  if (context.scope === "repository") return `${repositoryName} · whole repository`;
  if (context.scope === "walkthrough") return `${context.guideTitle} · Step: ${context.stepTitle}`;
  return `${context.path}${context.scope === "selection" ? ` · lines ${context.startLine}–${context.endLine}` : " · whole file"}`;
}

function requestBody(context: QuestionContext): QuestionInput {
  return { question: context.question, snapshotId: context.snapshotId, scope: context.scope, depth: context.depth,
    ...(context.scope === "file" || context.scope === "selection" ? { fileId: context.fileId } : {}),
    ...(context.scope === "walkthrough" ? { guideId: context.guideId, stepId: context.stepId } : {}),
    ...(context.scope === "selection" ? { startLine: context.startLine, endLine: context.endLine } : {}) };
}

function restoreAnswer(record: StoredAnswer, snapshotId: string, files: SourceFile[], guides: Guide[]): HistoryEntry | null {
  if (record.snapshotId !== snapshotId || record.payload.context.snapshotId !== snapshotId) return null;
  const input = record.payload.context;
  const scope = input.scope ?? (input.guideId ? "walkthrough" : input.startLine !== undefined ? "selection" : input.fileId ? "file" : "repository");
  const guide = guides.find(item => item.id === input.guideId);
  const step = guide?.steps.find(item => item.id === input.stepId);
  const response = record.payload.response;
  const parsed = entrySchema.safeParse({ id: record.id, context: {
    question: record.payload.question, snapshotId, scope, depth: input.depth ?? "beginner",
    ...(input.fileId ? { fileId: input.fileId, path: files.find(file => file.fileId === input.fileId)?.path ?? input.fileId } : {}),
    ...(input.startLine !== undefined ? { startLine: input.startLine, endLine: input.endLine } : {}),
    ...(input.guideId ? { guideId: input.guideId, guideTitle: guide?.title ?? input.guideId, stepId: input.stepId, stepTitle: step?.title ?? input.stepId } : {}),
  }, response: { ...response, answerId: record.id,
    ...(response.mode === "live" ? { provider: response.provider ?? record.payload.provider ?? undefined, model: response.model ?? record.payload.model ?? undefined } : {}),
    citations: response.citations.map(citation => ({ ...citation, text: "" })),
  } });
  return parsed.success && parsed.data.response.citations.every(citation => citation.snapshotId === snapshotId) ? parsed.data : null;
}

function mergeHistory(current: HistoryEntry[], restored: HistoryEntry[]) {
  const key = (entry: HistoryEntry) => entry.response.answerId ?? entry.id;
  const currentById = new Map(current.map(entry => [key(entry), entry]));
  const restoredIds = new Set(restored.map(key));
  // Server rows establish chronology; retain the richer original POST metadata for matching rows.
  return [...current.filter(entry => !restoredIds.has(key(entry))), ...restored.map(entry => currentById.get(key(entry)) ?? entry)].slice(0, 100);
}

function answerLabel(response: QaResponse) {
  if (response.status === "evidence_gap") return "Evidence gap";
  if (response.status === "unavailable") return "Live AI unavailable";
  return response.mode === "reviewed" ? "Prepared answer" : response.provider === "lmstudio" ? "Local AI answer" : "Live AI answer";
}

export function QuestionPanel({ snapshot, document, range, depth, onEvidence, files, guide, step, sourceLoading = false }: {
  snapshot: Snapshot; document: SourceDocument | null; range: { startLine: number; endLine: number } | null;
  depth: Depth; onEvidence: (id: string, snapshotId?: string) => void; files?: SourceFile[]; guide?: Guide; step?: GuideStep; sourceLoading?: boolean;
}) {
  const uid = useId();
  const [question, setQuestion] = useState("");
  const [scope, setScope] = useState<Scope>("file");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<QuestionContext | null>(null);
  const [failed, setFailed] = useState<FailedQuestion | null>(null);
  const [loadedSnapshot, setLoadedSnapshot] = useState<string | null>(null);
  const [inventory, setInventory] = useState<SourceFile[]>([]);
  const [questionGuides, setQuestionGuides] = useState<Guide[]>([]);
  const [availability, setAvailability] = useState<AnswerStatus | null>(null);
  const [scopeNotice, setScopeNotice] = useState("");
  const [historyStatus, setHistoryStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [historyReload, setHistoryReload] = useState(0);
  const [bookmarkDraft, setBookmarkDraft] = useState<{ answerId: string; title: string; note: string } | null>(null);
  const [bookmarkStatus, setBookmarkStatus] = useState("");
  const [bookmarkPending, setBookmarkPending] = useState(false);
  const currentSnapshot = useRef(snapshot.snapshotId);
  const requestNumber = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLElement>(null);
  const revealAnswer = useRef(false);
  const hasFile = !!document && document.file.snapshotId === snapshot.snapshotId;
  const validRange = hasFile && !!range && Number.isInteger(range.startLine) && Number.isInteger(range.endLine)
    && range.startLine >= 1 && range.endLine >= range.startLine && range.endLine <= document.file.lineCount;
  const hasWalkthrough = !!guide && !!step && guide.snapshotId === snapshot.snapshotId && guide.steps.some((item) => item.id === step.id);
  const activeScope = (scope === "selection" && !validRange || scope === "walkthrough" && !hasWalkthrough) ? (hasFile ? "file" : "repository")
    : scope === "file" && !hasFile ? "repository" : scope;
  const sourcePending = sourceLoading && (scope === "file" || scope === "selection");
  const selected = history.find((entry) => entry.id === selectedId) ?? history[0];
  const sourceFiles = files ?? inventory;
  const context: QuestionContext = {
    question: question.trim(), snapshotId: snapshot.snapshotId, scope: activeScope, depth,
    ...((activeScope === "file" || activeScope === "selection") && document ? { fileId: document.file.fileId, path: document.file.path } : {}),
    ...(activeScope === "walkthrough" && guide && step ? { guideId: guide.id, guideTitle: guide.title, stepId: step.id, stepTitle: step.title } : {}),
    ...(activeScope === "selection" && range ? { startLine: range.startLine, endLine: range.endLine } : {}),
  };

  useEffect(() => {
    currentSnapshot.current = snapshot.snapshotId; requestNumber.current++;
    const saved = readSaved(snapshot.snapshotId);
    setHistory(saved.entries); setSelectedId(saved.selectedId); setQuestion(saved.draft); setScope(saved.scope);
    setPending(null); setFailed(null); setScopeNotice(""); setLoadedSnapshot(snapshot.snapshotId);
    setBookmarkDraft(null); setBookmarkStatus(""); setBookmarkPending(false); setQuestionGuides([]);
    return () => { currentSnapshot.current = ""; requestNumber.current++; };
  }, [snapshot.snapshotId]);
  useEffect(() => {
    let cancelled = false;
    const snapshotId = snapshot.snapshotId;
    setHistoryStatus("loading");
    Promise.all([
      api<{ answers: StoredAnswer[] }>(`/api/questions/history?snapshotId=${encodeURIComponent(snapshotId)}`, { cache: "no-store" }),
      api<{ guides: Guide[] }>(`/api/guides?snapshotId=${encodeURIComponent(snapshotId)}`).catch(() => ({ guides: [] })),
      files ? Promise.resolve({ files }) : api<{ files: SourceFile[] }>(`/api/repository?snapshotId=${encodeURIComponent(snapshotId)}`).catch(() => ({ files: [] })),
    ]).then(([value, learning, repository]) => {
      if (cancelled || currentSnapshot.current !== snapshotId) return;
      const entries = value.answers.slice().reverse().map(record => restoreAnswer(record, snapshotId, repository.files, learning.guides)).filter((entry): entry is HistoryEntry => !!entry);
      setQuestionGuides(learning.guides);
      setHistory(previous => mergeHistory(previous, entries));
      setSelectedId(previous => previous ?? entries[0]?.id ?? null);
      setHistoryStatus("ready");
    }).catch(() => { if (!cancelled && currentSnapshot.current === snapshotId) setHistoryStatus("failed"); });
    return () => { cancelled = true; };
  }, [snapshot.snapshotId, files, historyReload]);
  useEffect(() => {
    if (loadedSnapshot === snapshot.snapshotId) writeSaved(snapshot.snapshotId, history, selectedId, question, scope);
  }, [snapshot.snapshotId, loadedSnapshot, history, selectedId, question, scope]);
  useEffect(() => {
    if (!revealAnswer.current || !answerRef.current) return;
    revealAnswer.current = false;
    const panel = answerRef.current.closest<HTMLElement>(".mentor-slot");
    // Scroll only the mentor's own viewport; keep the source and the page in place.
    if (!panel?.clientHeight || panel.scrollHeight <= panel.clientHeight
      || !/auto|scroll/.test(window.getComputedStyle(panel).overflowY)) return;
    panel.scrollTo({
      top: panel.scrollTop + answerRef.current.getBoundingClientRect().top - panel.getBoundingClientRect().top - 16,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }, [selected?.id]);
  useEffect(() => {
    if (sourceLoading) return;
    if (scope === "walkthrough" && !hasWalkthrough && loadedSnapshot === snapshot.snapshotId) {
      setScope(hasFile ? "file" : "repository");
      setScopeNotice(`The next question uses ${hasFile ? "Current file" : "Repository"}. Select This walkthrough in Learn to ask about a flow.`);
    }
    if (scope === "selection" && !validRange && loadedSnapshot === snapshot.snapshotId) {
      setScope(hasFile ? "file" : "repository");
      setScopeNotice(hasFile ? "No selected lines. The next question uses Current file." : "No source file is open. The next question uses Repository.");
    }
  }, [scope, validRange, hasFile, hasWalkthrough, sourceLoading, loadedSnapshot, snapshot.snapshotId]);
  useEffect(() => {
    let cancelled = false;
    setAvailability(null);
    api<AnswerStatus>(`/api/questions/status?snapshotId=${encodeURIComponent(snapshot.snapshotId)}`).then((value) => { if (!cancelled) setAvailability(value); }).catch(() => {});
    return () => { cancelled = true; };
  }, [snapshot.snapshotId]);
  useEffect(() => {
    if (files) return;
    let cancelled = false;
    api<{ files: SourceFile[] }>(`/api/repository?snapshotId=${encodeURIComponent(snapshot.snapshotId)}`).then((value) => {
      if (!cancelled) setInventory(value.files.filter((file) => file.snapshotId === snapshot.snapshotId));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [files, snapshot.snapshotId]);

  async function send(original: QuestionContext) {
    if (pending || original.question.length < 3 || loadedSnapshot !== snapshot.snapshotId) return;
    const submission = { ...original }; const number = ++requestNumber.current;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 75_000);
    setPending(submission); setFailed(null);
    try {
      const response = await api<QaResponse>("/api/questions", { method: "POST", body: JSON.stringify(requestBody(submission)), signal: controller.signal });
      // Fetch source excerpts through verified links; history needs only reference metadata.
      const entry: HistoryEntry = { id: response.answerId ?? `${Date.now()}-${number}`, context: submission,
        response: { ...response, citations: response.citations.map((citation) => ({ ...citation, text: "" })) } };
      if (currentSnapshot.current === submission.snapshotId && number === requestNumber.current) {
        revealAnswer.current = true;
        setHistory((previous) => [entry, ...previous.filter(item => item.id !== entry.id)].slice(0, 100)); setSelectedId(entry.id);
      }
    } catch (error) {
      if (currentSnapshot.current === submission.snapshotId && number === requestNumber.current) {
        setFailed({ context: submission, message: controller.signal.aborted ? "The request took too long. Your question is still here; you can retry it." : error instanceof Error ? error.message : "The question could not be sent. Try again." });
      }
    } finally {
      window.clearTimeout(timeout);
      if (currentSnapshot.current === submission.snapshotId && number === requestNumber.current) setPending(null);
    }
  }
  async function saveAnswer() {
    if (!bookmarkDraft || bookmarkPending || !selected || selected.response.answerId !== bookmarkDraft.answerId) return;
    const snapshotId = selected.context.snapshotId;
    setBookmarkPending(true); setBookmarkStatus("");
    try {
      await api("/api/notebook/bookmarks", { method: "POST", body: JSON.stringify({ snapshotId, title: bookmarkDraft.title, note: bookmarkDraft.note, answerId: bookmarkDraft.answerId }) });
      if (currentSnapshot.current !== snapshotId) return;
      setBookmarkDraft(null); setBookmarkStatus("Answer saved to your notebook with its original context and citations.");
      window.dispatchEvent(new CustomEvent("astrolabe:notebook-changed", { detail: { snapshotId } }));
    } catch (error) { if (currentSnapshot.current === snapshotId) setBookmarkStatus(error instanceof Error ? error.message : "Could not save the answer. Your note is still here."); }
    finally { if (currentSnapshot.current === snapshotId) setBookmarkPending(false); }
  }
  function ask(value = question) { setQuestion(value); if (!sourcePending) void send({ ...context, question: value.trim() }); }
  function chooseScope(next: Scope) { setScope(next); setScopeNotice(""); }
  // Prepared prompts belong to their authored learning pack; source suggestions use returned metadata.
  const preparedPrompts: Record<string, string[]> = {
    "store-to-react": ["What is getInitialState?"],
    "state-to-subscribers": ["How does setState update state?", "How do I unsubscribe?"],
  };
  const preparedQuestion = questionGuides.flatMap(item => preparedPrompts[item.id] ?? [])[0];
  function prepareQuestion() { chooseScope("repository"); setQuestion(preparedQuestion ?? "Which exported functions define the public API?"); textareaRef.current?.focus(); }
  const suggestions = activeScope === "walkthrough" && guide
    ? preparedPrompts[guide.id] ?? [`How do the steps in ${guide.title} connect?`]
    : activeScope === "repository" ? [preparedQuestion ?? "Which exported functions define the public API?"]
      : document ? [`What does ${document.file.path} do?`] : [];

  return (
    <section className="mentor-panel qa-panel" aria-labelledby={`${uid}-title`}>
      <div className="mentor-announcement" role="status" aria-live="polite">{selected ? `${answerLabel(selected.response)} for: ${selected.context.question}` : ""}</div>
      <header className="mentor-question-heading">
        <div className="mentor-panel-kicker"><MessageSquare size={15} aria-hidden="true" /> YOUR CODEBASE MENTOR</div>
        <h2 id={`${uid}-title`}>Ask, then verify.</h2><p>Keep an explanation beside the source. Follow a reference to check it yourself.</p>
      </header>
      <form className="mentor-composer" onSubmit={(event) => { event.preventDefault(); ask(); }}>
        <fieldset className="mentor-scope"><legend>Question scope</legend><div className="mentor-scope-options">
          {(["repository", "file", "selection", "walkthrough"] as Scope[]).map((option) => <label key={option} className={activeScope === option ? "is-active" : ""}>
            <input type="radio" name={`${uid}-scope`} value={option} checked={activeScope === option}
              disabled={option === "file" ? !hasFile || sourceLoading : option === "selection" ? !validRange || sourceLoading : option === "walkthrough" ? !hasWalkthrough : false} onChange={() => chooseScope(option)} /><span>{scopeNames[option]}</span>
          </label>)}
        </div></fieldset>
        <div className={`mentor-current-context ${activeScope === "walkthrough" ? "is-walkthrough" : ""}`} id={`${uid}-context`}><span>{scopeNames[activeScope]} · {depthName(depth)}</span><strong>{contextLabel(context, snapshot.name)}</strong>{activeScope === "walkthrough" ? <small>Uses reviewed source across this flow, starting with this step.</small> : !validRange && <small>Select lines in the editor to use Selected lines.</small>}</div>
        {sourceLoading && <p className="mentor-context-notice" role="status">Opening the cited source… File and selected-line questions will be ready when it finishes.</p>}
        {scopeNotice && <p className="mentor-context-notice" role="status">{scopeNotice}</p>}
        <label className="mentor-question-label" htmlFor={`${uid}-question`}>Your question</label>
        <div className="mentor-question-field"><textarea id={`${uid}-question`} ref={textareaRef} aria-label="Ask a question about this code" aria-describedby={`${uid}-context`} placeholder={activeScope === "walkthrough" ? "How do the steps in this walkthrough connect?" : "What happens when the state changes?"} maxLength={1000} value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} />
          <div className="mentor-composer-actions"><span>{question.length}/1000</span><button type="submit" className="mentor-send" disabled={!!pending || sourcePending || question.trim().length < 3 || loadedSnapshot !== snapshot.snapshotId} aria-label="Send question">Ask mentor <ArrowUpRight size={16} aria-hidden="true" /></button></div>
        </div>
      </form>
      {!selected && !pending && <div className="mentor-suggestions"><span>Source questions to try</span>{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => ask(suggestion)}>{suggestion}<ChevronRight size={15} aria-hidden="true" /></button>)}{!suggestions.length && <p>Ask about a function in this file, or choose Repository for the prepared questions.</p>}</div>}
      {pending && <div className="mentor-pending" role="status" aria-live="polite"><span className="mentor-pending-dot" aria-hidden="true" /><div><strong>Waiting for an answer…</strong><p>{pending.question}</p><small>{contextLabel(pending, snapshot.name)} · {depthName(pending.depth)}</small></div></div>}
      {failed && <div className="mentor-error" role="alert"><strong>Question could not be sent.</strong><p>{failed.message}</p><small>{failed.context.question} · {contextLabel(failed.context, snapshot.name)}</small><button type="button" disabled={!!pending} onClick={() => void send(failed.context)}>Retry this request</button></div>}
      {historyStatus === "loading" && <p className="mentor-context-notice" role="status">Restoring signed-session question history…</p>}
      {historyStatus === "failed" && <div className="mentor-error" role="alert"><p>Saved session history could not be loaded. Recent browser answers and your draft remain available.</p><button type="button" onClick={() => setHistoryReload(value => value + 1)}>Reload saved history</button></div>}
      {history.length > 0 && <nav className="mentor-history" aria-label="Question history">
        <div className="mentor-history-heading"><span><History size={14} aria-hidden="true" /> {history.length} {history.length === 1 ? "question" : "questions"}</span>{selected?.id !== history[0].id && <button type="button" onClick={() => setSelectedId(history[0].id)}>Return to latest answer</button>}</div>
        <details><summary>Question history</summary><ol>{history.map((entry, index) => <li key={entry.id}><button type="button" aria-current={selected?.id === entry.id ? "true" : undefined} onClick={() => setSelectedId(entry.id)}><span>{entry.context.question}</span><small>{index === 0 ? "Latest · " : ""}{scopeNames[entry.context.scope]} · {depthName(entry.context.depth)} · {answerLabel(entry.response)}</small>{entry.context.scope === "walkthrough" && <small>{entry.context.guideTitle} · {entry.context.stepTitle}</small>}</button></li>)}</ol></details>
      </nav>}
      {selected && <article ref={answerRef} className={`mentor-answer qa-response ${selected.response.status}`} aria-labelledby={`${uid}-answer-title`}>
        <div className="mentor-answer-label response-label"><BookOpen size={14} aria-hidden="true" />{answerLabel(selected.response)}</div><h3 id={`${uid}-answer-title`}>{selected.context.question}</h3>
        <p className="mentor-answer-context"><span>{scopeNames[selected.context.scope]} · {depthName(selected.context.depth)} answer</span>{contextLabel(selected.context, snapshot.name)}</p>
        <p className="mentor-context-notice mentor-answer-provenance">Pinned snapshot {selected.context.snapshotId} · commit {snapshot.commitSha.slice(0, 12)}{selected.response.provider ? ` · Provider: ${selected.response.provider}` : " · Provider: not recorded"}{selected.response.model ? ` · Model: ${selected.response.model}` : " · Model: not recorded"}</p>
        <div className="mentor-answer-text">{selected.response.blocks?.length ? selected.response.blocks.map((block, index) => <section className={`mentor-claim ${block.kind}`} key={index} aria-label={`Answer claim ${index + 1}`}>
          <small className="mentor-claim-kind">{block.kind === "observed" ? "From source" : block.kind === "inferred" ? "Interpretation" : "Not established"}</small>
          <p>{block.text}</p>
          {block.evidenceIds.length > 0 && <div className="mentor-citations mentor-claim-references">{block.evidenceIds.map((id) => {
            const citation = selected.response.citations.find((item) => item.evidenceId === id);
            if (!citation) return null;
            const path = sourceFiles.find((file) => file.fileId === citation.fileId)?.path ?? "Source";
            return <button type="button" className="mentor-citation evidence-link" key={id} onClick={() => onEvidence(id, citation.snapshotId)}><span>{path} · lines {citation.startLine}–{citation.endLine}</span><ArrowUpRight size={15} aria-hidden="true" /></button>;
          })}</div>}
        </section>) : selected.response.answer}</div>
        <p className="mentor-review-state">{selected.response.status !== "answered" ? "No source-grounded answer was returned. Review the response notes before trying again." : selected.response.reviewState === "human_reviewed" ? "Human review recorded." : selected.response.mode === "reviewed" ? "Authored prepared content · independent human review pending." : "AI-generated · check each claim against the source. Citation checks do not establish correctness."}</p>
        {!selected.response.blocks?.length && selected.response.citations.length > 0 && <div className="mentor-citations"><h4>Check the source</h4>{selected.response.citations.map((citation) => {
          const citationPath = sourceFiles.find((file) => file.fileId === citation.fileId)?.path ?? (document?.file.fileId === citation.fileId ? document.file.path : selected.context.fileId === citation.fileId ? selected.context.path : undefined);
          return <button type="button" key={citation.evidenceId} className="mentor-citation evidence-link" onClick={() => onEvidence(citation.evidenceId, citation.snapshotId)}><BookOpen size={14} aria-hidden="true" /><span>{citationPath ?? "Source reference"} · lines {citation.startLine}–{citation.endLine}</span><ArrowUpRight size={15} aria-hidden="true" /></button>;
        })}</div>}
        {selected.response.status === "evidence_gap" && <div className="mentor-next-action"><p>{selected.context.scope === "repository" ? "Repository scope was already used. Try a more specific source question, open a relevant file or select the lines you want to understand." : "Try a narrower source question or select a relevant range. If the question spans files, you can deliberately use Repository scope."}</p>{selected.context.scope !== "repository" && <button type="button" onClick={() => { chooseScope("repository"); textareaRef.current?.focus(); }}>Use Repository scope</button>}</div>}
        {selected.response.status === "unavailable" && <div className="mentor-next-action"><p>Prepared questions and walkthroughs remain available. Configuration does not verify provider availability.{selected.context.scope === "repository" ? " This request already used Repository scope; broadening it cannot restore provider service." : " If the question spans files, you can deliberately use Repository scope."}</p>{selected.context.scope !== "repository" && <button type="button" onClick={() => { chooseScope("repository"); textareaRef.current?.focus(); }}>Use Repository scope</button>}{hasWalkthrough && selected.context.scope !== "walkthrough" && <button type="button" onClick={() => { chooseScope("walkthrough"); textareaRef.current?.focus(); }}>Use This walkthrough scope</button>}<button type="button" onClick={prepareQuestion}>{preparedQuestion ? "Try a prepared question" : "Try a source question"}</button><button type="button" disabled={!!pending} onClick={() => void send(selected.context)}>Ask this question again</button></div>}
        {selected.context.depth !== depth && <button type="button" className="mentor-depth-action" disabled={!!pending} onClick={() => void send({ ...selected.context, depth })}><RotateCcw size={14} aria-hidden="true" />Ask again at {depthName(depth)} depth</button>}
        {selected.response.limitations.length > 0 && <details className="mentor-answer-notes"><summary>Answer notes and limits</summary><ul>{selected.response.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul></details>}
        {selected.response.answerId && <div className="notebook-save-answer">
          {bookmarkDraft?.answerId === selected.response.answerId ? <form onSubmit={event => { event.preventDefault(); void saveAnswer(); }}>
            <label>Bookmark title<input maxLength={160} required value={bookmarkDraft.title} onChange={event => setBookmarkDraft({ ...bookmarkDraft, title: event.target.value })} /></label>
            <label>Bookmark note<textarea maxLength={3000} rows={3} value={bookmarkDraft.note} onChange={event => setBookmarkDraft({ ...bookmarkDraft, note: event.target.value })} /></label>
            <div className="notebook-actions"><button type="submit" disabled={bookmarkPending || !bookmarkDraft.title.trim()}>Save answer to notebook</button><button type="button" disabled={bookmarkPending} onClick={() => setBookmarkDraft(null)}>Cancel bookmark</button></div>
          </form> : <button type="button" className="mentor-depth-action" onClick={() => { setBookmarkDraft({ answerId: selected.response.answerId!, title: selected.context.question.slice(0, 160), note: "" }); setBookmarkStatus(""); }}><BookmarkPlus size={14} aria-hidden="true" />Bookmark this answer</button>}
        </div>}
        {bookmarkStatus && <p className="mentor-context-notice" role="status">{bookmarkStatus}</p>}
        <button type="button" className="mentor-depth-action" onClick={() => textareaRef.current?.focus()}><MessageSquare size={14} aria-hidden="true" />Back to your question</button>
      </article>}
      <footer className="mentor-panel-footer"><span>{availability?.preparedAvailable === false ? "No prepared answers reported" : "Prepared answers available"}</span><span>{availability?.liveConfigured ? (availability.provider === "lmstudio" ? "Local AI configured · service unverified" : "Live configured · provider unverified") : availability ? "Live AI not configured" : "Live provider status unverified"}</span><small>Signed-session history restores up to 100 answers for this snapshot; 12 recent answers and your draft are also cached in this browser. Practice reset preserves saved answers and bookmarks.</small></footer>
    </section>
  );
}
