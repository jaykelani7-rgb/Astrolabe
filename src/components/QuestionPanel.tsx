"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  MessageSquare,
  BookOpen,
  AlertCircle,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import type { Depth, Guide, GuideStep, Snapshot, SourceDocument, QaResponse } from "@/contracts";
import { api } from "@/lib/client/api";
export function QuestionPanel({
  snapshot,
  document,
  range,
  depth,
  guide,
  step,
  onEvidence,
}: {
  snapshot: Snapshot;
  document: SourceDocument | null;
  range: { startLine: number; endLine: number } | null;
  depth: Depth;
  guide?: Guide;
  step?: GuideStep;
  onEvidence: (id: string) => void;
}) {
  const [scope, setScope] = useState<"source" | "walkthrough">("source");
  const walkthroughScope = scope === "walkthrough" && Boolean(guide);
  const requestRef = useRef(0);
  useEffect(() => {
    requestRef.current++;
    setResponse(null);
    setError("");
    setBusy(false);
  }, [
    snapshot.snapshotId,
    document?.file.fileId,
    range?.startLine,
    range?.endLine,
    depth,
    walkthroughScope,
    guide?.id,
    step?.id,
  ]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState<QaResponse | null>(null);
  async function ask(value = question) {
    if (!value.trim() || busy) return;
    const requestId = ++requestRef.current;
    setQuestion(value);
    setBusy(true);
    setError("");
    setResponse(null);
    try {
      const nextResponse = await api<QaResponse>("/api/questions", {
        method: "POST",
        body: JSON.stringify({
          question: value,
          snapshotId: snapshot.snapshotId,
          ...(walkthroughScope && guide
            ? { guideId: guide.id, ...(step ? { stepId: step.id } : {}) }
            : { fileId: document?.file.fileId, ...(range ? { startLine: range.startLine, endLine: range.endLine } : {}) }),
          depth,
        }),
      });
      if (requestId === requestRef.current) setResponse(nextResponse);
    } catch (e) {
      if (requestId === requestRef.current) setError((e as Error).message);
    } finally {
      if (requestId === requestRef.current) setBusy(false);
    }
  }
  return (
    <section className="qa-panel">
      <div className="panel-eyebrow">
        <MessageSquare size={14} /> ASK YOUR MENTOR
      </div>
      <h3>A little context goes a long way.</h3>
      <p>
        {walkthroughScope ? "Ask how this walkthrough’s steps fit together. Every supported answer links back to the code." : "Ask about the source you’re exploring. Every supported answer links back to the code."}
      </p>
      {guide && (
        <div className="qa-scope" role="group" aria-label="Question scope">
          <button type="button" aria-pressed={!walkthroughScope} onClick={() => setScope("source")}>Selected source</button>
          <button type="button" aria-pressed={walkthroughScope} onClick={() => setScope("walkthrough")}>This walkthrough</button>
        </div>
      )}
      <div className="context-pill">
        <span className="live-dot" />
        {walkthroughScope ? guide?.title : document?.file.path.split("/").pop() || "Repository"}
        {walkthroughScope && step && <span> · {step.title}</span>}
        {!walkthroughScope && range && (
          <span>
            {" "}
            · L{range.startLine}–{range.endLine}
          </span>
        )}
      </div>
      {walkthroughScope && <p className="qa-scope-help">Uses source targets across this walkthrough, starting with the current step.</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
        className="question-form"
      >
        <textarea
          aria-label="Ask a question about this code"
          placeholder={walkthroughScope ? "How do the steps in this walkthrough connect?" : "What happens when the state changes?"}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={1000}
        />
        <div>
          <span>{question.length}/1000</span>
          <button
            disabled={busy || question.trim().length < 3}
            aria-label="Send question"
            type="submit"
          >
            {busy ? <span className="spinner" /> : <ArrowUp size={17} />}
          </button>
        </div>
      </form>
      {!response && !busy && (
        <div className="question-suggestions">
          <span>TRY A QUESTION</span>
          {(walkthroughScope
            ? guide?.id === "store-to-react" ? ["What is getInitialState?"] : ["How does setState update state?", "How do I unsubscribe?"]
            : document?.file.path === "src/react.ts"
            ? ["How does useStore use a selector?", "What is getInitialState?"]
            : ["How does setState update state?", "How do I unsubscribe?"]
          ).map((q) => (
            <button key={q} onClick={() => void ask(q)}>
              {q}
              <ChevronRight size={13} />
            </button>
          ))}
        </div>
      )}
      {busy && (
        <div role="status" className="qa-loading">
          <Sparkles size={15} /> Finding source evidence…
        </div>
      )}
      {error && (
        <div role="alert" className="error-box">
          {error}
        </div>
      )}
      {response && (
        <div className={"qa-response " + response.status} role="status">
          <div className="response-label">
            {response.status === "answered" ? (
              <BookOpen size={13} />
            ) : (
              <AlertCircle size={13} />
            )}{" "}
            {response.status === "answered"
              ? response.mode === "reviewed"
                ? "Reviewed answer"
                : "Live AI answer"
              : response.status === "evidence_gap"
                ? "Evidence gap"
                : "Live AI unavailable"}
          </div>
          <p>{response.answer}</p>
          {response.citations.map((c) => (
            <button
              key={c.evidenceId}
              className="evidence-link"
              onClick={() => onEvidence(c.evidenceId)}
            >
              <BookOpen size={13} /> View source · L{c.startLine}–{c.endLine}
              <ChevronRight size={12} />
            </button>
          ))}
          {response.limitations.map((s, i) => (
            <small key={i}>{s}</small>
          ))}
        </div>
      )}
      <div className="qa-footer">
        <span className="status-dot" /> Reviewed answers available · Live AI
        needs a key
      </div>
    </section>
  );
}
