"use client";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  FileCode2,
  Target,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Evidence } from "@/contracts";
import type { Workspace } from "@/lib/client/workspace";
import { api } from "@/lib/client/api";
export function GuidePanel({ workspace: w }: { workspace: Workspace }) {
  const [references, setReferences] = useState<Evidence[]>([]);
  const step = w.activeStep;
  const guide = w.activeGuide;
  useEffect(() => {
    let active = true;
    setReferences([]);
    Promise.all(
      step.evidenceIds.map((id) =>
        api<Evidence>("/api/evidence/" + encodeURIComponent(id)),
      ),
    )
      .then((values) => {
        if (active) setReferences(values);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [step]);
  const solved =
    step.taskId &&
    w.progress?.tasks.find((t) => t.taskId === step.taskId)?.completed;
  return (
    <section className="guide-panel" aria-label="Current walkthrough step">
      <div className="panel-eyebrow">
        <BookOpen size={16} />
        REVIEWED WALKTHROUGH
      </div>
      <div className="guide-position">
        Step {w.stepIndex + 1} of {guide.steps.length}
        <span>
          {w.visited.filter((id) => id.startsWith(guide.id + ":")).length}{" "}
          visited
        </span>
      </div>
      <h2>{step.title}</h2>
      <p className="guide-explanation">{step[w.depth]}</p>
      <div className="guide-evidence">
        {step.evidenceIds.map((id, index) => {
          const evidence = references.find((e) => e.evidenceId === id);
          const file = w.files.find((f) => f.fileId === evidence?.fileId);
          return (
            <button
              className="evidence-link"
              key={id}
              onClick={() => void w.openEvidence(id)}
            >
              <FileCode2 size={15} />
              {file
                ? `${file.path} · lines ${evidence!.startLine}–${evidence!.endLine}`
                : `Inspect source ${index + 1}`}
            </button>
          );
        })}
      </div>
      {step.taskId && (
        <button
          className="checkpoint-launch"
          onClick={() => w.openCheckpoint(step.taskId!)}
        >
          <Target size={21} />
          <span>
            <strong>
              {solved ? "Revisit this prediction" : "Make a prediction"}
            </strong>
            <small>
              {solved
                ? "Your saved feedback is available."
                : "Try it before revealing the explanation."}
            </small>
          </span>
          <ArrowRight size={17} />
        </button>
      )}
      <div className="guide-navigation">
        <button
          className="secondary-button"
          disabled={w.stepIndex === 0}
          onClick={() => w.stepTo(w.stepIndex - 1)}
        >
          <ArrowLeft size={15} />
          Previous
        </button>
        <button className="secondary-button" onClick={w.nextStep}>
          {w.stepIndex < guide.steps.length - 1
            ? "Next step"
            : w.guides.findIndex((g) => g.id === guide.id) < w.guides.length - 1
              ? "Next walkthrough"
              : "Review progress"}
          <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}
