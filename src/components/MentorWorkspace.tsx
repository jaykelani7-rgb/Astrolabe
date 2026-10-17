"use client";
import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/contracts";
import { api } from "@/lib/client/api";
import { LearningGoals } from "./workspace/LearningGoals";
import { NotebookPanel } from "./workspace/NotebookPanel";
import { ArrowRight, BookOpen, CheckCircle2, RefreshCw, X } from "lucide-react";
import { useWorkspace } from "@/lib/client/workspace";
import { Navigation, RepositoryHeader } from "./workspace/Navigation";
import { Overview } from "./workspace/Overview";
import { SourceWorkspace } from "./workspace/SourceWorkspace";
import { ResultsPanel } from "@/features/missions";
interface Intent { snapshotId: string; evidenceId?: string; taskId?: string }
export function MentorWorkspace() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [intent, setIntent] = useState<Intent | null>(null);
  useEffect(() => {
    let active = true; setError("");
    api<{snapshots: Snapshot[]}>("/api/snapshots").then(({snapshots: available}) => {
      if(!active) return;
      setSnapshots(available);
      const requested = new URL(window.location.href).searchParams.get("snapshot");
      if(requested && !available.some(item=>item.snapshotId===requested)) {setError("That source snapshot is unavailable. Choose a prepared snapshot to continue.");return;}
      setSelected(requested || available[0]?.snapshotId || null);
    }).catch(reason=>{if(active)setError(reason.message);});
    return()=>{active=false;};
  }, [retry]);
  useEffect(()=>{
    const pop=()=>{const requested=new URL(window.location.href).searchParams.get("snapshot")||snapshots[0]?.snapshotId;if(snapshots.some(item=>item.snapshotId===requested)){setSelected(requested!);setIntent(null);setError("");}};
    window.addEventListener("popstate",pop);return()=>window.removeEventListener("popstate",pop);
  },[snapshots]);
  function switchSnapshot(id: string, nextIntent?: Intent) {
    if(!snapshots.some(item=>item.snapshotId===id)) return;
    const url=new URL(window.location.href);url.searchParams.set("snapshot",id);url.searchParams.set("view",nextIntent?.taskId?"learn":nextIntent?.evidenceId?"explore":"overview");
    window.history.pushState({},"",url);setSelected(id);setIntent(nextIntent||null);setError("");
  }
  if(!selected) return <main className="integration-loading">{error?<><p role="alert">{error}</p>{snapshots.length>0&&<button className="secondary-button" onClick={()=>switchSnapshot(snapshots[0].snapshotId)}>Open prepared workspace</button>}<button className="secondary-button" onClick={()=>setRetry(value=>value+1)}>Try loading again</button></>:<p role="status">Opening the prepared repository…</p>}</main>;
  return <WorkspaceShell key={selected} snapshotId={selected} snapshots={snapshots} onSwitch={switchSnapshot} intent={intent} clearIntent={()=>setIntent(null)} />;
}
function WorkspaceShell({snapshotId,snapshots,onSwitch,intent,clearIntent}: {snapshotId:string;snapshots:Snapshot[];onSwitch:(id:string,intent?:Intent)=>void;intent:Intent|null;clearIntent:()=>void}) {
  const w = useWorkspace(snapshotId);
  const intentHandled=useRef<Intent|null>(null);
  const [refreshKey,setRefreshKey]=useState(0);
  const savingProposal=useRef(false);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    if(w.loading||!intent||intent.snapshotId!==snapshotId||intentHandled.current===intent)return;
    intentHandled.current=intent;
    if(intent.taskId)w.openCheckpoint(intent.taskId);
    else if(intent.evidenceId){w.navigate("explore");void w.openEvidence(intent.evidenceId);}
    clearIntent();
  },[w.loading,intent,snapshotId,clearIntent]);
  function inspectEvidence(id:string,sourceSnapshot=snapshotId){if(sourceSnapshot!==snapshotId)onSwitch(sourceSnapshot,{snapshotId:sourceSnapshot,evidenceId:id});else{w.navigate("explore");void w.openEvidence(id);}}
  function practice(taskId:string,sourceSnapshot=snapshotId){if(sourceSnapshot!==snapshotId)onSwitch(sourceSnapshot,{snapshotId:sourceSnapshot,taskId});else w.openCheckpoint(taskId);}
  async function bookmarkProposal(briefId:string,title:string){
    if(savingProposal.current)return;
    savingProposal.current=true;
    try{await api("/api/notebook/bookmarks",{method:"POST",body:JSON.stringify({snapshotId,title,briefId})});if(mounted.current)w.navigate("notebook");}
    catch(reason){if(mounted.current)w.setError((reason as Error).message);}
    finally{savingProposal.current=false;}
  }
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div
      className={`astrolabe-app ${w.preferences.railCollapsed ? "rail-collapsed" : ""}`}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Navigation
        workspace={w}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div className="application-surface">
        <RepositoryHeader workspace={w} snapshots={snapshots} onSwitch={onSwitch} onMenu={() => setMobileOpen(true)} />
        <main id="main-content" tabIndex={-1} className="application-main">
          {w.error && (
            <div className="global-error" role="alert">
              <span>{w.error}</span>
              <button
                className="icon-button"
                onClick={() => w.setError("")}
                aria-label="Dismiss error"
              >
                <X size={17} />
              </button>
            </div>
          )}
          {w.loading ? (
            <div className="loading-screen" role="status">
              <span className="spinner" />
              <p>Opening the prepared repository…</p>
            </div>
          ) : !w.snapshot ? (
            <section className="error-screen">
              <h1>The repository couldn’t be opened.</h1>
              <p>{w.error || "Try loading the workspace again."}</p>
              <button
                className="primary-button"
                onClick={() => window.location.reload()}
              >
                <RefreshCw size={16} />
                Try again
              </button>
            </section>
          ) : (
            <>
              <div hidden={w.view !== "overview"}>
                <Overview workspace={w} />
              </div>
              {w.hasOpenedWorkspace && (
                <div hidden={w.view !== "explore" && w.view !== "learn"}>
                  <SourceWorkspace workspace={w} onHistoricalEvidence={inspectEvidence} />
                </div>
              )}
              {w.view === "notebook" && <NotebookPanel snapshot={w.snapshot} snapshots={snapshots} sourceFiles={w.files} onEvidence={inspectEvidence} />}
              {w.view === "progress" && (
                <section className="progress-page">
                  <div className="page-introduction">
                    <span className="eyebrow">MY PROGRESS</span>
                    <h1>A clearer picture of the source.</h1>
                    <p>
                      Review your predictions, the support you used, and a small
                      next step.
                    </p>
                  </div>
                  <div className="visit-summary">
                    <BookOpen size={19} />
                    <span>
                      <strong>
                        {w.visited.length} of{" "}
                        {w.guides.reduce(
                          (count, g) => count + g.steps.length,
                          0,
                        )}{" "}
                        steps visited
                      </strong>
                      <small>
                        Recorded on this device · separate from checkpoint
                        results
                      </small>
                    </span>
                    <button
                      className="text-button"
                      onClick={w.continueLearning}
                    >
                      Return to my walkthrough
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  <ResultsPanel
                    snapshotId={snapshotId}
                    onContinue={w.continueLearning}
                    onTask={w.openCheckpoint}
                    onEvidence={(id) => {
                      w.navigate("explore");
                      void w.openEvidence(id);
                    }}
                    onReset={() => {
                      void w.refreshProgress(); setRefreshKey(value=>value+1);
                    }}
                  />
                  <LearningGoals snapshotId={snapshotId} onPractice={practice} onEvidence={inspectEvidence} refreshKey={refreshKey} onBookmarkBrief={bookmarkProposal} />
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
