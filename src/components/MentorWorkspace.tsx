"use client";
import { useState } from "react";
import { ArrowRight, BookOpen, CheckCircle2, RefreshCw, X } from "lucide-react";
import { useWorkspace } from "@/lib/client/workspace";
import { Navigation, RepositoryHeader } from "./workspace/Navigation";
import { Overview } from "./workspace/Overview";
import { SourceWorkspace } from "./workspace/SourceWorkspace";
import { ResultsPanel } from "@/features/missions";
export function MentorWorkspace() {
  const w = useWorkspace();
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
        <RepositoryHeader workspace={w} onMenu={() => setMobileOpen(true)} />
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
                  <SourceWorkspace workspace={w} />
                </div>
              )}
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
                    onContinue={w.continueLearning}
                    onTask={w.openCheckpoint}
                    onEvidence={(id) => {
                      w.navigate("explore");
                      void w.openEvidence(id);
                    }}
                    onReset={() => {
                      void w.refreshProgress();
                    }}
                  />
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
