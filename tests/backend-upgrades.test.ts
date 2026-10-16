import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import {
  getDb,
  getAttempts,
  getRecords,
  saveAttempt,
  recordHint,
  getHintCount,
  legacyContext,
  resetSession,
} from "@/lib/db";
import {
  getSnapshot,
  listSnapshots,
  listFiles,
  getSource,
  getEvidence,
  evidenceForRange,
} from "@/lib/repository";
import {
  retrieveContext,
  repositoryForSnapshot,
  MAX_CONTEXT_CHARACTERS,
} from "@/lib/retrieval";
import { questionSchema } from "@/contracts";
import { answerQuestion } from "@/lib/ai";
import { architectureOverview } from "@/lib/architecture";
import { compareSnapshots } from "@/lib/snapshots";
import { getTask, publicLearning, submitAttempt } from "@/lib/learning";
import { submitTeachBack, reviewTeachBack, teachBackProgress } from "@/lib/learning/teach-back";
import {
  storeAnswer,
  answerHistory,
  bookmark,
  exportNotebook,
  setGoal,
  contributionPlan,
  saveProgress,
} from "@/lib/workspace";
import { POST as questionRoute } from "@/app/api/questions/route";
import { GET as historyRoute } from "@/app/api/questions/history/route";
import { GET as notebookRoute } from "@/app/api/notebook/route";
import { GET as teachBackRoute } from "@/app/api/teach-back/route";
import { getSession } from "@/lib/learning/session";
import { GET as taskRoute } from "@/app/api/tasks/[id]/route";
const dir = mkdtempSync(path.join(tmpdir(), "astrolabe-upgrades-"));
const mittOld = "mitt-f9a0b5397edf",
  mittNew = "mitt-05f4ce67e8f1";
const oldEnv = {
  db: process.env.MENTOR_DB_PATH,
  secret: process.env.MENTOR_SESSION_SECRET,
};
beforeAll(() => {
  process.env.MENTOR_DB_PATH = path.join(dir, "test.sqlite");
  process.env.MENTOR_SESSION_SECRET =
    "upgrades-test-long-enough-session-secret";
});
afterAll(() => {
  getDb().close();
  if (oldEnv.db === undefined) delete process.env.MENTOR_DB_PATH;
  else process.env.MENTOR_DB_PATH = oldEnv.db;
  if (oldEnv.secret === undefined) delete process.env.MENTOR_SESSION_SECRET;
  else process.env.MENTOR_SESSION_SECRET = oldEnv.secret;
  rmSync(dir, { recursive: true, force: true });
});
const input = () => ({
  snapshotId: getSnapshot().snapshotId,
  question:
    "How do useStore and useSyncExternalStore connect to createStore and subscribe?",
  depth: "developer" as const,
});
const sourceFile = () =>
  listFiles().find((file) => file.path === "src/vanilla.ts")!;

