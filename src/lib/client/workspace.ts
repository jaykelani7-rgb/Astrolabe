"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Evidence,
  Guide,
  ModuleMap,
  PublicTask,
  Results,
  Snapshot,
  SourceDocument,
  SourceFile,
} from "@/contracts";
import { api } from "./api";
export type WorkspaceView = "overview" | "explore" | "learn" | "progress" | "notebook";
export type SourceRange = { startLine: number; endLine: number };
export interface Preferences {
  railCollapsed: boolean;
  filesCollapsed: boolean;
  mentorCollapsed: boolean;
  focus: boolean;
  fileWidth: number;
  mentorWidth: number;
}
const defaults: Preferences = {
  railCollapsed: true,
  filesCollapsed: false,
  mentorCollapsed: false,
  focus: false,
  fileWidth: 220,
  mentorWidth: 360,
};
const views: WorkspaceView[] = ["overview", "explore", "learn", "progress", "notebook"];
export function useWorkspace(snapshotId: string) {
  const [view, setView] = useState<WorkspaceView>("overview");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [recommendedFileId, setRecommendedFileId] = useState("");
  const [map, setMap] = useState<ModuleMap | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [tasks, setTasks] = useState<PublicTask[]>([]);
  const [document, setDocument] = useState<SourceDocument | null>(null);
  const [range, setRange] = useState<SourceRange | null>(null);
  const [guideId, setGuideId] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [visited, setVisited] = useState<string[]>([]);
  const [tab, setTab] = useState<"source" | "map">("source");
  const [depth, setDepth] = useState<"beginner" | "developer">("beginner");
  const [progress, setProgress] = useState<Results | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [loading, setLoading] = useState(true);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasOpenedWorkspace, setHasOpenedWorkspace] = useState(false);
  const sourceRequest = useRef(0);
  const progressRequest = useRef(0);
  const hydrated = useRef(false);
  const versions = useRef("");
  const positionSaves = useRef(Promise.resolve());
  const positionRequest = useRef(0);
  const positionGeneration = useRef(0);
  const positionController = useRef<AbortController | null>(null);
  const activeGuide = guides.find((g) => g.id === guideId) || guides[0];
  const activeStep = activeGuide?.steps[stepIndex];
  const navigate = useCallback((next: WorkspaceView) => {
    setView(next);
    if (next === "learn" || next === "explore") setHasOpenedWorkspace(true);
    const url = new URL(window.location.href);
    if (url.searchParams.get("view") !== next) {
      url.searchParams.set("view", next);
      window.history.pushState({ view: next }, "", url);
    }
  }, []);
  const refreshProgress = useCallback(async () => {
    const id = ++progressRequest.current;
    try {
      const result = await api<Results>("/api/results?snapshotId=" + encodeURIComponent(snapshotId));
      if (id === progressRequest.current) setProgress(result);
    } catch (e) {
      if (id === progressRequest.current) setError((e as Error).message);
    }
  }, [snapshotId]);
  const openFile = useCallback(
    async (fileId: string, selection?: SourceRange, showSource = true) => {
      const id = ++sourceRequest.current;
      setSourceLoading(true);
      setError("");
      try {
        const source = await api<SourceDocument>(
          "/api/repository/source?" + new URLSearchParams({ fileId, snapshotId }),
        );
        if (id !== sourceRequest.current) return;
        if (source.file.snapshotId !== snapshotId) throw new Error("This source belongs to a different snapshot.");
        setDocument(source);
        setRange(
          selection
            ? { startLine: selection.startLine, endLine: selection.endLine }
            : null,
        );
        if (showSource) setTab("source");
      } catch (e) {
        if (id === sourceRequest.current) setError((e as Error).message);
      } finally {
        if (id === sourceRequest.current) setSourceLoading(false);
      }
    },
    [snapshotId],
  );
  const openEvidence = useCallback(
    async (evidenceId: string) => {
      const id = ++sourceRequest.current;
      setSourceLoading(true);
      setError("");
      try {
        const evidence = await api<Evidence>(
          "/api/evidence/" + encodeURIComponent(evidenceId) + "?snapshotId=" + encodeURIComponent(snapshotId),
        );
        if (id !== sourceRequest.current) return;
        if (evidence.snapshotId !== snapshotId) throw new Error("This reference belongs to a different snapshot.");
        await openFile(evidence.fileId, {
          startLine: evidence.startLine,
          endLine: evidence.endLine,
        });
      } catch (e) {
        if (id === sourceRequest.current) {
          setSourceLoading(false);
          setError((e as Error).message);
        }
      }
    },
    [openFile, snapshotId],
  );
  useEffect(() => {
    let live = true;
    hydrated.current = false;
    positionGeneration.current++;
    positionController.current = new AbortController();
    try {
      const p = JSON.parse(
        localStorage.getItem("astrolabe:preferences") || "null",
      );
      if (p && typeof p === "object")
        setPreferences({
          railCollapsed:
            typeof p.railCollapsed === "boolean"
              ? p.railCollapsed
              : defaults.railCollapsed,
          filesCollapsed:
            typeof p.filesCollapsed === "boolean" ? p.filesCollapsed : false,
          mentorCollapsed:
            typeof p.mentorCollapsed === "boolean" ? p.mentorCollapsed : false,
          focus: typeof p.focus === "boolean" ? p.focus : false,
          fileWidth: Math.max(180, Math.min(320, Number(p.fileWidth) || 220)),
          mentorWidth: Math.max(
            300,
            Math.min(480, Number(p.mentorWidth) || 360),
          ),
        });
    } catch {
      /* Missing or stale preferences use defaults. */
    }
    Promise.all([
      api<{ snapshot: Snapshot; files: SourceFile[] }>("/api/repository?snapshotId=" + encodeURIComponent(snapshotId)),
      api<ModuleMap>("/api/repository/map?snapshotId=" + encodeURIComponent(snapshotId)),
      api<{ guides: Guide[]; tasks: PublicTask[] }>("/api/guides?snapshotId=" + encodeURIComponent(snapshotId)),
      api<{progress: {payload: {snapshotId: string; guideId: string; stepId: string}} | null}>("/api/progress?snapshotId=" + encodeURIComponent(snapshotId)).catch(() => { if (live) setError("Saved walkthrough position could not be loaded. This device’s saved position is still available."); return {progress: null}; }),
    ])
      .then(async ([repo, modules, learning, position]) => {
        if (!live) return;
        if (repo.snapshot.snapshotId !== snapshotId || learning.guides.some(guide => guide.snapshotId !== snapshotId) || learning.tasks.some(task => task.snapshotId !== snapshotId)) throw new Error("The loaded learning content belongs to a different snapshot.");
        versions.current = JSON.stringify(learning.tasks.map(task => [task.id, task.contentVersion]).sort());
        const firstEvidenceId = learning.guides[0]?.steps[0]?.evidenceIds[0];
        const startingEvidence = firstEvidenceId ? await api<Evidence>("/api/evidence/" + encodeURIComponent(firstEvidenceId) + "?snapshotId=" + encodeURIComponent(snapshotId)) : null;
        if (!live) return;
        const startingFile = repo.files.find(file => file.fileId === startingEvidence?.fileId) || repo.files[0];
        setRecommendedFileId(startingFile?.fileId || "");
        setSnapshot(repo.snapshot);
        setFiles(repo.files);
        setMap(modules);
        setGuides(learning.guides);
        setTasks(learning.tasks);
        let saved: Record<string, unknown> = {};
        try {
          const value = JSON.parse(
            localStorage.getItem(
              "astrolabe:workspace:" + repo.snapshot.snapshotId,
            ) || "{}",
          );
          if (value && typeof value === "object") saved = value;
        } catch {
          /* Invalid saved state is ignored. */
        }
        if (saved.contentVersions && saved.contentVersions !== versions.current) {
          delete saved.guideId; delete saved.stepIndex; delete saved.activeTaskId; delete saved.visited;
        }
        const serverPosition = position.progress?.payload;
        const serverGuide = serverPosition?.snapshotId === snapshotId ? learning.guides.find(g => g.id === serverPosition.guideId) : undefined;
        const guide = learning.guides.find((g) => g.id === saved.guideId) || serverGuide || learning.guides[0];
        if (!guide || !repo.files.length) throw new Error("No learning content or source files are available in this snapshot.");
        const serverStep = serverGuide?.id === guide.id ? guide.steps.findIndex(step => step.id === serverPosition?.stepId) : 0;
        const step =
          Number.isInteger(saved.stepIndex) &&
          Number(saved.stepIndex) >= 0 &&
          Number(saved.stepIndex) < guide.steps.length
            ? Number(saved.stepIndex)
            : Math.max(0, serverStep);
        setGuideId(guide.id);
        setStepIndex(step);
        setActiveTaskId(
          typeof saved.activeTaskId === "string" &&
            guide.steps[step]?.taskId === saved.activeTaskId
            ? saved.activeTaskId
            : null,
        );
        const validSteps = new Set(
          learning.guides.flatMap((g) => g.steps.map((s) => g.id + ":" + s.id)),
        );
        setVisited(
          Array.isArray(saved.visited)
            ? saved.visited.filter(
                (v): v is string => typeof v === "string" && validSteps.has(v),
              )
            : [],
        );
        if (saved.depth === "developer") setDepth("developer");
        if (saved.tab === "map") setTab("map");
        const requested = new URL(window.location.href).searchParams.get(
          "view",
        );
        const restored = views.includes(requested as WorkspaceView)
          ? (requested as WorkspaceView)
          : views.includes(saved.view as WorkspaceView)
            ? (saved.view as WorkspaceView)
            : "overview";
        setView(restored);
        if (restored === "explore" || restored === "learn")
          setHasOpenedWorkspace(true);
        const file =
          repo.files.find((f) => f.fileId === saved.fileId) ||
          startingFile;
        const candidate = saved.range as SourceRange | undefined;
        const selection =
          candidate &&
          Number.isInteger(candidate.startLine) &&
          Number.isInteger(candidate.endLine) &&
          candidate.startLine > 0 &&
          candidate.endLine >= candidate.startLine &&
          candidate.endLine <= file.lineCount
            ? candidate
            : undefined;
        void openFile(file.fileId, selection, false);
        hydrated.current = true;
        void refreshProgress();
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    const pop = () => {
      const value = new URL(window.location.href).searchParams.get("view");
      const next = views.includes(value as WorkspaceView)
        ? (value as WorkspaceView)
        : "overview";
      setView(next);
      if (next === "explore" || next === "learn") setHasOpenedWorkspace(true);
    };
    window.addEventListener("popstate", pop);
    return () => {
      live = false; hydrated.current = false;
      sourceRequest.current++; progressRequest.current++; positionRequest.current++;
      positionGeneration.current++; positionController.current?.abort();
      window.removeEventListener("popstate", pop);
    };
  }, [openFile, refreshProgress, snapshotId]);
  useEffect(() => {
    if (!hydrated.current || !snapshot || !document) return;
    try {
      localStorage.setItem(
        "astrolabe:workspace:" + snapshot.snapshotId,
        JSON.stringify({
          view,
          contentVersions: versions.current,
          fileId: document.file.fileId,
          range,
          guideId,
          stepIndex,
          activeTaskId,
          visited,
          depth,
          tab,
        }),
      );
      localStorage.setItem(
        "astrolabe:preferences",
        JSON.stringify(preferences),
      );
    } catch {
      /* Private browsing or full storage does not block the app. */
    }
  }, [
    snapshot,
    document,
    view,
    range,
    guideId,
    stepIndex,
    activeTaskId,
    visited,
    depth,
    tab,
    preferences,
  ]);
  function savePosition(guide: Guide, index: number) {
    const request = ++positionRequest.current;
    const generation = positionGeneration.current;
    const signal = positionController.current?.signal;
    const payload = { snapshotId, guideId: guide.id, stepId: guide.steps[index].id };
    positionSaves.current = positionSaves.current.catch(() => {}).then(async () => {
      if (generation !== positionGeneration.current || request !== positionRequest.current || signal?.aborted) return;
      try { await api("/api/progress", { method: "POST", body: JSON.stringify(payload), signal }); }
      catch (reason) { if (request === positionRequest.current) setError((reason as Error).message); }
    });
  }
  function visit(guide: Guide, index: number) {
    savePosition(guide, index);
    const key = guide.id + ":" + guide.steps[index].id;
    setVisited((current) =>
      current.includes(key) ? current : [...current, key],
    );
  }
  function selectGuide(id: string, index = 0) {
    const guide = guides.find((g) => g.id === id);
    if (!guide) return;
    const next = Math.min(Math.max(index, 0), guide.steps.length - 1);
    setGuideId(id);
    setStepIndex(next);
    setActiveTaskId(null);
    visit(guide, next);
    navigate("learn");
    void openEvidence(guide.steps[next].evidenceIds[0]);
  }
  function stepTo(index: number) {
    if (activeGuide) selectGuide(activeGuide.id, index);
  }
  function continueLearning() {
    if (!activeGuide) return;
    navigate("learn");
    visit(activeGuide, stepIndex);
    const task = tasks.find((t) => t.id === activeTaskId);
    void openEvidence(task?.contextEvidenceIds[0] || activeStep.evidenceIds[0]);
  }
  function openCheckpoint(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const guide = guides.find((g) => g.id === task.guideId)!;
    const index = guide.steps.findIndex((s) => s.taskId === id);
    setGuideId(guide.id);
    setStepIndex(Math.max(index, 0));
    setActiveTaskId(id);
    visit(guide, Math.max(index, 0));
    navigate("learn");
    void openEvidence(task.contextEvidenceIds[0]);
  }
  function continueFromCheckpoint() {
    setActiveTaskId(null);
    if (stepIndex < activeGuide.steps.length - 1) stepTo(stepIndex + 1);
    else {
      const next = guides[guides.findIndex((g) => g.id === activeGuide.id) + 1];
      if (next) selectGuide(next.id);
      else navigate("progress");
    }
  }
  function nextStep() {
    if (stepIndex < activeGuide.steps.length - 1) stepTo(stepIndex + 1);
    else {
      const next = guides[guides.findIndex((g) => g.id === activeGuide.id) + 1];
      if (next) selectGuide(next.id);
      else navigate("progress");
    }
  }
  function updatePreference<K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) {
    setPreferences((p) => ({ ...p, [key]: value }));
  }

  return {
    view,
    navigate,
    snapshot,
    files,
    recommendedFileId,
    map,
    guides,
    tasks,
    document,
    range,
    setRange,
    guideId,
    stepIndex,
    activeGuide,
    activeStep,
    activeTaskId,
    visited,
    tab,
    setTab,
    depth,
    setDepth,
    progress,
    refreshProgress,
    preferences,
    updatePreference,
    loading,
    sourceLoading,
    error,
    setError,
    hasOpenedWorkspace,
    openFile,
    openEvidence,
    selectGuide,
    stepTo,
    continueLearning,
    openCheckpoint,
    continueFromCheckpoint,
    nextStep,
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;
