"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, BookMarked, Download, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { ContributionBrief, Evidence, Guide, QaResponse, QuestionInput, Snapshot, SourceFile } from "@/contracts";
import { api, ApiError } from "@/lib/client/api";
import "./notebook.css";

type SavedAnswer = { question: string; context: QuestionInput; response: QaResponse; model?: string | null; provider?: string | null };
type Bookmark = { id: string; snapshotId: string; createdAt: string; payload: {
  title: string; note: string; evidenceIds: string[]; revision: number; updatedAt?: string; savedAnswer?: SavedAnswer; brief?: ContributionBrief;
} };
type BookmarkList = { snapshotId: string; bookmarks: Bookmark[]; total: number; nextOffset: number | null };
type Draft = { title: string; note: string; revision: number };
const PAGE_SIZE = 20;
const draftKey = (snapshotId: string, id: string) => `astrolabe:notebook-draft:v1:${snapshotId}:${id}`;
const notebookUrl = (snapshotId: string) => `/api/notebook/bookmarks?snapshotId=${encodeURIComponent(snapshotId)}`;
function readDraft(snapshotId: string, id: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(snapshotId, id));
    if (!raw || raw.length > 20_000) return null;
    const value = JSON.parse(raw);
    return typeof value.title === "string" && value.title.length <= 160 && typeof value.note === "string" && value.note.length <= 3000
      && Number.isInteger(value.revision) && value.revision > 0 ? value : null;
  } catch { return null; }
}
function forgetDraft(snapshotId: string, id: string) { try { localStorage.removeItem(draftKey(snapshotId, id)); } catch { /* Browser storage is optional. */ } }
function evidenceIds(bookmark: Bookmark) {
  return [...new Set([...bookmark.payload.evidenceIds, ...(bookmark.payload.savedAnswer?.response.citations.map(item => item.evidenceId) ?? []), ...(bookmark.payload.brief?.evidenceIds ?? [])])];
}
function answerLabel(response: QaResponse) {
  return response.status === "evidence_gap" ? "Evidence gap" : response.status === "unavailable" ? "Live AI unavailable" : response.mode === "reviewed" ? "Prepared answer" : response.provider === "lmstudio" ? "Local AI answer" : "Live AI answer";
}
function scopeLabel(context: QuestionInput, files: SourceFile[]) {
  if (context.guideId) return `This walkthrough · ${context.guideId}${context.stepId ? ` · step ${context.stepId}` : ""}`;
  if (context.fileId) return `${context.startLine !== undefined ? "Selected lines" : "Current file"} · ${files.find(file => file.fileId === context.fileId)?.path ?? context.fileId}${context.startLine !== undefined ? ` · lines ${context.startLine}–${context.endLine}` : ""}`;
  return "Repository · whole repository";
}

