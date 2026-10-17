"use client";
import {
  BookOpen,
  Check,
  ChevronDown,
  FileCode2,
  Folder,
  Search,
  Target,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Workspace } from "@/lib/client/workspace";
import { CodeSearch } from "./CodeSearch";
export function FileExplorer({
  workspace: w,
  onCollapse,
  onReveal,
  onEvidence,
}: {
  workspace: Workspace;
  onCollapse: () => void;
  onReveal: () => void;
  onEvidence: (id:string,snapshotId?:string)=>void;
}) {
  const [filter, setFilter] = useState("");
  const [leftTab, setLeftTab] = useState<"files" | "flow" | "search">(
    w.view === "learn" ? "flow" : "files",
  );
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setLeftTab(w.view === "learn" ? "flow" : "files");
  }, [w.view]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.key === "/" &&
        !["INPUT", "TEXTAREA"].includes(target.tagName) &&
        target.getAttribute("role") !== "textbox"
      ) {
        event.preventDefault();
        onReveal();
        w.updatePreference("focus", false);
        w.updatePreference("filesCollapsed", false);
        setLeftTab("files");
        if (w.view !== "explore" && w.view !== "learn") w.navigate("explore");
        window.requestAnimationFrame(() => search.current?.focus());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [w.updatePreference]);
  return (
    <aside
      className="files-panel"
      aria-label={leftTab === "flow" ? "Learning outline" : leftTab === "search" ? "Search source" : "Source files"}
    >
      <div className="panel-title-row">
        <div className="left-panel-tabs">
          <button
            className={leftTab === "files" ? "active" : ""}
            onClick={() => setLeftTab("files")}
          >
            <Folder size={15} />
            Files
          </button>
          <button className={leftTab === "search" ? "active" : ""} onClick={()=>setLeftTab("search")}><Search size={15} />Search code</button>
          {w.view === "learn" && (
            <button
              className={leftTab === "flow" ? "active" : ""}
              onClick={() => setLeftTab("flow")}
            >
              <BookOpen size={15} />
              Flow
            </button>
          )}
        </div>
        <button
          className="icon-button panel-collapse"
          onClick={onCollapse}
          aria-label="Collapse files panel"
        >
          <X size={16} />
        </button>
      </div>
      {leftTab === "search" ? <CodeSearch snapshotId={w.snapshot!.snapshotId} files={w.files} onEvidence={onEvidence} /> : leftTab === "files" ? (
        <>
          <div className="file-search">
            <Search size={15} />
            <input
              ref={search}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find a file"
              aria-label="Search source files"
            />
            <kbd>/</kbd>
          </div>
          <div className="file-tree-heading">
            <ChevronDown size={13} />
            <Folder size={15} />
            <span>src</span>
            <small>{w.files.length}</small>
          </div>
          <div className="file-list">
            {w.files
              .filter((f) =>
                f.path.toLowerCase().includes(filter.toLowerCase()),
              )
              .map((file) => (
                <button
                  key={file.fileId}
                  title={file.path}
                  onClick={() => void w.openFile(file.fileId)}
                  aria-current={
                    w.document?.file.fileId === file.fileId ? "true" : undefined
                  }
                  className={
                    w.document?.file.fileId === file.fileId ? "active" : ""
                  }
                >
                  <span className="ts-file-icon">TS</span>
                  <span>{file.path.replace("src/", "")}</span>
                </button>
              ))}
            {!w.files.some((f) =>
              f.path.toLowerCase().includes(filter.toLowerCase()),
            ) && <p className="empty-state">No files match “{filter}”.</p>}
          </div>
          <div className="files-footnote">
            {w.files.length} allowed source files
            <br />
            Pinned, read-only snapshot
          </div>
        </>
      ) : (
        <div className="flow-outline">
          <label className="guide-select-label" htmlFor="guide-select">
            Walkthrough
          </label>
          <select
            id="guide-select"
            value={w.guideId}
            onChange={(e) => w.selectGuide(e.target.value)}
          >
            {w.guides.map((guide, index) => (
              <option key={guide.id} value={guide.id}>
                {index + 1}. {guide.title}
              </option>
            ))}
          </select>
          <div className="flow-position">
            {w.activeGuide.steps.length} steps ·{" "}
            {w.tasks.filter((t) => t.guideId === w.guideId).length} checkpoints
          </div>
          <ol className="flow-steps">
            {w.activeGuide.steps.map((step, index) => {
              const visited = w.visited.includes(w.guideId + ":" + step.id);
              const solved =
                step.taskId &&
                w.progress?.tasks.find((t) => t.taskId === step.taskId)
                  ?.completed;
              return (
                <li key={step.id}>
                  <button
                    className={w.stepIndex === index ? "active" : ""}
                    aria-current={w.stepIndex === index ? "step" : undefined}
                    onClick={() => w.stepTo(index)}
                  >
                    <span
                      className={`flow-step-marker ${visited ? "visited" : ""}`}
                    >
                      {visited ? <Check size={12} /> : index + 1}
                    </span>
                    <span>
                      {step.title}
                      {step.taskId && (
                        <small>
                          <Target size={11} />
                          {solved
                            ? "Checkpoint solved"
                            : "Prediction checkpoint"}
                        </small>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <details className="checkpoint-index">
            <summary>All prediction checkpoints</summary>
            {w.tasks.map((task, index) => (
              <button
                key={task.id}
                onClick={() => w.openCheckpoint(task.id)}
                className={w.activeTaskId === task.id ? "active" : ""}
              >
                <Target size={13} />
                <span>
                  {index + 1}. {task.title}
                </span>
                {w.progress?.tasks.find((t) => t.taskId === task.id)
                  ?.completed && <Check size={13} />}
              </button>
            ))}
          </details>
          <p className="inline-note">
            A visited step means you opened it. Solved checkpoints are tracked
            separately.
          </p>
        </div>
      )}
    </aside>
  );
}