describe("explicit source scope and claim evidence", () => {
  it("retrieves both modules in repository scope despite an open vanilla file", () => {
    const context = retrieveContext({
      ...input(),
      fileId: sourceFile().fileId,
      scope: "repository",
    });
    const paths = context.evidence.map((e) => getSource(e.fileId).file.path);
    expect(paths).toContain("src/react.ts");
    expect(paths).toContain("src/vanilla.ts");
    expect(
      context.evidence.reduce((sum, e) => sum + e.text.length, 0),
    ).toBeLessThanOrEqual(MAX_CONTEXT_CHARACTERS);
  });
  it("keeps file and selection scopes strict, and validates required selection fields", () => {
    const fileId = sourceFile().fileId;
    expect(
      retrieveContext({ ...input(), fileId, scope: "file" }).evidence.every(
        (e) => e.fileId === fileId,
      ),
    ).toBe(true);
    const c = retrieveContext({
      ...input(),
      fileId,
      scope: "selection",
      startLine: 75,
      endLine: 78,
    });
    expect(c.evidence).toHaveLength(1);
    expect(c.evidence[0]).toMatchObject({ startLine: 75, endLine: 78 });
    expect(
      questionSchema.safeParse({ ...input(), scope: "selection", fileId })
        .success,
    ).toBe(false);
  });
  it("does not allow prepared cross-file answers to bypass an explicit file scope", async () => {
    const response = await answerQuestion(
      {
        ...input(),
        question: "What is getInitialState?",
        fileId: sourceFile().fileId,
        scope: "file",
      },
      {
        provider: async () => ({
          status: "evidence_gap",
          blocks: [
            {
              text: "Additional source is required.",
              kind: "unknown",
              evidenceIds: [],
            },
          ],
          limitations: [],
        }),
      },
    );
    expect(response.mode).toBe("live");
  });
  it("keeps citations on individual blocks, preserving the legacy response fields", async () => {
    const result = await answerQuestion(input(), {
      prepared: false,
      useCache: false,
      provider: async ({ evidence }) => ({
        status: "answered",
        blocks: [
          {
            text: "The supplied source contains the store connection.",
            kind: "observed",
            evidenceIds: [evidence[0].evidenceId],
          },
          {
            text: "Historical maintainer intent is unknown.",
            kind: "unknown",
            evidenceIds: [],
          },
        ],
        limitations: [],
      }),
    });
    expect(result.status).toBe("answered");
    expect(result.reviewState).toBe("generated");
    expect(result.blocks).toHaveLength(2);
    expect(result.answer).toContain("Historical");
    expect(result.citations).toHaveLength(1);
  });
  it("rejects one unsupported claim even when another block has a valid citation", async () => {
    const result = await answerQuestion(input(), {
      prepared: false,
      provider: async ({ evidence }) => ({
        status: "answered",
        blocks: [
          {
            text: "Source observation.",
            kind: "observed",
            evidenceIds: [evidence[0].evidenceId],
          },
          { text: "Uncited inference.", kind: "inferred", evidenceIds: [] },
        ],
        limitations: [],
      }),
    });
    expect(result.status).toBe("evidence_gap");
    expect(result.citations).toEqual([]);
  });
  it("rejects invented IDs and factual claims hidden under evidence-gap status", async () => {
    for (const value of [
      {
        status: "answered",
        blocks: [
          {
            text: "An invented reference.",
            kind: "observed",
            evidenceIds: ["invented"],
          },
        ],
        limitations: [],
      },
      {
        status: "evidence_gap",
        blocks: [
          {
            text: "An unsupported factual claim.",
            kind: "observed",
            evidenceIds: ["invented"],
          },
        ],
        limitations: [],
      },
    ])
      expect(
        (
          await answerQuestion(input(), {
            prepared: false,
            provider: async () => value,
          })
        ).status,
      ).toBe("evidence_gap");
  });
});

