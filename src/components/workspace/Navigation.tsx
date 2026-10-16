"use client";
import {
  BookOpen,
  Compass,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Trophy,
  X,
  Menu,
  GitCommitHorizontal,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Workspace, WorkspaceView } from "@/lib/client/workspace";
const items: { id: WorkspaceView; label: string; icon: typeof Compass }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "explore", label: "Explore", icon: Compass },
  { id: "learn", label: "Learn", icon: BookOpen },
  { id: "progress", label: "My progress", icon: Trophy },
];
export function Navigation({
  workspace: w,
  mobileOpen,
  onClose,
}: {
  workspace: Workspace;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <aside
        className={`navigation-rail ${w.preferences.railCollapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-open" : ""}`}
        aria-label="Main navigation"
      >
        <a
          className="astrolabe-brand"
          href="?view=overview"
          onClick={(e) => {
            e.preventDefault();
            w.navigate("overview");
            onClose();
          }}
          aria-label="Astrolabe home"
        >
          <span className="brand-symbol">
            <Compass size={24} />
          </span>
          <span className="brand-wordmark">
            Astrolabe<small>Your codebase mentor</small>
          </span>
        </a>
        <button
          className="rail-toggle icon-button"
          aria-label={
            w.preferences.railCollapsed
              ? "Expand navigation"
              : "Collapse navigation"
          }
          aria-expanded={!w.preferences.railCollapsed}
          onClick={() =>
            w.updatePreference("railCollapsed", !w.preferences.railCollapsed)
          }
        >
          {w.preferences.railCollapsed ? (
            <PanelLeftOpen size={18} />
          ) : (
            <PanelLeftClose size={18} />
          )}
        </button>
        <button
          className="mobile-close icon-button"
          onClick={onClose}
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
        <nav>
          {items.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`navigation-item ${w.view === id ? "active" : ""}`}
              onClick={() => {
                if (id === "learn") w.continueLearning();
                else w.navigate(id);
                onClose();
              }}
              title={label}
              aria-current={w.view === id ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-footer">
          <ShieldCheck size={17} />
          <span>
            Pinned source
            <br />
            <small>Read. Predict. Verify.</small>
          </span>
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="navigation-scrim"
          aria-label="Close navigation drawer"
          onClick={onClose}
        />
      )}
    </>
  );
}
export function RepositoryHeader({
  workspace: w,
  onMenu,
}: {
  workspace: Workspace;
  onMenu: () => void;
}) {
  const [status, setStatus] = useState<{
    provider?: string;
    liveConfigured: boolean;
    liveStatus: string;
  } | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/questions/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (live && data) setStatus(data);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const name =
    w.snapshot?.repositoryUrl.replace("https://github.com/", "") ||
    "Loading repository";
  return (
    <header className="repository-header">
      <button
        className="mobile-menu icon-button"
        onClick={onMenu}
        aria-label="Open navigation"
      >
        <Menu size={21} />
      </button>
      <div className="header-product-name">
        Astrolabe<small>Your codebase mentor</small>
      </div>
      <div className="header-repository">
        <span className="repository-monogram">
          {w.snapshot?.name.charAt(0) || "A"}
        </span>
        <div>
          <span className="header-overline">PREPARED REPOSITORY</span>
          <strong>{name}</strong>
        </div>
      </div>
      {w.snapshot && (
        <a
          className="header-commit"
          href={`${w.snapshot.repositoryUrl}/tree/${w.snapshot.commitSha}`}
          target="_blank"
          rel="noreferrer"
          title={w.snapshot.commitSha}
        >
          <GitCommitHorizontal size={15} />
          <code>{w.snapshot.commitSha.slice(0, 7)}</code>
          <ExternalLink size={12} />
        </a>
      )}
      <div className="answer-mode">
        <span className="mode-dot" />
        <span>
          Prepared answers
          <small>
            {status
              ? status.liveConfigured
                ? status.provider === "lmstudio" ? "Local AI configured · unverified" : "Live AI configured · unverified"
                : "Live AI not configured"
              : "Live AI availability unverified"}
          </small>
        </span>
        <details className="mode-details">
          <summary aria-label="About answer availability">?</summary>
          <div>
            Prepared answers and learning material work locally.{" "}
            {status?.liveConfigured
              ? status.provider === "lmstudio" ? "The local model endpoint is configured. Service availability has not been checked here." : "A key is configured, but provider availability has not been verified."
              : "Live questions need a configured local model or server-side Gemini key."}{" "}
            Every response identifies its mode.
          </div>
        </details>
      </div>
    </header>
  );
}
