"use client";
import {
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  FileCode2,
  GitBranch,
  Map,
  ShieldCheck,
} from "lucide-react";
import type { Workspace } from "@/lib/client/workspace";
export function Overview({ workspace: w }: { workspace: Workspace }) {
  const snapshot = w.snapshot!;
  const returning =
    w.visited.length > 0 || (w.progress?.totalAttempts || 0) > 0;
  const recommended =
    w.files.find((f) => f.path === "src/vanilla.ts") || w.files[0];
  const stepCount = w.guides.reduce((count, g) => count + g.steps.length, 0);
  return (
    <section className="overview-page" aria-label="Repository overview">
      <div className="page-introduction">
        <span className="eyebrow">YOUR REPOSITORY NOTEBOOK</span>
        <h1>Find your bearings in {snapshot.name}.</h1>
        <p>{snapshot.description}</p>
        <div className="metadata-line">
          <span>{snapshot.language}</span>
          <span>{snapshot.license} license</span>
          <span>{w.files.length} source files</span>
        </div>
      </div>
      <section className="starting-point">
        <div>
          <span className="section-label">
            {returning ? "PICK UP YOUR THREAD" : "A GOOD PLACE TO BEGIN"}
          </span>
          <h2>{returning ? w.activeGuide.title : w.guides[0].title}</h2>
          <p>
            {returning
              ? `Step ${w.stepIndex + 1} of ${w.activeGuide.steps.length}: ${w.activeStep.title}`
              : w.guides[0].description}
          </p>
          <div className="starting-actions">
            <button
              className="primary-button"
              onClick={() =>
                returning ? w.continueLearning() : w.selectGuide(w.guides[0].id)
              }
            >
              {returning ? "Continue learning" : "Start learning"}
              <ArrowRight size={17} />
            </button>
            <button
              className="text-button"
              onClick={() => {
                w.navigate("explore");
                void w.openFile(recommended.fileId);
              }}
            >
              <Compass size={16} />
              Explore source
            </button>
            <button
              className="text-button"
              onClick={() => {
                w.setTab("map");
                w.navigate("explore");
              }}
            >
              <Map size={16} />
              View module map
            </button>
          </div>
        </div>
        <div className="starting-annotation">
          <FileCode2 size={23} />
          <span>Recommended starting file</span>
          <button
            onClick={() => {
              w.navigate("explore");
              void w.openFile(recommended.fileId);
            }}
          >
            <code>{recommended.path}</code>
            <ArrowRight size={15} />
          </button>
          <p>
            Open the source alongside a reviewed walkthrough. You can inspect
            every reference.
          </p>
        </div>
      </section>
      <div className="notebook-grid">
        <section className="learning-route">
          <div className="section-heading">
            <div>
              <span className="section-label">FOLLOW A FLOW</span>
              <h2>{w.guides.length} reviewed paths through the source</h2>
            </div>
            <BookOpen size={20} />
          </div>
          <div className="route-list">
            {w.guides.map((guide, index) => {
              const visited = guide.steps.filter((s) =>
                w.visited.includes(guide.id + ":" + s.id),
              ).length;
              const checkpoints = w.tasks.filter((t) => t.guideId === guide.id);
              return (
                <button
                  key={guide.id}
                  className="route-item"
                  onClick={() => w.selectGuide(guide.id)}
                >
                  <span className="route-number">0{index + 1}</span>
                  <div>
                    <h3>{guide.title}</h3>
                    <p>{guide.description}</p>
                    <span className="route-meta">
                      {guide.steps.length} steps · {checkpoints.length}{" "}
                      checkpoints · {guide.duration}
                      {visited > 0 && ` · ${visited} visited`}
                    </span>
                  </div>
                  <ArrowRight size={17} />
                </button>
              );
            })}
          </div>
          <p className="inline-note">
            <ShieldCheck size={15} />
            Prepared explanations are source-checked. Independent human review
            is pending.
          </p>
        </section>
        <aside className="field-notes">
          <span className="section-label">YOUR PLACE IN THE NOTEBOOK</span>
          <h2>Understanding, one step at a time.</h2>
          <div className="overview-progress">
            <div>
              <strong>
                {w.visited.length}
                <small> / {stepCount}</small>
              </strong>
              <span>Steps visited on this device</span>
            </div>
            <div>
              <strong>
                {w.progress ? w.progress.completed : "—"}
                <small> / {w.tasks.length}</small>
              </strong>
              <span>Checkpoints solved this session</span>
            </div>
          </div>
          {w.progress && w.progress.totalAttempts > 0 ? (
            <p>
              {w.progress.totalAttempts} attempts and {w.progress.hintsUsed}{" "}
              hint requests recorded. Review the source behind your predictions.
            </p>
          ) : (
            <p>
              {w.progress
                ? "No checkpoint attempts yet. Start with a walkthrough, then make your first prediction."
                : "Your checkpoint summary will appear here when it is available."}
            </p>
          )}
          <button
            className="text-button"
            onClick={() => w.navigate("progress")}
          >
            Open my progress
            <ArrowRight size={15} />
          </button>
          <div className="snapshot-scope">
            <GitBranch size={17} />
            <div>
              <strong>About this snapshot</strong>
              <p>
                {w.map?.edges.length || 0} static import relationships.{" "}
                {w.map?.unresolved.length || 0} external or unresolved
                references.
              </p>
              <p>Imports show source dependencies, not runtime execution.</p>
            </div>
          </div>
        </aside>
      </div>
      <footer className="notebook-footer">
        <span>
          Source pinned to <code>{snapshot.commitSha.slice(0, 12)}</code>
        </span>
        <span>Practice and source verification, at your pace.</span>
      </footer>
    </section>
  );
}