describe("multiple real snapshots and authored architecture", () => {
  it("loads distinct pinned repositories and keeps evidence isolated", () => {
    expect(listSnapshots()).toHaveLength(3);
    const other = repositoryForSnapshot(mittNew);
    const file = other.listFiles()[0];
    expect(other.getSnapshot().name).toBe("developit/mitt");
    const evidence = other.evidenceForRange(file.fileId, 1, 6);
    expect(other.getEvidence(evidence.evidenceId)).toEqual(evidence);
    expect(() => getSource(file.fileId)).toThrow();
    expect(() =>
      getEvidence(evidence.evidenceId, getSnapshot().snapshotId),
    ).toThrow();
  });
  it("indexes and queries the second repository without returning Zustand evidence", () => {
    const context = retrieveContext({
      snapshotId: mittNew,
      question: "How are wildcard handlers invoked?",
      scope: "repository",
    });
    expect(context.evidence.length).toBeGreaterThan(0);
    expect(context.evidence.every((e) => e.snapshotId === mittNew)).toBe(true);
  });
  it("provides source-backed responsibilities and reading order for both repositories", () => {
    for (const id of [getSnapshot().snapshotId, mittNew]) {
      const architecture = architectureOverview(id);
      expect(architecture.humanReview).toBe("pending");
      expect(architecture.readingOrder.length).toBeGreaterThan(0);
      for (const module of architecture.modules) {
        expect(module.evidenceIds.length).toBeGreaterThan(0);
        for (const evidenceId of module.evidenceIds)
          expect(getEvidence(evidenceId, id).snapshotId).toBe(id);
      }
    }
  });
  it("provides separate guides and answer keys for the second repository", async () => {
    const learning = publicLearning(mittNew);
    expect(learning.tasks).toHaveLength(2);
    expect(learning.tasks.every((task) => task.snapshotId === mittNew)).toBe(
      true,
    );
    const task = learning.tasks[0];
    const response = await taskRoute(
      new Request(
        `http://localhost/api/tasks/${task.id}?snapshotId=${mittNew}`,
      ),
      { params: Promise.resolve({ id: task.id }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("answer");
    expect(
      submitAttempt(randomUUID(), task.id, {
        snapshotId: mittNew,
        contentVersion: task.contentVersion,
        answer: "specific",
      }).correct,
    ).toBe(true);
  });
  it("marks dependent content stale across actual pinned commits while preserving old references", () => {
    publicLearning(mittOld);
    const before = architectureOverview(mittOld),
      id = before.modules[0].evidenceIds[0],
      original = getEvidence(id, mittOld);
    const comparison = compareSnapshots(mittOld, mittNew);
    expect(comparison.changes).toContainEqual(
      expect.objectContaining({ path: "src/index.ts", kind: "modified" }),
    );
    expect(
      comparison.content.some((content) => content.state === "needs_review"),
    ).toBe(true);
    expect(getEvidence(id, mittOld)).toEqual(original);
    expect(
      compareSnapshots(mittNew, mittNew).content.every(
        (content) => content.state === "current",
      ),
    ).toBe(true);
    expect(() => compareSnapshots(mittNew, getSnapshot().snapshotId)).toThrow(
      /same repository/,
    );
  });
});

describe("versioned learning and honest teach-back", () => {
  it("migrates existing attempts and hints without dropping data", () => {
    const filename = path.join(dir, "legacy.sqlite"),
      db = new DatabaseSync(filename);
    db.exec(
      "CREATE TABLE attempts(id TEXT PRIMARY KEY,session_id TEXT,task_id TEXT,answer_json TEXT,correct INTEGER,attempt_number INTEGER,hints_used INTEGER,created_at TEXT);CREATE TABLE hints(session_id TEXT,task_id TEXT,count INTEGER,PRIMARY KEY(session_id,task_id));INSERT INTO attempts VALUES('old','legacy','task','\"skip\"',1,1,2,'2026-01-01');INSERT INTO hints VALUES('legacy','task',2);",
    );
    db.close();
    const output = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        "const d=require('./src/lib/db/index.ts');console.log(JSON.stringify({attempts:d.getAttempts('legacy'),hints:d.getHintCount('legacy','task')}));",
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, MENTOR_DB_PATH: filename },
        encoding: "utf8",
      },
    );
    const data = JSON.parse(output.trim());
    expect(data.attempts[0]).toMatchObject({
      ...legacyContext,
      answer: "skip",
      correct: true,
    });
    expect(data.hints).toBe(2);
  });
  it("isolates attempts and hints by snapshot and content version", () => {
    const session = randomUUID(),
      a = { snapshotId: mittOld, contentVersion: "one" },
      b = { snapshotId: mittNew, contentVersion: "one" },
      c = { snapshotId: mittOld, contentVersion: "two" };
    for (const context of [a, b, c])
      expect(
        saveAttempt(session, "shared-task", "x", true, 0, context)
          .attemptNumber,
      ).toBe(1);
    recordHint(session, "shared-task", a);
    expect(getHintCount(session, "shared-task", b)).toBe(0);
    expect(getAttempts(session, a)).toHaveLength(1);
    expect(getAttempts(session)).toHaveLength(3);
  });
  it("rejects stale content-version submissions", () => {
    const task = getTask("same-reference");
    expect(() =>
      submitAttempt(randomUUID(), task.id, {
        snapshotId: task.snapshotId,
        contentVersion: "old-version",
        answer: "skip",
      }),
    ).toThrow(/Reload/);
  });
  it("requires an attempt and records free text without claiming automatic understanding", () => {
    const session = randomUUID(),
      task = getTask("same-reference");
    const input = {
      taskId: task.id,
      snapshotId: task.snapshotId,
      contentVersion: task.contentVersion!,
      text: "The identity guard determines whether notification happens.",
    };
    expect(() => submitTeachBack(session, input)).toThrow(/prediction/);
    submitAttempt(session, task.id, {
      snapshotId: task.snapshotId,
      answer: "notify",
    });
    const submission = submitTeachBack(session, input);
    expect(submission.status).toBe("needs_review");
    expect(submission).not.toHaveProperty("score");
    expect(submission.concepts.every((c) => c.state === "unassessed")).toBe(
      true,
    );
  });
  it("different missing concepts produce different evidence-linked follow-ups, with session isolation", () => {
    const session = randomUUID(),
      task = getTask("same-reference");
    submitAttempt(session, task.id, {
      snapshotId: task.snapshotId,
      answer: "notify",
    });
    const submission = submitTeachBack(session, {
      taskId: task.id,
      snapshotId: task.snapshotId,
      contentVersion: task.contentVersion!,
      text: "I need to revisit the equality and listener conditions.",
    });
    const review = (missing: string) =>
      reviewTeachBack(session, {
        snapshotId: task.snapshotId,
        submissionId: submission.id,
        assessments: submission.concepts.map((c) => ({
          conceptId: c.id,
          state: c.id === missing ? "missing" : "understood",
        })),
      });
    const a = review("identity_guard"),
      b = review("guarded_notification");
    expect(a.followUps[0].taskId).not.toBe(b.followUps[0].taskId);
    expect(a.followUps[0].evidenceIds.length).toBeGreaterThan(0);
    expect(b.reviewMethod).toBe("learner_self_assessment");
    expect(() =>
      reviewTeachBack("another-session", {
        snapshotId: task.snapshotId,
        submissionId: submission.id,
        assessments: submission.concepts.map((c) => ({
          conceptId: c.id,
          state: "understood",
        })),
      }),
    ).toThrow(/does not belong/);
  });
  it("resumes only current-version explanations from the signed session, including reviews, and clears them on reset", async () => {
    const task = getTask("same-reference");
    const request = new Request("http://localhost/api/teach-back");
    const session = getSession(request);
    const input = { taskId: task.id, snapshotId: task.snapshotId, contentVersion: task.contentVersion! };
    const url = `http://localhost/api/teach-back?${new URLSearchParams(input)}`;
    submitAttempt(session.id, task.id, { snapshotId: task.snapshotId, answer: "skip" });
    const submission = submitTeachBack(session.id, { ...input, text: "The guard skips the block when the object identity is unchanged." });
    const ownRequest = () => new Request(url, { headers: { cookie: session.cookie!.split(";")[0] } });
    const own = await teachBackRoute(ownRequest());
    expect(own.headers.get("Cache-Control")).toBe("no-store");
    expect(await own.json()).toMatchObject({ available: true, submission: { id: submission.id, snapshotId: task.snapshotId } });
    expect(await (await teachBackRoute(new Request(url))).json()).toMatchObject({ submission: null });
    reviewTeachBack(session.id, { snapshotId: task.snapshotId, submissionId: submission.id, assessments: submission.concepts.map(c => ({ conceptId: c.id, state: "uncertain" })) });
    expect(await (await teachBackRoute(ownRequest())).json()).toMatchObject({ submission: { status: "self_reviewed", followUps: expect.any(Array) } });
    expect((await teachBackRoute(new Request(url.replace(task.contentVersion!, "old-version")))).status).toBe(409);
    const second = submitTeachBack(session.id, { ...input, text: "A revised explanation of the guard and listeners." });
    expect(teachBackProgress(session.id, input).submission?.id).toBe(second.id);
    resetSession(session.id);
    expect(teachBackProgress(session.id, input).submission).toBeNull();
    const unsupported = getTask("update-order");
    expect(teachBackProgress(session.id, { taskId: unsupported.id, snapshotId: unsupported.snapshotId, contentVersion: unsupported.contentVersion! }).available).toBe(false);
    expect(teachBackProgress(session.id, { taskId: "mitt-dispatch-order", snapshotId: mittOld, contentVersion: getTask("mitt-dispatch-order", mittOld).contentVersion! }).submission).toBeNull();
  });
  it("stores goals and recommends prerequisite review before a contribution", () => {
    const session = randomUUID(),
      snapshot = getSnapshot();
    setGoal(session, snapshot.snapshotId, "debug");
    const debug = contributionPlan(session);
    expect(debug.goal).toBe("debug");
    expect(debug.recommendations[0].id).toBe("document-update-edges");
    expect(debug.recommendations[0].status).toBe("review_prerequisites");
    const architecture = contributionPlan(session, undefined, "architecture");
    expect(architecture.recommendations[0].id).toBe("document-hook-bridge");
    expect(
      contributionPlan(session, undefined, "tests").limitations.join(" "),
    ).toContain("not invented");
  });
});

