"use client";
import { useEffect, useState, useRef } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Box,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Compass,
  ExternalLink,
  FileCode2,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  GraduationCap,
  LayoutDashboard,
  Lightbulb,
  Map,
  Menu,
  PanelLeftClose,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  X,
} from "lucide-react";
import type {
  Depth,
  Evidence,
  Guide,
  ModuleMap,
  PublicTask,
  Results,
  Snapshot,
  SourceDocument,
  SourceFile,
} from "@/contracts";
import { api } from "@/lib/client/api";
import { SourceViewer } from "./SourceViewer";
import { ModuleGraph } from "./ModuleGraph";
import { QuestionPanel } from "./QuestionPanel";
import { MissionPanel, ResultsPanel } from "@/features/missions";

type View = "overview" | "explore" | "guides" | "missions" | "results";
const navItems: { id: View; label: string; icon: typeof Compass }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "explore", label: "Explore repository", icon: Compass },
  { id: "guides", label: "Walkthroughs", icon: BookOpen },
  { id: "missions", label: "Prediction tasks", icon: Target },
  { id: "results", label: "Your progress", icon: Trophy },
];

export function MentorWorkspace() {
  const [view, setView] = useState<View>("overview");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [map, setMap] = useState<ModuleMap | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [tasks, setTasks] = useState<PublicTask[]>([]);
  const [document, setDocument] = useState<SourceDocument | null>(null);
  const [range, setRange] = useState<{
    startLine: number;
    endLine: number;
  } | null>(null);
  const [selectedRange, setSelectedRange] = useState<
    { fileId: string; startLine: number; endLine: number } | undefined
  >();
  const [depth, setDepth] = useState<Depth>("beginner");
  const [guideIndex, setGuideIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [taskId, setTaskId] = useState("");
  const [tab, setTab] = useState<"source" | "map">("source");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [progress, setProgress] = useState<Results | null>(null);
  const sourceRequest = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const activeGuide = guides[guideIndex];
  const activeStep = activeGuide?.steps[stepIndex];
  async function refreshProgress() {
    try {
      setProgress(await api<Results>("/api/results"));
    } catch {
      /* Each result screen handles its own error. */
    }
  }
  useEffect(() => {
    let live = true;
    Promise.all([
      api<{ snapshot: Snapshot; files: SourceFile[] }>("/api/repository"),
      api<ModuleMap>("/api/repository/map"),
      api<{ guides: Guide[]; tasks: PublicTask[] }>("/api/guides"),
    ])
      .then(([repo, moduleMap, learning]) => {
        if (!live) return;
        setSnapshot(repo.snapshot);
        setFiles(repo.files);
        setMap(moduleMap);
        setGuides(learning.guides);
        setTasks(learning.tasks);
        setTaskId(learning.tasks[0]?.id || "");
        const first =
          repo.files.find((f) => f.path === "src/vanilla.ts") || repo.files[0];
        if (first) void openFile(first.fileId);
        void refreshProgress();
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        navigate("explore");
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  async function openFile(
    fileId: string,
    targetRange?: { startLine: number; endLine: number },
  ) {
    const id = ++sourceRequest.current;
    setSourceLoading(true);
    setError("");
    try {
      const source = await api<SourceDocument>(
        "/api/repository/source?fileId=" + encodeURIComponent(fileId),
      );
      if (id !== sourceRequest.current) return;
      setDocument(source);
      const focusedRange = targetRange ? {
        startLine: targetRange.startLine,
        endLine: targetRange.endLine,
      } : null;
      setRange(focusedRange);
      setSelectedRange(focusedRange ? { fileId, ...focusedRange } : undefined);
      setTab("source");
    } catch (e) {
      if (id === sourceRequest.current) setError((e as Error).message);
    } finally {
      if (id === sourceRequest.current) setSourceLoading(false);
    }
  }
  async function openEvidence(evidenceId: string, keepView = false) {
    const id = ++sourceRequest.current;
    setSourceLoading(true);
    setError("");
    try {
      const evidence = await api<Evidence>(
        "/api/evidence/" + encodeURIComponent(evidenceId),
      );
      if (id !== sourceRequest.current) return;
      if (!keepView && view !== "guides" && view !== "missions")
        setView("explore");
      await openFile(evidence.fileId, {
        startLine: evidence.startLine,
        endLine: evidence.endLine,
      });
    } catch (e) {
      if (id === sourceRequest.current) {
        setError((e as Error).message);
        setSourceLoading(false);
      }
    }
  }
  function navigate(next: View) {
    if (next === "guides" && guides.length) {
      startGuide(guideIndex, stepIndex);
      return;
    }
    if (next === "missions" && tasks.length) {
      startTask(taskId || tasks[0].id);
      return;
    }
    setView(next);
    setMobileOpen(false);
    if (next === "results") void refreshProgress();
  }
  function startGuide(index: number, step = 0) {
    setGuideIndex(index);
    setStepIndex(step);
    setView("guides");
    setMobileOpen(false);
    const target = guides[index]?.steps[step]?.evidenceIds[0];
    if (target) void openEvidence(target, true);
  }
  function stepTo(index: number) {
    setStepIndex(index);
    const target = activeGuide.steps[index]?.evidenceIds[0];
    if (target) void openEvidence(target, true);
  }
  function startTask(id: string) {
    setTaskId(id);
    setView("missions");
    setMobileOpen(false);
    const task = tasks.find((t) => t.id === id);
    if (task?.contextEvidenceIds[0])
      void openEvidence(task.contextEvidenceIds[0], true);
  }
  const completed = progress?.completed || 0;
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobileOpen ? "open" : "")}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
          aria-label="Codebase Mentor home"
        >
          <span className="brand-icon">
            <Braces size={25} />
          </span>
          <span>
            codebase
            <span>
              mentor<span className="brand-dot">.</span>
            </span>
          </span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={"nav-item " + (view === id ? "active" : "")}
              onClick={() => navigate(id)}
            >
              <Icon size={17} />
              <span>{label}</span>
              {id === "missions" && <span className="nav-count">4</span>}
              {view === id && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-journey">
          <span className="small-icon">
            <Sparkles size={16} />
          </span>
          <h4>Your next chapter starts small.</h4>
          <p>
            Understand the code.
            <br />
            Then make it your own.
          </p>
          <button onClick={() => startGuide(0)}>
            Start a walkthrough
            <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <div className="repo-status">
            <span className="repo-avatar">Z</span>
            <div>
              <strong>pmndrs / zustand</strong>
              <span>
                <i className="status-dot" /> Prepared repository
              </span>
            </div>
            <ShieldCheck size={15} />
          </div>
          <div className="profile">
            <span className="profile-avatar">Y</span>
            <div>
              <strong>Your learning space</strong>
              <span>Local demo · Anonymous session</span>
            </div>
          </div>
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{navItems.find((n) => n.id === view)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="prepared-badge">
              <span />
              Prepared mode
            </span>
            <span className="topbar-divider" />
            <a
              href="https://github.com/pmndrs/zustand"
              target="_blank"
              rel="noreferrer"
              className="github-link"
            >
              <GitBranch size={15} />
              <span>View repository</span>
              <ArrowUpRight size={13} />
            </a>
            <span className="top-avatar">Y</span>
          </div>
        </header>
        <main
          className={
            view === "overview"
              ? "main-content overview-content"
              : "main-content workspace-content"
          }
        >
          {loading ? (
            <div className="loading-screen">
              <span className="spinner" />
              <p>Preparing your learning workspace…</p>
            </div>
          ) : !snapshot ? (
            <div className="error-screen">
              <h1>We couldn’t open the repository.</h1>
              <p>{error}</p>
              <button
                className="primary-button"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              {error && (
                <div role="alert" className="global-error">
                  {error}
                  <button
                    onClick={() => setError("")}
                    aria-label="Dismiss error"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}
              {view === "overview" ? (
                <>
                  <section className="welcome">
                    <div>
                      <div className="eyebrow">
                        <span /> A LITTLE CURIOSITY. A REAL CODEBASE.
                      </div>
                      <h1>
                        Big codebase.
                        <br />
                        <span>Small first steps.</span>
                      </h1>
                      <p>
                        Turn unfamiliar code into your next contribution.
                        <br />
                        Explore, predict, and learn — with the source by your
                        side.
                      </p>
                      <div className="welcome-actions">
                        <button
                          className="primary-button"
                          onClick={() => navigate("explore")}
                        >
                          Explore repository
                          <ArrowRight size={16} />
                        </button>
                        <button
                          className="text-button"
                          onClick={() => startGuide(0)}
                        >
                          <Play size={13} /> Take a guided tour
                        </button>
                      </div>
                    </div>
                    <div className="welcome-art" aria-hidden="true">
                      <div className="art-grid" />
                      <div className="orbit orbit-one" />
                      <div className="orbit orbit-two" />
                      <div className="art-node node-types">
                        <span className="ts-icon">TS</span>
                        <span>vanilla.ts</span>
                        <i />
                      </div>
                      <div className="art-node node-react">
                        <Code2 size={18} />
                        <span>react.ts</span>
                        <i />
                      </div>
                      <div className="art-node node-middleware">
                        <Box size={17} />
                        <span>middleware</span>
                      </div>
                      <div className="art-center">
                        <Braces size={42} />
                      </div>
                      <span className="art-star star-one">✳</span>
                      <span className="art-star star-two">+</span>
                      <div className="art-note">
                        <span />
                        <span>
                          Everything connects.
                          <br />
                          <strong>Let’s find out how.</strong>
                        </span>
                      </div>
                    </div>
                  </section>
                  <section
                    className="stat-row"
                    aria-label="Learning workspace summary"
                  >
                    <div>
                      <span className="stat-icon blue">
                        <FileCode2 size={18} />
                      </span>
                      <strong>
                        {files.length}
                        <small>Source files to explore</small>
                      </strong>
                    </div>
                    <div>
                      <span className="stat-icon purple">
                        <GitBranch size={18} />
                      </span>
                      <strong>
                        {guides.length}
                        <small>Reviewed walkthroughs</small>
                      </strong>
                    </div>
                    <div>
                      <span className="stat-icon amber">
                        <Target size={18} />
                      </span>
                      <strong>
                        {tasks.length}
                        <small>Prediction checkpoints</small>
                      </strong>
                    </div>
                    <div>
                      <span className="stat-icon green">
                        <ShieldCheck size={18} />
                      </span>
                      <strong>
                        Source-backed<small>Evidence at every step</small>
                      </strong>
                    </div>
                  </section>
                  <div className="overview-grid">
                    <section className="repository-card">
                      <div className="section-header">
                        <h2>Your practice ground</h2>
                        <span className="subtle-label">READY TO EXPLORE</span>
                      </div>
                      <div className="repo-card-body">
                        <div className="repo-title-row">
                          <div className="zustand-mark">
                            ʕ<span>•ᴥ•</span>ʔ
                          </div>
                          <span className="language-tag">
                            <i /> TypeScript
                          </span>
                        </div>
                        <div className="repo-author">PMNDRS /</div>
                        <h3>
                          Zustand<span>↗</span>
                        </h3>
                        <p>
                          A small, fast state management library.
                          <br />A great place to see how a few simple ideas fit
                          together.
                        </p>
                        <div className="repo-meta">
                          <span>
                            <GitCommitHorizontal size={14} />
                            {snapshot.commitSha.slice(0, 7)}
                          </span>
                          <span>
                            <ShieldCheck size={13} />
                            {snapshot.license} licensed
                          </span>
                          <span>
                            <Folder size={13} />
                            {files.length} source files
                          </span>
                        </div>
                        <button
                          className="repo-explore"
                          onClick={() => navigate("explore")}
                        >
                          Open the codebase
                          <ArrowRight size={17} />
                        </button>
                      </div>
                      <div className="snapshot-note">
                        <span className="status-dot" /> A pinned source
                        snapshot. The same code, every time.
                      </div>
                    </section>
                    <section className="how-card">
                      <div className="section-header">
                        <h2>Learn by figuring it out</h2>
                        <Lightbulb size={17} />
                      </div>
                      <div className="journey-steps">
                        {[
                          {
                            n: "01",
                            icon: Compass,
                            title: "Get your bearings",
                            text: "Explore the files and see how modules connect.",
                          },
                          {
                            n: "02",
                            icon: BookOpen,
                            title: "Follow the thread",
                            text: "Trace a real flow, one source-backed step at a time.",
                          },
                          {
                            n: "03",
                            icon: Target,
                            title: "Make a prediction",
                            text: "Think it through before revealing the explanation.",
                          },
                          {
                            n: "04",
                            icon: GitBranch,
                            title: "Find your first contribution",
                            text: "Leave with a small, focused place to start.",
                          },
                        ].map(({ n, icon: Icon, title, text }) => (
                          <div className="journey-step" key={n}>
                            <span className="step-number">{n}</span>
                            <span className="journey-icon">
                              <Icon size={17} />
                            </span>
                            <div>
                              <h4>{title}</h4>
                              <p>{text}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="how-foot">
                        <ShieldCheck size={14} /> Understanding first.
                        Confidence follows.
                      </div>
                    </section>
                  </div>
                  <section className="walkthrough-section">
                    <div className="section-header">
                      <div>
                        <h2>Follow a thread</h2>
                        <p>
                          Two guided paths from “where do I start?” to “I see
                          how it works.”
                        </p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => startGuide(0)}
                      >
                        View walkthroughs
                        <ArrowRight size={14} />
                      </button>
                    </div>
                    <div className="guide-cards">
                      {guides.map((guide, i) => (
                        <button
                          className="guide-card"
                          key={guide.id}
                          onClick={() => startGuide(i)}
                        >
                          <div className={"guide-illustration guide-" + i}>
                            {i === 0 ? (
                              <GitBranch size={25} />
                            ) : (
                              <Code2 size={25} />
                            )}
                          </div>
                          <div>
                            <span className="guide-kicker">
                              WALKTHROUGH {String(i + 1).padStart(2, "0")}
                            </span>
                            <h3>{guide.title}</h3>
                            <p>{guide.description}</p>
                            <span className="guide-meta">
                              <BookOpen size={12} />
                              {guide.steps.length} steps<span>·</span>
                              {guide.duration}
                            </span>
                          </div>
                          <span className="guide-arrow">
                            <ArrowUpRight size={19} />
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                  <footer className="overview-footer">
                    <span>
                      <ShieldCheck size={13} /> Reviewed learning content. Real
                      source evidence.
                    </span>
                    <span>Built for the curious.</span>
                  </footer>
                </>
              ) : view === "results" ? (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">YOUR LEARNING JOURNEY</div>
                      <h1>A little further than before.</h1>
                      <p>
                        Reflect on your predictions, then find a focused place
                        to contribute.
                      </p>
                    </div>
                    <button
                      className="secondary-button"
                      onClick={() => navigate("missions")}
                    >
                      Back to predictions
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  <ResultsPanel
                    onEvidence={(id) => void openEvidence(id)}
                    onReset={() => {
                      void refreshProgress();
                    }}
                  />
                </>
              ) : (
                <>
                  <div className="page-heading explore-heading">
                    <div>
                      <div className="eyebrow">
                        {view === "guides"
                          ? "FOLLOW THE THREAD"
                          : view === "missions"
                            ? "PREDICT BEFORE REVEAL"
                            : "GET YOUR BEARINGS"}
                      </div>
                      <h1>
                        {view === "guides"
                          ? "One flow. A few “aha” moments."
                          : view === "missions"
                            ? "What do you think happens next?"
                            : "Find your way through the code."}
                      </h1>
                      <p>
                        {view === "guides"
                          ? "Reviewed explanations, connected to the exact source."
                          : view === "missions"
                            ? "Read the source, make an attempt, then check your reasoning."
                            : "Every file is a starting point. Every connection is a clue."}
                      </p>
                    </div>
                    <div
                      className="depth-switch"
                      aria-label="Explanation depth"
                    >
                      <button
                        className={depth === "beginner" ? "active" : ""}
                        onClick={() => setDepth("beginner")}
                      >
                        <GraduationCap size={14} />
                        Beginner
                      </button>
                      <button
                        className={depth === "developer" ? "active" : ""}
                        onClick={() => setDepth("developer")}
                      >
                        <Code2 size={14} />
                        Developer
                      </button>
                    </div>
                  </div>
                  {view === "guides" && (
                    <div className="guide-selector">
                      {guides.map((g, i) => (
                        <button
                          key={g.id}
                          className={guideIndex === i ? "active" : ""}
                          onClick={() => startGuide(i)}
                        >
                          <span>0{i + 1}</span>
                          {g.title}
                          <ChevronRight size={14} />
                        </button>
                      ))}
                    </div>
                  )}
                  {view === "missions" && (
                    <div className="task-selector">
                      {tasks.map((t, i) => (
                        <button
                          key={t.id}
                          onClick={() => startTask(t.id)}
                          className={taskId === t.id ? "active" : ""}
                        >
                          <span>
                            {progress?.tasks.find((r) => r.taskId === t.id)
                              ?.completed ? (
                              <Check size={13} />
                            ) : (
                              i + 1
                            )}
                          </span>
                          {t.title}
                        </button>
                      ))}
                    </div>
                  )}
                  <div
                    className={
                      "explorer-layout " +
                      (view === "explore" ? "browse-mode" : "learning-mode")
                    }
                  >
                    <section className="code-workspace">
                      <div className="code-workspace-header">
                        <span className="repo-mini-avatar">Z</span>
                        <strong>pmndrs / zustand</strong>
                        <span className="commit-chip">
                          <GitCommitHorizontal size={12} />
                          {snapshot.commitSha.slice(0, 7)}
                        </span>
                        <span className="read-only">READ ONLY</span>
                      </div>
                      <div className="code-workspace-body">
                        <aside className="file-tree">
                          <div className="file-tree-title">
                            EXPLORER<span>{files.length}</span>
                          </div>
                          <div className="file-search">
                            <Search size={13} />
                            <input
                              ref={searchRef}
                              value={filter}
                              onChange={(e) => setFilter(e.target.value)}
                              aria-label="Search source files"
                              placeholder="Find a file…"
                            />
                            <kbd>/</kbd>
                          </div>
                          <div className="folder-title">
                            <ChevronDown size={12} />
                            <Folder size={14} />
                            src
                          </div>
                          <div className="file-list">
                            {files
                              .filter((f) =>
                                f.path
                                  .toLowerCase()
                                  .includes(filter.toLowerCase()),
                              )
                              .map((f) => (
                                <button
                                  key={f.fileId}
                                  onClick={() => void openFile(f.fileId)}
                                  className={
                                    document?.file.fileId === f.fileId
                                      ? "active"
                                      : ""
                                  }
                                  title={f.path}
                                >
                                  <span className="ts-file-icon">TS</span>
                                  <span>{f.path.replace("src/", "")}</span>
                                </button>
                              ))}
                            {!files.some((f) =>
                              f.path
                                .toLowerCase()
                                .includes(filter.toLowerCase()),
                            ) && <p className="no-files">No matching files</p>}
                          </div>
                          <div className="tree-footer">
                            <ShieldCheck size={12} /> Pinned, immutable source
                          </div>
                        </aside>
                        <div className="source-panel">
                          <div className="source-tabs">
                            <button
                              className={tab === "source" ? "active" : ""}
                              onClick={() => setTab("source")}
                            >
                              <FileCode2 size={13} />
                              {document?.file.path.split("/").pop() ||
                                "Source code"}
                            </button>
                            <button
                              className={tab === "map" ? "active" : ""}
                              onClick={() => setTab("map")}
                            >
                              <Map size={13} />
                              Module map
                            </button>
                          </div>
                          {tab === "source" ? (
                            <>
                              <div className="source-breadcrumb">
                                <span>{document?.file.path}</span>
                                <span>
                                  {sourceLoading
                                    ? "Loading…"
                                    : range
                                      ? `Lines ${range.startLine}–${range.endLine}`
                                      : `${document?.file.lineCount || 0} lines`}
                                </span>
                              </div>
                              <SourceViewer
                                document={document}
                                range={range}
                                onSelect={(startLine, endLine) => {
                                  if (document) {
                                    setRange({ startLine, endLine });
                                    setSelectedRange({
                                      fileId: document.file.fileId,
                                      startLine,
                                      endLine,
                                    });
                                  }
                                }}
                              />
                              <div className="editor-footer">
                                <span>
                                  <span className="status-dot" />
                                  TypeScript
                                </span>
                                <span>
                                  Select lines to add context to your question
                                </span>
                              </div>
                            </>
                          ) : (
                            <>
                              {map && (
                                <ModuleGraph
                                  map={map}
                                  selectedFileId={document?.file.fileId || ""}
                                  onSelect={(id) => void openFile(id)}
                                />
                              )}
                              <div className="map-note">
                                <Lightbulb size={13} /> Static imports only;
                                this map does not show runtime execution.
                              </div>
                              {!!map?.unresolved.length && (
                                <details className="unresolved">
                                  <summary>
                                    {map.unresolved.length} external or
                                    unresolved relationships
                                  </summary>
                                  {map.unresolved.map((r, i) => (
                                    <p key={i}>
                                      <code>{r.specifier}</code> — {r.reason}
                                    </p>
                                  ))}
                                </details>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </section>
                    <aside className="mentor-column">
                      {view === "guides" && activeStep ? (
                        <section className="guide-panel">
                          <div className="panel-eyebrow">
                            <BookOpen size={14} /> REVIEWED WALKTHROUGH
                          </div>
                          <div className="guide-progress-label">
                            <span>
                              Step {stepIndex + 1} of {activeGuide.steps.length}
                            </span>
                            <span>
                              {Math.round(
                                ((stepIndex + 1) / activeGuide.steps.length) *
                                  100,
                              )}
                              %
                            </span>
                          </div>
                          <div className="progress-track">
                            <span
                              style={{
                                width:
                                  ((stepIndex + 1) / activeGuide.steps.length) *
                                    100 +
                                  "%",
                              }}
                            />
                          </div>
                          <h2>{activeStep.title}</h2>
                          <p className="guide-explanation">
                            {activeStep[depth]}
                          </p>
                          <div className="guide-evidence">
                            {activeStep.evidenceIds.map((id) => (
                              <button
                                key={id}
                                className="evidence-link"
                                onClick={() => void openEvidence(id, true)}
                              >
                                <FileCode2 size={13} />
                                Inspect source evidence
                                <ArrowUpRight size={13} />
                              </button>
                            ))}
                          </div>
                          {activeStep.taskId && (
                            <button
                              className="checkpoint-button"
                              onClick={() => startTask(activeStep.taskId!)}
                            >
                              <Target size={18} />
                              <span>
                                <strong>Pause and make a prediction</strong>
                                <small>
                                  Check your understanding before continuing.
                                </small>
                              </span>
                              <ChevronRight size={15} />
                            </button>
                          )}
                          <div className="step-navigation">
                            <button
                              className="secondary-button"
                              disabled={stepIndex === 0}
                              onClick={() => stepTo(stepIndex - 1)}
                            >
                              <ChevronLeft size={14} />
                              Previous
                            </button>
                            {stepIndex < activeGuide.steps.length - 1 ? (
                              <button
                                className="primary-button"
                                onClick={() => stepTo(stepIndex + 1)}
                              >
                                Next step
                                <ChevronRight size={14} />
                              </button>
                            ) : (
                              <button
                                className="primary-button"
                                onClick={() =>
                                  startTask(
                                    tasks.find(
                                      (t) => t.guideId === activeGuide.id,
                                    )?.id || tasks[0].id,
                                  )
                                }
                              >
                                Try a prediction
                                <ArrowRight size={14} />
                              </button>
                            )}
                          </div>
                          <div className="guide-step-list">
                            {activeGuide.steps.map((step, i) => (
                              <button
                                key={step.id}
                                className={stepIndex === i ? "active" : ""}
                                onClick={() => stepTo(i)}
                              >
                                <span>{i + 1}</span>
                                {step.title}
                              </button>
                            ))}
                          </div>
                        </section>
                      ) : view === "missions" ? (
                        <MissionPanel
                          key={taskId}
                          taskId={taskId}
                          depth={depth}
                          onEvidence={(id) => void openEvidence(id, true)}
                          onComplete={() => void refreshProgress()}
                          selectedRange={selectedRange}
                        />
                      ) : (
                        <div className="explore-tip">
                          <span className="small-icon">
                            <Compass size={19} />
                          </span>
                          <h3>Start with curiosity.</h3>
                          <p>
                            Try{" "}
                            <button
                              onClick={() => {
                                const file = files.find(
                                  (f) => f.path === "src/vanilla.ts",
                                );
                                if (file) void openFile(file.fileId);
                              }}
                            >
                              vanilla.ts
                            </button>{" "}
                            for the core store, or follow a reviewed
                            walkthrough.
                          </p>
                          <button
                            className="text-button"
                            onClick={() => startGuide(0)}
                          >
                            Follow a walkthrough
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      )}
                      <QuestionPanel
                        snapshot={snapshot}
                        document={document}
                        range={range}
                        depth={depth}
                        guide={view === "guides" ? activeGuide : undefined}
                        step={view === "guides" ? activeStep : undefined}
                        onEvidence={(id) => void openEvidence(id, true)}
                      />
                    </aside>
                  </div>
                  <div className="workspace-footnote">
                    <ShieldCheck size={13} />
                    <span>
                      Source pinned to{" "}
                      <a
                        href={`${snapshot.repositoryUrl}/tree/${snapshot.commitSha}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {snapshot.commitSha.slice(0, 12)}
                        <ExternalLink size={11} />
                      </a>{" "}
                      · Reviewed content is distinct from live AI output.
                    </span>
                    {view === "missions" && (
                      <button onClick={() => navigate("results")}>
                        View your progress ({completed}/4)
                        <ArrowRight size={13} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
