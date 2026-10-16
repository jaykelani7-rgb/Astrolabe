"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  Code2,
  FileCode2,
  Folder,
  Maximize2,
  MessageSquare,
  Minimize2,
  PanelLeft,
  PanelRight,
  Search,
  Target,
  X,
} from "lucide-react";
import type { Workspace } from "@/lib/client/workspace";
import { FileExplorer } from "./FileExplorer";
import { GuidePanel } from "./GuidePanel";
import { SourceViewer } from "../SourceViewer";
import { ModuleGraph } from "../ModuleGraph";
import { QuestionPanel } from "../QuestionPanel";
import { MissionPanel } from "@/features/missions";
function PanelDivider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const drag = useRef<{ x: number; value: number } | null>(null);
  return (
    <div
      className="panel-divider"
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          const reverse = label.includes("mentor") ? -1 : 1;
          onChange(
            e.key === "Home"
              ? min
              : e.key === "End"
                ? max
                : Math.max(
                    min,
                    Math.min(
                      max,
                      value + (e.key === "ArrowRight" ? 20 : -20) * reverse,
                    ),
                  ),
          );
        }
      }}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, value };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const reverse = label.includes("mentor") ? -1 : 1;
        onChange(
          Math.max(
            min,
            Math.min(
              max,
              drag.current.value + (e.clientX - drag.current.x) * reverse,
            ),
          ),
        );
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
    >
      <span />
    </div>
  );
}
export function SourceWorkspace({ workspace: w }: { workspace: Workspace }) {
  const [mobileTab, setMobileTab] = useState<"files" | "code" | "mentor">(
    "code",
  );
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const focused = w.preferences.focus;
  const showFiles = !w.preferences.filesCollapsed && !focused;
  const showMentor = !w.preferences.mentorCollapsed && !focused;
  const mentorWidth = Math.min(
    w.preferences.mentorWidth,
    Math.max(300, width - (showFiles ? 180 : 0) - 380),
  );
  const fileWidth = Math.min(
    w.preferences.fileWidth,
    Math.max(180, width - (showMentor ? mentorWidth : 0) - 380),
  );
  const grid = [
    ...(showFiles ? [`${fileWidth}px`, "8px"] : []),
    "minmax(360px, 1fr)",
    ...(showMentor ? ["8px", `${mentorWidth}px`] : []),
  ].join(" ");
  function inspectEvidence(id: string) {
    void w.openEvidence(id);
    if (window.innerWidth <= 1100) setMobileTab("code");
  }
  return (
    <section
      className={`source-workspace ${focused ? "is-focused" : ""} mobile-${mobileTab} ${showFiles ? "" : "files-collapsed"} ${showMentor ? "" : "mentor-collapsed"}`}
      aria-label={
        w.view === "learn" ? "Learning workspace" : "Exploration workspace"
      }
    >
      <div className="workspace-title-row">
        <div>
          <span className="eyebrow">
            {w.view === "learn"
              ? "LEARN WITH THE SOURCE"
              : "EXPLORE THE SNAPSHOT"}
          </span>
          <h1>
            {w.view === "learn"
              ? w.activeGuide.title
              : "A place to read and ask."}
          </h1>
          {w.view === "learn" && (
            <p className="workspace-flow-context">
              Step {w.stepIndex + 1} of {w.activeGuide.steps.length} ·{" "}
              {w.activeTaskId ? "Prediction checkpoint" : w.activeStep.title}
            </p>
          )}
        </div>
        <div className="workspace-tools">
          <button
            className={`icon-label-button ${showFiles ? "active" : ""}`}
            onClick={() => {
              if (focused) w.updatePreference("focus", false);
              w.updatePreference(
                "filesCollapsed",
                focused ? false : !w.preferences.filesCollapsed,
              );
            }}
            aria-label={showFiles ? "Hide files panel" : "Show files panel"}
            aria-pressed={showFiles}
          >
            <PanelLeft size={17} />
            <span>Files</span>
          </button>
          <button
            className={`icon-label-button ${showMentor ? "active" : ""}`}
            onClick={() => {
              if (focused) w.updatePreference("focus", false);
              w.updatePreference(
                "mentorCollapsed",
                focused ? false : !w.preferences.mentorCollapsed,
              );
            }}
            aria-label={showMentor ? "Hide mentor panel" : "Show mentor panel"}
            aria-pressed={showMentor}
          >
            <PanelRight size={17} />
            <span>Mentor</span>
          </button>
          <button
            className="icon-label-button"
            onClick={() => w.updatePreference("focus", !focused)}
            aria-pressed={focused}
          >
            {focused ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            <span>{focused ? "Exit focus" : "Focus editor"}</span>
          </button>
        </div>
      </div>
      <div
        className="mobile-workspace-tabs"
        role="tablist"
        aria-label="Workspace panels"
      >
        {(
          [
            {
              id: "files",
              label: w.view === "learn" ? "Files & flow" : "Files",
              icon: Folder,
            },
            { id: "code", label: "Code", icon: Code2 },
            {
              id: "mentor",
              label: w.activeTaskId ? "Checkpoint & mentor" : "Mentor",
              icon: MessageSquare,
            },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={"panel-tab-" + id}
            role="tab"
            tabIndex={mobileTab === id ? 0 : -1}
            onKeyDown={(event) => {
              const ids = ["files", "code", "mentor"] as const;
              const index = ids.indexOf(id);
              if (
                ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 2
                      : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
                setMobileTab(ids[next]);
                window.document
                  .getElementById("panel-tab-" + ids[next])
                  ?.focus();
              }
            }}
            aria-selected={mobileTab === id}
            aria-controls={"workspace-" + id}
            onClick={() => setMobileTab(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      <div
        ref={container}
        className="workspace-panels"
        style={{ gridTemplateColumns: grid } as CSSProperties}
      >
        <div id="workspace-files" className="files-slot">
          <FileExplorer
            workspace={w}
            onCollapse={() => w.updatePreference("filesCollapsed", true)}
            onReveal={() => setMobileTab("files")}
          />
        </div>
        {showFiles && (
          <PanelDivider
            label="Resize files panel"
            value={fileWidth}
            min={180}
            max={Math.max(
              180,
              Math.min(320, width - (showMentor ? mentorWidth : 0) - 380),
            )}
            onChange={(value) => w.updatePreference("fileWidth", value)}
          />
        )}
        <section
          id="workspace-code"
          className="source-panel"
          aria-label="Source and module map"
        >
          <div className="source-tabs">
            <button
              className={w.tab === "source" ? "active" : ""}
              onClick={() => w.setTab("source")}
              aria-pressed={w.tab === "source"}
            >
              <FileCode2 size={16} />
              Source
            </button>
            <button
              className={w.tab === "map" ? "active" : ""}
              onClick={() => w.setTab("map")}
              aria-pressed={w.tab === "map"}
            >
              <Code2 size={16} />
              Module map
            </button>
            <span>READ ONLY</span>
          </div>
          {w.tab === "source" ? (
            <>
              <div className="source-context">
                <div>
                  <code>{w.document?.file.path || "Opening source…"}</code>
                  <span className="source-selection-label" role="status">
                    {w.sourceLoading
                      ? "Loading source…"
                      : w.range
                        ? `Lines ${w.range.startLine}–${w.range.endLine}`
                        : `${w.document?.file.lineCount || 0} lines`}
                  </span>
                </div>
                {w.range && (
                  <button
                    onClick={() => w.setRange(null)}
                    className="clear-selection"
                  >
                    <X size={13} />
                    Clear selection
                  </button>
                )}
              </div>
              <SourceViewer
                document={w.document}
                range={w.range}
                onSelect={(startLine, endLine) =>
                  w.setRange({ startLine, endLine })
                }
              />
              <div className="editor-footer">
                <span>TypeScript · read only</span>
                <span>Select a source range for a focused question</span>
              </div>
            </>
          ) : (
            <>
              <div className="map-context">
                <strong>Static import relationships</strong>
                <span>
                  {w.map?.nodes.length} files · {w.map?.edges.length}{" "}
                  relationships
                </span>
              </div>
              {w.map && (
                <ModuleGraph
                  map={w.map}
                  selectedFileId={w.document?.file.fileId || ""}
                  onSelect={(fileId) => void w.openFile(fileId)}
                />
              )}
              <p className="map-note">
                This map shows static imports, not runtime execution. Dashed
                edges are type-only imports.
              </p>
              <details className="unresolved">
                <summary>
                  {w.map?.unresolved.length} external or unresolved references
                </summary>
                {w.map?.unresolved.map((reference, index) => (
                  <p key={index}>
                    <code>{reference.specifier}</code>
                    <span>{reference.reason}</span>
                  </p>
                ))}
              </details>
            </>
          )}
        </section>
        {showMentor && (
          <PanelDivider
            label="Resize mentor panel"
            value={mentorWidth}
            min={300}
            max={Math.max(
              300,
              Math.min(480, width - (showFiles ? fileWidth : 0) - 380),
            )}
            onChange={(value) => w.updatePreference("mentorWidth", value)}
          />
        )}
        <aside
          id="workspace-mentor"
          className="mentor-slot"
          aria-label="Contextual mentor"
        >
          <div className="mentor-panel-heading">
            <span>
              <MessageSquare size={17} />
              Your mentor
            </span>
            <button
              className="icon-button"
              onClick={() => w.updatePreference("mentorCollapsed", true)}
              aria-label="Collapse mentor panel"
            >
              <X size={16} />
            </button>
          </div>
          <div className="depth-controls">
            <label>Explanation depth</label>
            <div role="group" aria-label="Explanation depth">
              <button
                aria-pressed={w.depth === "beginner"}
                className={w.depth === "beginner" ? "active" : ""}
                onClick={() => w.setDepth("beginner")}
              >
                Beginner
              </button>
              <button
                aria-pressed={w.depth === "developer"}
                className={w.depth === "developer" ? "active" : ""}
                onClick={() => w.setDepth("developer")}
              >
                Developer
              </button>
            </div>
          </div>
          {w.view === "learn" && (
            <div className="learning-context">
              {w.activeTaskId ? (
                <>
                  <div className="checkpoint-context">
                    <button
                      className="text-button"
                      onClick={() => {
                        w.stepTo(w.stepIndex);
                        setMobileTab("mentor");
                      }}
                    >
                      <ArrowLeft size={14} />
                      Back to this step
                    </button>
                    <span>Step {w.stepIndex + 1} · checkpoint</span>
                  </div>
                  <MissionPanel
                    taskId={w.activeTaskId}
                    depth={w.depth}
                    selectedRange={
                      w.document && w.range
                        ? { fileId: w.document.file.fileId, ...w.range }
                        : undefined
                    }
                    onEvidence={inspectEvidence}
                    onComplete={() => void w.refreshProgress()}
                    onContinue={() => {
                      w.continueFromCheckpoint();
                      setMobileTab("mentor");
                    }}
                    continueLabel="Continue walkthrough"
                  />
                </>
              ) : (
                <GuidePanel workspace={w} />
              )}
            </div>
          )}
          <QuestionPanel
            snapshot={w.snapshot!}
            files={w.files}
            document={w.document}
            range={w.range}
            depth={w.depth}
            guide={w.view === "learn" ? w.activeGuide : undefined}
            step={w.view === "learn" ? w.activeStep : undefined}
            onEvidence={inspectEvidence}
          />
        </aside>
      </div>
      <div className="workspace-footnote">
        <ShieldNote />
        {w.view === "learn" ? (
          <span>
            Visited steps and solved checkpoints are separate. Your place is
            saved for this snapshot.
          </span>
        ) : (
          <span>
            Read-only source from one pinned commit. Every evidence link opens
            this same snapshot.
          </span>
        )}
      </div>
    </section>
  );
}
function ShieldNote() {
  return <BookOpen size={14} />;
}
