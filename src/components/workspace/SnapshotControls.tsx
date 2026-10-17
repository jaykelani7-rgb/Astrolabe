"use client";
import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/contracts";
import { api } from "@/lib/client/api";
import "./integration.css";
interface Comparison {
  fromSnapshotId: string; toSnapshotId: string;
  changes: { path: string; kind: string; beforeHash: string | null; afterHash: string | null }[];
  content: { contentId: string; kind: string; state: string; affectedPaths: string[]; reviewState: string }[];
  limitations: string[];
}
export function SnapshotControls({ snapshot, snapshots, onSwitch }: {
  snapshot: Snapshot | null; snapshots: Snapshot[]; onSwitch: (id: string) => void;
}) {
  const [target, setTarget] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const peers = snapshots.filter(item => item.repositoryUrl === snapshot?.repositoryUrl && item.snapshotId !== snapshot.snapshotId);
  useEffect(() => { request.current++; setTarget(""); setComparison(null); setError(""); setBusy(false); return () => { request.current++; }; }, [snapshot?.snapshotId]);
  async function compare() {
    if (!snapshot || !peers.some(item => item.snapshotId === target)) return;
    const number = ++request.current;
    setBusy(true); setError(""); setComparison(null);
    try {
      const result = await api<Comparison>("/api/snapshots/compare", {method:"POST", body:JSON.stringify({fromSnapshotId:snapshot.snapshotId,toSnapshotId:target})});
      if (number !== request.current) return;
      if (result.fromSnapshotId !== snapshot.snapshotId || result.toSnapshotId !== target) throw new Error("This comparison belongs to another snapshot pair.");
      setComparison(result);
    } catch (reason) { if(number === request.current) setError((reason as Error).message); }
    finally { if(number === request.current) setBusy(false); }
  }
  return <div className="snapshot-controls">
    <label className="snapshot-select"><span className="sr-only">Repository snapshot</span><select aria-label="Repository snapshot" value={snapshot?.snapshotId || ""} onChange={event => onSwitch(event.target.value)}>
      {!snapshot && <option value="">Choose snapshot</option>}
      {snapshots.map(item => <option key={item.snapshotId} value={item.snapshotId}>{item.name} · {item.commitSha.slice(0,7)}</option>)}
    </select></label>
    <details className="snapshot-comparison"><summary>Compare versions</summary><div className="snapshot-comparison-panel">
      <h2>Compare source snapshots</h2><p>Historical citations stay pinned to their original snapshot and commit.</p>
      {!peers.length ? <p>No other prepared snapshot of this repository is available.</p> : <>
        <label>Compare current source with<select aria-label="Comparison snapshot" value={target} onChange={event => {request.current++; setTarget(event.target.value);setComparison(null);setError("");setBusy(false);}}><option value="">Choose another version</option>{peers.map(item=><option key={item.snapshotId} value={item.snapshotId}>{item.name} · {item.commitSha.slice(0,7)}</option>)}</select></label>
        <button type="button" className="secondary-button" disabled={busy||!target} onClick={compare}>{busy?"Comparing…":"Compare snapshots"}</button>
      </>}
      {error&&<p role="alert">{error}</p>}
      {comparison&&<section aria-label="Snapshot comparison results"><h3>{comparison.changes.length} changed files</h3><ul>{comparison.changes.map(change=><li key={change.path}><code>{change.path}</code> · {change.kind}</li>)}</ul>
        <h3>Prepared content freshness</h3><ul>{comparison.content.map(item=><li key={item.kind+item.contentId}><strong>{item.contentId}</strong> · {item.state==="needs_review"?"Needs review":"Cited source unchanged"}{item.affectedPaths.length>0&&<small> · {item.affectedPaths.join(", ")}</small>}</li>)}</ul>
        {comparison.limitations.map(limit=><p className="inline-note" key={limit}>{limit}</p>)}
      </section>}
    </div></details>
  </div>;
}