export function NotebookPanel({ snapshot, snapshots, onEvidence, sourceFiles }: {
  snapshot: Snapshot; snapshots: Snapshot[]; onEvidence: (id: string, snapshotId?: string) => void; sourceFiles?: SourceFile[];
}) {
  const uid = useId();
  const epoch = useRef(0);
  const listRequest = useRef(0);
  const readRequest = useRef(0);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Bookmark | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [conflict, setConflict] = useState<{ latest: Bookmark; accepted: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newSource, setNewSource] = useState("");
  const [guides, setGuides] = useState<Guide[]>([]);
  const [files, setFiles] = useState<SourceFile[]>(sourceFiles ?? []);
  const [references, setReferences] = useState<Evidence[]>([]);
  const [referencesState, setReferencesState] = useState<"loading" | "ready" | "failed">("ready");
  const [againstId, setAgainstId] = useState("");
  const [againstFiles, setAgainstFiles] = useState<SourceFile[] | null>(null);
  const [againstFailed, setAgainstFailed] = useState(false);
  const sameRepository = snapshots.filter(item => item.repositoryUrl === snapshot.repositoryUrl && item.snapshotId !== snapshot.snapshotId);
  const sourceChoices = guides.flatMap(guide => guide.steps.filter(step => step.evidenceIds.length > 0).map(step => ({ id: `${guide.id}/${step.id}`, label: `${guide.title} · ${step.title}`, evidenceIds: step.evidenceIds })));
  const dirty = !!selected && !!draft && (draft.title !== selected.payload.title || draft.note !== selected.payload.note);

  async function load(offset = 0, append = false) {
    const active = epoch.current; const request = ++listRequest.current;
    setLoading(true); setError("");
    try {
      const value = await api<BookmarkList>(`${notebookUrl(snapshot.snapshotId)}&limit=${PAGE_SIZE}&offset=${offset}`);
      if (epoch.current !== active || request !== listRequest.current || value.snapshotId !== snapshot.snapshotId) return;
      setBookmarks(previous => append ? [...previous, ...value.bookmarks.filter(item => !previous.some(old => old.id === item.id))] : value.bookmarks);
      setTotal(value.total); setNextOffset(value.nextOffset);
    } catch (cause) { if (epoch.current === active && request === listRequest.current) setError(cause instanceof Error ? cause.message : "Could not load your notebook."); }
    finally { if (epoch.current === active && request === listRequest.current) setLoading(false); }
  }
  async function open(id: string) {
    const active = epoch.current; const request = ++readRequest.current;
    setReading(true); setError(""); setNotice(""); setConflict(null); setConfirmDelete(false);
    try {
      const record = await api<Bookmark>(`/api/notebook/bookmarks/${encodeURIComponent(id)}?snapshotId=${encodeURIComponent(snapshot.snapshotId)}`);
      if (epoch.current !== active || request !== readRequest.current || record.snapshotId !== snapshot.snapshotId) return;
      setSelected(record); setDraft(readDraft(snapshot.snapshotId, id) ?? { title: record.payload.title, note: record.payload.note, revision: record.payload.revision });
    } catch (cause) { if (epoch.current === active && request === readRequest.current) setError(cause instanceof Error ? cause.message : "Could not open this bookmark."); }
    finally { if (epoch.current === active && request === readRequest.current) setReading(false); }
  }
  useEffect(() => {
    epoch.current++; setSelected(null); setDraft(null); setConflict(null); setBookmarks([]); setAgainstId(""); setAgainstFiles(null); setShowNew(false); setNotice(""); setError(""); setReading(false); setBusy(false);
    const saved = readDraft(snapshot.snapshotId, "new"); setNewTitle(saved?.title ?? ""); setNewNote(saved?.note ?? ""); setNewSource("");
    void load();
    const changed = (event: Event) => { if ((event as CustomEvent).detail?.snapshotId === snapshot.snapshotId) void load(); };
    window.addEventListener("astrolabe:notebook-changed", changed);
    return () => { epoch.current++; window.removeEventListener("astrolabe:notebook-changed", changed); };
    // Each snapshot owns its list, drafts and request generation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.snapshotId]);
  useEffect(() => {
    if (!selected || !draft || selected.snapshotId !== snapshot.snapshotId) return;
    try { localStorage.setItem(draftKey(snapshot.snapshotId, selected.id), JSON.stringify(draft)); } catch { /* Keep the in-memory draft usable. */ }
  }, [draft, selected, snapshot.snapshotId]);
  useEffect(() => {
    if (!showNew) return;
    try { localStorage.setItem(draftKey(snapshot.snapshotId, "new"), JSON.stringify({ title: newTitle, note: newNote, revision: 1 })); } catch { /* Keep the in-memory draft usable. */ }
  }, [newTitle, newNote, showNew, snapshot.snapshotId]);
  useEffect(() => {
    let cancelled = false;
    setFiles(sourceFiles ?? []); setGuides([]);
    Promise.all([
      api<{ guides: Guide[] }>(`/api/guides?snapshotId=${encodeURIComponent(snapshot.snapshotId)}`),
      sourceFiles ? Promise.resolve({ files: sourceFiles }) : api<{ files: SourceFile[] }>(`/api/repository?snapshotId=${encodeURIComponent(snapshot.snapshotId)}`),
    ]).then(([learning, repository]) => { if (!cancelled) { setGuides(learning.guides); setFiles(repository.files); } }).catch(() => {});
    return () => { cancelled = true; };
  }, [snapshot.snapshotId, sourceFiles]);
  useEffect(() => {
    let cancelled = false;
    setReferences([]); setReferencesState(selected ? "loading" : "ready");
    if (!selected) return;
    Promise.all(evidenceIds(selected).map(id => api<Evidence>(`/api/evidence/${encodeURIComponent(id)}?snapshotId=${encodeURIComponent(selected.snapshotId)}`)))
      .then(value => { if (!cancelled) { setReferences(value); setReferencesState("ready"); } })
      .catch(() => { if (!cancelled) setReferencesState("failed"); });
    return () => { cancelled = true; };
  }, [selected]);
  useEffect(() => {
    let cancelled = false;
    setAgainstFiles(null); setAgainstFailed(false);
    if (!againstId) return;
    api<{ files: SourceFile[] }>(`/api/repository?snapshotId=${encodeURIComponent(againstId)}`)
      .then(value => { if (!cancelled) setAgainstFiles(value.files); })
      .catch(() => { if (!cancelled) setAgainstFailed(true); });
    return () => { cancelled = true; };
  }, [againstId]);

  async function create() {
    if (busy || !newTitle.trim()) return;
    const active = epoch.current;
    setBusy(true); setError(""); setNotice("");
    try {
      const value = await api<{ id: string }>("/api/notebook/bookmarks", { method: "POST", body: JSON.stringify({ snapshotId: snapshot.snapshotId, title: newTitle, note: newNote, evidenceIds: sourceChoices.find(item => item.id === newSource)?.evidenceIds.slice(0, 8) ?? [] }) });
      if (epoch.current !== active) return;
      forgetDraft(snapshot.snapshotId, "new"); setNewTitle(""); setNewNote(""); setNewSource(""); setShowNew(false);
      await load(); if (epoch.current !== active) return;
      await open(value.id); if (epoch.current !== active) return;
      setNotice("Bookmark saved with its original snapshot.");
    } catch (cause) { if (epoch.current === active) setError(cause instanceof Error ? cause.message : "Could not save your note. Your draft is still here."); }
    finally { if (epoch.current === active) setBusy(false); }
  }
  async function save() {
    if (!selected || !draft || busy || !dirty || (conflict && !conflict.accepted)) return;
    const active = epoch.current; const id = selected.id;
    setBusy(true); setError(""); setNotice("");
    try {
      const value = await api<Bookmark>(`/api/notebook/bookmarks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ snapshotId: snapshot.snapshotId, revision: draft.revision, title: draft.title, note: draft.note }) });
      if (epoch.current !== active) return;
      setSelected(value); setDraft({ title: value.payload.title, note: value.payload.note, revision: value.payload.revision }); setConflict(null); forgetDraft(snapshot.snapshotId, id);
      setNotice("Bookmark updated. Original answer context and citations remain pinned."); await load();
    } catch (cause) {
      if (epoch.current !== active) return;
      if (cause instanceof ApiError && cause.code === "BOOKMARK_CONFLICT") {
        try {
          const latest = await api<Bookmark>(`/api/notebook/bookmarks/${encodeURIComponent(id)}?snapshotId=${encodeURIComponent(snapshot.snapshotId)}`);
          if (epoch.current === active) setConflict({ latest, accepted: false });
        } catch (readError) { if (epoch.current === active) setError(readError instanceof Error ? readError.message : "Could not reload the competing edit. Your draft is preserved."); }
      } else setError(cause instanceof Error ? cause.message : "Could not save the edit. Your draft is preserved.");
    } finally { if (epoch.current === active) setBusy(false); }
  }
  async function remove() {
    if (!selected || busy) return;
    const active = epoch.current; const id = selected.id;
    setBusy(true); setError("");
    try {
      await api(`/api/notebook/bookmarks/${encodeURIComponent(id)}?snapshotId=${encodeURIComponent(snapshot.snapshotId)}`, { method: "DELETE" });
      if (epoch.current !== active) return;
      forgetDraft(snapshot.snapshotId, id); setSelected(null); setDraft(null); setConfirmDelete(false); setConflict(null); setNotice("Bookmark deleted. Saved answer history is preserved."); await load();
    } catch (cause) { if (epoch.current === active) setError(cause instanceof Error ? cause.message : "Could not delete this bookmark."); }
    finally { if (epoch.current === active) setBusy(false); }
  }
  async function download() {
    const active = epoch.current; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/notebook?snapshotId=${encodeURIComponent(snapshot.snapshotId)}${againstId ? `&againstSnapshotId=${encodeURIComponent(againstId)}` : ""}`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error?.message ?? "Notebook export failed."); }
      const text = await response.text();
      if (epoch.current !== active) return;
      const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = `astrolabe-${snapshot.snapshotId}-notebook.md`; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Markdown exported with original commit links and source freshness notes.");
    } catch (cause) { if (epoch.current === active) setError(cause instanceof Error ? cause.message : "Notebook export failed."); }
    finally { if (epoch.current === active) setBusy(false); }
  }

  const freshness = !againstId ? "Original snapshot · references stay pinned to their saved commit."
    : referencesState === "failed" || againstFailed ? "Unassessed · source freshness could not be checked."
      : referencesState === "loading" || !againstFiles ? "Checking cited source files…"
        : references.length === 0 ? "Unassessed · no cited source."
          : references.some(reference => { const original = files.find(file => file.fileId === reference.fileId); return !original || againstFiles.find(file => file.path === original.path)?.contentHash !== reference.contentHash; })
            ? "Needs review · a cited file changed or is missing in the comparison snapshot."
            : "Cited files unchanged · this does not verify the explanation or establish correctness.";
  const savedAnswer = selected?.payload.savedAnswer;
  return <section className="notebook-panel" aria-labelledby={`${uid}-title`}>
    <header className="notebook-heading"><div><span className="section-kicker"><BookMarked size={15} aria-hidden="true" /> YOUR LEARNING NOTEBOOK</span><h1 id={`${uid}-title`}>Keep what you want to revisit.</h1><p>Save answers, source references and your own notes. Practice reset preserves this notebook and your signed-session answer history.</p></div><div className="notebook-actions"><button type="button" onClick={() => setShowNew(value => !value)} disabled={busy}><Plus size={16} aria-hidden="true" />New bookmark</button><button type="button" onClick={() => void download()} disabled={busy}><Download size={16} aria-hidden="true" />Export Markdown</button></div></header>
    <div className="notebook-provenance">{snapshot.name} · original commit <a href={`${snapshot.repositoryUrl}/tree/${snapshot.commitSha}`} target="_blank" rel="noreferrer">{snapshot.commitSha.slice(0, 12)}</a><label htmlFor={`${uid}-against`}>Check source freshness against</label><select id={`${uid}-against`} value={againstId} onChange={event => setAgainstId(event.target.value)}><option value="">Original snapshot</option>{sameRepository.map(item => <option value={item.snapshotId} key={item.snapshotId}>{item.name} · {item.commitSha.slice(0, 12)}</option>)}</select><small>Only snapshots of the same repository can be compared. Changed bytes, including formatting, require review; historical citations are never remapped.</small></div>
    {showNew && <form className="notebook-new notebook-form" onSubmit={event => { event.preventDefault(); void create(); }}><h2>New bookmark</h2><label>New bookmark title<input value={newTitle} required maxLength={160} onChange={event => setNewTitle(event.target.value)} /></label><div className="notebook-field"><label htmlFor={`${uid}-new-note`}>New bookmark note</label><textarea id={`${uid}-new-note`} value={newNote} maxLength={3000} rows={4} onChange={event => setNewNote(event.target.value)} /></div><label>Pin walkthrough source<select value={newSource} onChange={event => setNewSource(event.target.value)}><option value="">Personal note · no source reference</option>{sourceChoices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><small>You can also bookmark a full answer beside the mentor. Its question, answer blocks, provider and citations are copied together.</small><div className="notebook-actions"><button type="submit" disabled={busy || !newTitle.trim()}>Save bookmark</button><button type="button" onClick={() => setShowNew(false)} disabled={busy}>Close new bookmark</button></div></form>}
    {error && <div className="notebook-error" role="alert"><p>{error}</p><button type="button" disabled={loading || busy} onClick={() => void load()}><RefreshCw size={14} aria-hidden="true" />Reload bookmarks</button></div>}
    {notice && <p className="notebook-notice" role="status">{notice}</p>}
    <div className="notebook-layout"><aside className="notebook-list" aria-label="Saved bookmarks"><div className="notebook-list-heading"><h2>Saved bookmarks</h2><span>{bookmarks.length} of {total}</span><button type="button" disabled={loading || busy} aria-label="Refresh bookmarks" onClick={() => void load()}><RefreshCw size={15} aria-hidden="true" /></button></div>{loading && <p role="status">Loading bookmarks…</p>}{!loading && !bookmarks.length && <p>No bookmarks yet. Save an answer in Explore or create a note here.</p>}<ol>{bookmarks.map(item => <li key={item.id}><button type="button" disabled={busy} aria-current={selected?.id === item.id ? "true" : undefined} onClick={() => void open(item.id)}><strong>{item.payload.title}</strong><small>{new Date(item.createdAt).toLocaleDateString()} · revision {item.payload.revision}</small>{item.payload.savedAnswer && <small>{answerLabel(item.payload.savedAnswer.response)}</small>}</button></li>)}</ol>{nextOffset !== null && <button type="button" disabled={loading || busy} onClick={() => void load(nextOffset, true)}>Load more bookmarks</button>}</aside>
      <div className="notebook-detail" aria-busy={reading}>{reading ? <p role="status">Opening saved bookmark…</p> : selected && draft ? <article aria-label="Saved bookmark details"><h2>{selected.payload.title}</h2><p className="notebook-meta">Saved {new Date(selected.createdAt).toLocaleString()} · revision {selected.payload.revision} · snapshot {selected.snapshotId}</p><p className="notebook-freshness" role="status">{freshness}</p><form className="notebook-form" onSubmit={event => { event.preventDefault(); void save(); }}><label>Saved bookmark title<input maxLength={160} required value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label><div className="notebook-field"><label htmlFor={`${uid}-saved-note`}>Saved bookmark note</label><textarea id={`${uid}-saved-note`} rows={5} maxLength={3000} value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} /></div>{dirty && <small>Your unsaved draft is kept in this browser for this snapshot and bookmark.</small>}{conflict && <div className="notebook-conflict" role="alert"><strong>Another edit was saved. Your draft is preserved.</strong><p>Latest title: {conflict.latest.payload.title}</p><p className="notebook-other-note">Latest note: {conflict.latest.payload.note || "(empty)"}</p><p>Review the other edit before saving your version.</p>{!conflict.accepted ? <button type="button" onClick={() => { setSelected(conflict.latest); setDraft({ ...draft, revision: conflict.latest.payload.revision }); setConflict({ ...conflict, accepted: true }); }}>Reload latest revision, keep my draft</button> : <p>Latest revision loaded. Your draft is unchanged; saving now explicitly replaces the title and note shown above.</p>}</div>}<div className="notebook-actions"><button type="submit" disabled={busy || !dirty || !draft.title.trim() || !!conflict && !conflict.accepted}>{conflict?.accepted ? "Save my reviewed draft" : "Save bookmark changes"}</button><button type="button" disabled={busy} onClick={() => { forgetDraft(snapshot.snapshotId, selected.id); setDraft({ title: selected.payload.title, note: selected.payload.note, revision: selected.payload.revision }); setConflict(null); }}>Discard my draft</button></div></form>
        {savedAnswer && <section className="notebook-saved-answer" aria-label="Bookmarked answer"><span className="notebook-answer-label">{answerLabel(savedAnswer.response)}</span><h3>{savedAnswer.question}</h3><p>{scopeLabel(savedAnswer.context, files)} · {savedAnswer.context.depth === "developer" ? "Developer" : "Beginner"} answer</p><p>Provider: {savedAnswer.response.provider ?? savedAnswer.provider ?? "not recorded"} · Model: {savedAnswer.response.model ?? savedAnswer.model ?? "not recorded"}</p><p>{savedAnswer.response.status !== "answered" ? "No source-grounded answer was returned. Review the response notes before trying again." : savedAnswer.response.reviewState === "human_reviewed" ? "Human review recorded." : savedAnswer.response.mode === "reviewed" ? "Authored prepared content · independent human review pending." : "AI-generated · check each claim against source. Citation checks do not establish correctness."}</p>{savedAnswer.response.blocks?.length ? savedAnswer.response.blocks.map((block, index) => <section className={`notebook-answer-block ${block.kind}`} key={index}><small>{block.kind === "observed" ? "From source" : block.kind === "inferred" ? "Interpretation" : "Not established"}</small><p>{block.text}</p>{block.evidenceIds.map(id => <button type="button" key={id} onClick={() => onEvidence(id, selected.snapshotId)}>Inspect original source <ArrowUpRight size={14} aria-hidden="true" /></button>)}</section>) : <p className="notebook-answer-text">{savedAnswer.response.answer}</p>}{savedAnswer.response.limitations.length > 0 && <details><summary>Answer notes and limits</summary><ul>{savedAnswer.response.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}</section>}
        {selected.payload.brief && <section><h3>Curated documentation proposal: {selected.payload.brief.title}</h3><p>{selected.payload.brief.suggestedChange}</p><ul>{selected.payload.brief.verificationSteps.map(item => <li key={item}>{item}</li>)}</ul></section>}
        <section className="notebook-references" aria-label="Pinned source references"><h3>Pinned source references</h3>{referencesState === "loading" ? <p>Loading original evidence…</p> : referencesState === "failed" ? <p>Original evidence could not be loaded. These references have not been substituted with current source.</p> : references.length ? references.map(reference => <button type="button" key={reference.evidenceId} onClick={() => onEvidence(reference.evidenceId, reference.snapshotId)}>{files.find(file => file.fileId === reference.fileId)?.path ?? "Original source"} · lines {reference.startLine}–{reference.endLine}<ArrowUpRight size={14} aria-hidden="true" /></button>) : <p>No cited source. This is an unassessed personal note.</p>}</section>
        <div className="notebook-delete">{confirmDelete ? <><p>Delete this bookmark? Its answer remains in saved history.</p><button type="button" disabled={busy} onClick={() => void remove()}>Confirm delete bookmark</button><button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep bookmark</button></> : <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={14} aria-hidden="true" />Delete bookmark</button>}</div>
      </article> : <p className="notebook-empty">Open a saved bookmark to read, edit, inspect its original source or check freshness.</p>}</div>
    </div>
  </section>;
}
