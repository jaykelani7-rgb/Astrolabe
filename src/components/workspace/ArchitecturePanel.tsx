"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Map } from "lucide-react";
import type { ArchitectureOverview, Snapshot } from "@/contracts";
import { api } from "@/lib/client/api";
import "./architecture.css";

export function ArchitecturePanel({ snapshot, onEvidence }: {
  snapshot: Snapshot; onEvidence: (id: string) => void;
}) {
  const [overview, setOverview] = useState<ArchitectureOverview | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setOverview(null); setError("");
    api<ArchitectureOverview>("/api/architecture?snapshotId=" + encodeURIComponent(snapshot.snapshotId))
      .then((value) => {
        if (!active) return;
        if (value.snapshotId !== snapshot.snapshotId || value.commitSha !== snapshot.commitSha) {
          setError("This overview belongs to a different source version."); return;
        }
        setOverview(value);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "The overview could not be opened."); });
    return () => { active = false; };
  }, [snapshot.snapshotId, snapshot.commitSha, retry]);
  const current = overview?.snapshotId === snapshot.snapshotId && overview.commitSha === snapshot.commitSha ? overview : null;
  return <section className="architecture-overview" aria-labelledby="architecture-title">
    <div className="section-heading"><div><span className="section-label">READ THE MAIN PARTS</span><h2 id="architecture-title">How this repository fits together</h2></div><Map size={20} aria-hidden="true" /></div>
    {error ? <div role="alert"><p>{error}</p><button type="button" className="text-button" onClick={() => setRetry((value) => value + 1)}>Try the overview again</button></div>
      : !current ? <p role="status">Opening the source-linked overview…</p>
      : <>
        <p className="architecture-intro">Follow this reading order. Each summary links to the pinned source so you can inspect it.</p>
        <ol className="architecture-modules">{current.readingOrder.map((id) => current.modules.find((module) => module.id === id)).filter((module) => !!module).map((module, index) => <li key={module.id}>
          <span className="architecture-number">{String(index + 1).padStart(2, "0")}</span>
          <div><h3>{module.name}</h3><code>{module.path}</code><p>{module.description}</p>
            {module.evidenceIds.length > 0 ? <button type="button" className="text-button" onClick={() => onEvidence(module.evidenceIds[0])}>Read {module.name} source<ArrowUpRight size={15} aria-hidden="true" /></button> : <small>No source reference is available.</small>}
          </div>
        </li>)}</ol>
        <p className="architecture-boundary">Authored overview · independent human review pending. The module map shows static imports, not runtime execution.</p>
      </>}
  </section>;
}