describe("persistent answer context and notebook privacy", () => {
  it("keeps an answer with its original context after source inspection and restart access", async () => {
    const session = randomUUID(),
      context = {
        ...input(),
        question: "How does setState work?",
        fileId: sourceFile().fileId,
      };
    const response = await answerQuestion(context);
    const saved = storeAnswer(session, context, response);
    getSource(listFiles().find((file) => file.path === "src/react.ts")!.fileId);
    const history = answerHistory(session);
    expect(history[0].id).toBe(saved.answerId);
    expect(history[0].payload.context.fileId).toBe(context.fileId);
    expect(history[0].payload.response.answer).toBe(response.answer);
    expect(answerHistory("other-session")).toEqual([]);
  });
  it("exports pinned links, provenance and bookmarks without private answer keys", async () => {
    const session = randomUUID(),
      context = { ...input(), question: "How does setState work?" };
    const saved = storeAnswer(session, context, await answerQuestion(context));
    bookmark(session, {
      snapshotId: context.snapshotId,
      title: "State notes",
      note: "Review identity.",
      answerId: saved.answerId,
    });
    saveProgress(session, {
      snapshotId: context.snapshotId,
      guideId: "state-to-subscribers",
      stepId: "predict-identity",
    });
    const text = exportNotebook(session);
    expect(text).toContain(getSnapshot().commitSha);
    expect(text).toContain("/blob/");
    expect(text).toContain("State notes");
    expect(text).toContain("authored");
    expect(text).toContain("predict-identity");
    expect(text).not.toContain("rubrics");
    expect(() =>
      bookmark("other-session", {
        snapshotId: context.snapshotId,
        title: "Stolen answer",
        answerId: saved.answerId,
      }),
    ).toThrow(/does not belong/);
  });
  it("flags a saved note against a changed snapshot but keeps its old source permalink", () => {
    const session = randomUUID(),
      file = listFiles(mittOld)[0],
      evidence = evidenceForRange(file.fileId, 1, 5, mittOld);
    bookmark(session, {
      snapshotId: mittOld,
      title: "Old emitter",
      note: "Original source.",
      evidenceIds: [evidence.evidenceId],
    });
    const text = exportNotebook(session, mittOld, mittNew);
    expect(text).toContain("needs review");
    expect(text).toContain(getSnapshot(mittOld).commitSha);
    expect(text).toContain(`/blob/${getSnapshot(mittOld).commitSha}/`);
  });
  it("persists questions through the HTTP API with signed private history and Markdown download", async () => {
    const response = await questionRoute(
      new Request("http://localhost/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input(),
          question: "How does setState work?",
        }),
      }),
    );
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!.split(";")[0],
      body = await response.json();
    expect(body.answerId).toBeTruthy();
    const history = historyRoute(
      new Request("http://localhost/api/questions/history", {
        headers: { cookie },
      }),
    );
    expect((await history.json()).answers).toHaveLength(1);
    expect(
      (
        await historyRoute(
          new Request("http://localhost/api/questions/history"),
        ).json()
      ).answers,
    ).toHaveLength(0);
    const notebook = notebookRoute(
      new Request("http://localhost/api/notebook", { headers: { cookie } }),
    );
    expect(notebook.headers.get("content-type")).toContain("text/markdown");
    expect(notebook.headers.get("cache-control")).toBe("no-store");
  });
  it("practice reset preserves saved notebook data and preferences in both sessions", () => {
    const snapshot = getSnapshot().snapshotId,
      session = randomUUID(),
      other = randomUUID();
    setGoal(session, snapshot, "debug");
    setGoal(other, snapshot, "tests");
    resetSession(session);
    expect(getRecords(session, snapshot)).toHaveLength(1);
    expect(getRecords(other, snapshot)).toHaveLength(1);
  });
});
