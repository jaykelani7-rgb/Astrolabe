import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Evidence,
  QuestionInput,
  Snapshot,
  SourceDocument,
} from "@/contracts";
import { questionSchema } from "@/contracts";
import { answerQuestion, clearAnswerCache } from "@/lib/ai";
import {
  createGeminiProvider,
  ProviderUnavailableError,
} from "@/lib/ai/gemini";
import { AppError } from "@/lib/api";
import {
  retrieveContext,
  validateEvidence,
  type EvidenceRepository,
} from "@/lib/retrieval";
import { getSnapshot, getSource, listFiles } from "@/lib/repository";
import { POST as questionRoute } from "@/app/api/questions/route";
import { modelJsonSchema } from "@/lib/ai/schema";

function fixture(snapshotId = "snapshot-a") {
  const snapshot: Snapshot = {
    snapshotId,
    name: "Fixture",
    repositoryUrl: "https://example.com/source",
    commitSha: "a".repeat(40),
    license: "MIT",
    language: "TypeScript",
    preparedAt: "2026-10-15",
    status: "ready",
    description: "A fixture",
  };
  const lines = [
    "const listeners = new Set()",
    "function subscribe(listener) { listeners.add(listener) }",
    "const cleanup = () => listeners.delete(listener)",
  ];
  const source: SourceDocument = {
    file: {
      fileId: "file-a",
      snapshotId,
      path: "src/store.ts",
      language: "TypeScript",
      lineCount: 3,
      contentHash: "hash-a",
    },
    lines,
    content: lines.join("\n"),
  };
  const records = new Map<string, Evidence>();
  const store: EvidenceRepository = {
    getSnapshot: () => snapshot,
    listFiles: () => [source.file],
    getSource(fileId, requestedSnapshot) {
      if (requestedSnapshot && requestedSnapshot !== snapshotId)
        throw new AppError("SNAPSHOT_MISMATCH", "Wrong snapshot", 409);
      if (fileId !== source.file.fileId)
        throw new AppError("FILE_NOT_FOUND", "Missing file", 404);
      return source;
    },
    getEvidence(id) {
      const record = records.get(id);
      if (!record)
        throw new AppError("EVIDENCE_NOT_FOUND", "Missing evidence", 404);
      return record;
    },
    evidenceForRange(fileId, startLine, endLine) {
      this.getSource(fileId);
      if (startLine < 1 || endLine > lines.length || endLine < startLine)
        throw new AppError("INVALID_RANGE", "Bad range");
      const evidence: Evidence = {
        evidenceId: `${snapshotId}:${fileId}:${startLine}:${endLine}`,
        snapshotId,
        fileId,
        startLine,
        endLine,
        contentHash: source.file.contentHash,
        text: lines.slice(startLine - 1, endLine).join("\n"),
      };
      records.set(evidence.evidenceId, evidence);
      return evidence;
    },
    searchEvidence(query) {
      return query
        .toLowerCase()
        .split(" ")
        .some((term) => source.content.toLowerCase().includes(term))
        ? [this.evidenceForRange("file-a", 1, 3)]
        : [];
    },
  };
  return { store, source, snapshot };
}

const input: QuestionInput = {
  question: "Explain subscribe listener cleanup",
  snapshotId: "snapshot-a",
  depth: "beginner",
};
const validProvider = vi.fn(async ({ evidence }: { evidence: Evidence[] }) => ({
  status: "answered",
  blocks: [
    {
      text: "The listener is removed from the Set.",
      kind: "observed",
      evidenceIds: [evidence[0].evidenceId],
    },
  ],
  limitations: [],
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  clearAnswerCache();
  validProvider.mockClear();
});

describe("grounded question answers", () => {
  it("returns canonical, inspectable evidence for a supported answer", async () => {
    const { store } = fixture();
    const result = await answerQuestion(input, {
      repository: store,
      provider: validProvider,
    });
    expect(result.status).toBe("answered");
    expect(result.mode).toBe("live");
    expect(result.citations[0].text).toContain("listeners.delete(listener)");
    expect(result.limitations.join(" ")).toContain("does not prove");
  });

  it("does not call the provider when indexed source has no relevant evidence", async () => {
    const { store } = fixture();
    const result = await answerQuestion(
      { ...input, question: "Which encryption algorithm protects payments?" },
      { repository: store, provider: validProvider },
    );
    expect(result.status).toBe("evidence_gap");
    expect(result.citations).toEqual([]);
    expect(validProvider).not.toHaveBeenCalled();
  });

  it.each([
    {
      status: "answered",
      blocks: [
        { text: "Made up.", kind: "observed", evidenceIds: ["invented"] },
      ],
      limitations: [],
    },
    {
      status: "answered",
      blocks: [{ text: "Unsupported.", kind: "observed", evidenceIds: [] }],
      limitations: [],
    },
    {
      status: "answered",
      blocks: [{ text: "Extra field.", kind: "observed", evidenceIds: [] }],
      limitations: [],
      hidden: "no",
    },
    "not JSON",
  ])("withholds invalid model output or citations: %j", async (output) => {
    const { store } = fixture();
    const result = await answerQuestion(input, {
      repository: store,
      provider: async () => output,
    });
    expect(result.status).toBe("evidence_gap");
    expect(result.citations).toEqual([]);
    expect(result.answer).not.toContain("Made up");
  });

  it("rejects evidence from a different snapshot and a mismatched range", () => {
    const { store } = fixture();
    const evidence = store.evidenceForRange("file-a", 1, 2);
    expect(() =>
      validateEvidence(
        { ...evidence, snapshotId: "other" },
        "snapshot-a",
        store,
      ),
    ).toThrow("could not be verified");
    expect(() =>
      validateEvidence({ ...evidence, endLine: 3 }, "snapshot-a", store),
    ).toThrow("could not be verified");
  });

  it("rejects stale source text even when the evidence ID exists", () => {
    const { store, source } = fixture();
    const evidence = store.evidenceForRange("file-a", 1, 2);
    source.lines[0] = "mutated source";
    expect(() => validateEvidence(evidence, "snapshot-a", store)).toThrow(
      "could not be verified",
    );
  });

  it("fails explicitly for wrong snapshots and invalid source ranges", async () => {
    const { store } = fixture();
    await expect(
      answerQuestion({ ...input, snapshotId: "old" }, { repository: store }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      answerQuestion(
        { ...input, fileId: "file-a", startLine: 1, endLine: 99 },
        { repository: store },
      ),
    ).rejects.toMatchObject({ code: "INVALID_RANGE" });
    expect(questionSchema.safeParse({ ...input, startLine: 2 }).success).toBe(
      false,
    );
    expect(
      questionSchema.safeParse({ ...input, fileId: "../secrets" }).success,
    ).toBe(true);
    await expect(
      answerQuestion({ ...input, fileId: "../secrets" }, { repository: store }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("keeps a declared provider evidence gap unclickable", async () => {
    const { store } = fixture();
    const result = await answerQuestion(input, {
      repository: store,
      provider: async () => ({
        status: "evidence_gap",
        blocks: [
          {
            text: "No evidence for that guarantee.",
            kind: "unknown",
            evidenceIds: [],
          },
        ],
        limitations: ["Runtime behavior was not measured."],
      }),
    });
    expect(result.status).toBe("evidence_gap");
    expect(result.citations).toEqual([]);
  });

  it("clearly reports missing credentials without falling back to an invented answer", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const { store } = fixture();
    const result = await answerQuestion(input, { repository: store });
    expect(result.status).toBe("unavailable");
    expect(result.mode).toBe("live");
    expect(result.answer).toContain("no server-side Gemini credential");
  });

  it("isolates the answer cache by snapshot, selection, depth and question", async () => {
    const { store } = fixture();
    const options = {
      repository: store,
      provider: validProvider,
      useCache: true,
    };
    await answerQuestion(input, options);
    expect((await answerQuestion(input, options)).cached).toBe(true);
    await answerQuestion({ ...input, depth: "developer" }, options);
    await answerQuestion(
      { ...input, fileId: "file-a", startLine: 2, endLine: 3 },
      options,
    );
    await answerQuestion(
      { ...input, question: "Where are listeners added?" },
      options,
    );
    await answerQuestion(
      { ...input, snapshotId: "snapshot-b" },
      { ...options, repository: fixture("snapshot-b").store },
    );
    expect(validProvider).toHaveBeenCalledTimes(5);
  });

  it("does not cache unavailable responses", async () => {
    const { store } = fixture();
    const provider = vi.fn(async () => {
      throw new ProviderUnavailableError("provider_error");
    });
    const options = { repository: store, provider, useCache: true };
    expect((await answerQuestion(input, options)).status).toBe("unavailable");
    await answerQuestion(input, options);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("limits retrieved source without truncating cited source ranges", () => {
    const { store, source } = fixture();
    source.lines[0] = "subscribe ".repeat(1300);
    source.content = source.lines.join("\n");
    const context = retrieveContext(input, store);
    expect(context.evidence).toEqual([]);
    expect(context.limitations.join(" ")).toContain("omitted");
  });
});

describe("Gemini adapter", () => {
  it("keeps the API key in a request header and source inside a data envelope", async () => {
    const { store } = fixture();
    const evidence = [store.evidenceForRange("file-a", 1, 3)];
    const mockFetch = vi.fn(async () =>
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    status: "evidence_gap",
                    blocks: [
                      {
                        text: "Missing evidence.",
                        kind: "unknown",
                        evidenceIds: [],
                      },
                    ],
                    limitations: [],
                  }),
                },
              ],
            },
          },
        ],
      }),
    );
    const provider = createGeminiProvider({
      apiKey: "test-secret",
      fetch: mockFetch as typeof fetch,
    });
    await provider({ input, evidence });
    const [url, request] = mockFetch.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).not.toContain("test-secret");
    expect(request.headers).toMatchObject({ "x-goog-api-key": "test-secret" });
    const body = JSON.parse(request.body as string);
    expect(body.systemInstruction.parts[0].text).toContain("untrusted data");
    expect(JSON.parse(body.contents[0].parts[0].text).evidence[0].text).toBe(
      evidence[0].text,
    );
    expect(body.generationConfig.responseFormat.text.mimeType).toBe(
      "APPLICATION_JSON",
    );
  });

  it("uses the documented Gemini text-format enum while preserving JSON HTTP headers", async () => {
    const { store } = fixture();
    const output = {
      status: "evidence_gap",
      blocks: [{ text: "Not established.", kind: "unknown", evidenceIds: [] }],
      limitations: [],
    };
    const mockFetch = vi.fn(async () => Response.json({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(output) }] } }],
    }));
    const result = await createGeminiProvider({ apiKey: "test-only-key", fetch: mockFetch as typeof fetch })({
      input, evidence: [store.evidenceForRange("file-a", 1, 3)],
    });
    const [url, request] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    // https://ai.google.dev/api/generate-content#TextResponseFormat uses an enum,
    // unlike the HTTP Content-Type header, which remains a MIME string.
    expect(request.method).toBe("POST");
    expect(new Headers(request.headers).get("Content-Type")).toBe("application/json");
    const generation = JSON.parse(request.body as string).generationConfig;
    expect(generation.responseFormat).toMatchObject({
      text: { mimeType: "APPLICATION_JSON", schema: {
        type: modelJsonSchema.type, required: modelJsonSchema.required, additionalProperties: false,
        properties: { blocks: { maxItems: 4, items: { properties: { text: { maxLength: 1400 }, evidenceIds: { items: { enum: [store.evidenceForRange("file-a", 1, 3).evidenceId] } } } } } },
      } },
    });
    expect(generation.maxOutputTokens).toBe(4096);
    expect(generation.thinkingConfig).toEqual({ thinkingLevel: 'LOW', includeThoughts: false });
    expect(url).not.toContain("test-only-key");
    expect(request.body).not.toContain("test-only-key");
    expect(result).toEqual(output);
  });

  it("bounds timeout even when the fetch implementation ignores AbortSignal", async () => {
    vi.useFakeTimers();
    const { store } = fixture();
    const provider = createGeminiProvider({
      apiKey: "test",
      timeoutMs: 50,
      fetch: (() => new Promise(() => {})) as typeof fetch,
    });
    const pending = answerQuestion(input, { repository: store, provider });
    await vi.advanceTimersByTimeAsync(51);
    const result = await pending;
    expect(result.status).toBe("unavailable");
    expect(result.answer).toContain("timed out");
  });

  it.each([
    new Response("service error containing private diagnostics", {
      status: 503,
    }),
    Response.json({
      candidates: [
        { finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } },
      ],
    }),
    new Response("x".repeat(64_001)),
  ])(
    "withholds failed, incomplete and oversized provider responses",
    async (response) => {
      const { store } = fixture();
      const provider = createGeminiProvider({
        apiKey: "test",
        fetch: (async () => response) as typeof fetch,
      });
      const result = await answerQuestion(input, {
        repository: store,
        provider,
      });
      expect(result.status).toBe("unavailable");
      expect(result.answer).not.toContain("private diagnostics");
    },
  );
});

describe("prepared Q&A against the immutable snapshot", () => {
  it.each([
    "How does setState update state?",
    "How do I unsubscribe?",
    "How does useStore use a selector?",
    "What is getInitialState?",
  ])(
    "works without credentials and cites exact source: %s",
    async (question) => {
      vi.stubEnv("GEMINI_API_KEY", "");
      vi.stubEnv("MENTOR_DB_PATH", ":memory:");
      const snapshotId = getSnapshot().snapshotId;
      const result = await answerQuestion({ question, snapshotId });
      expect(result.status).toBe("answered");
      expect(result.mode).toBe("reviewed");
      expect(result.limitations.join(" ")).toContain(
        "human claim review is pending",
      );
      expect(result.citations.length).toBeGreaterThan(0);
      for (const citation of result.citations) {
        const source = getSource(citation.fileId, snapshotId);
        expect(citation.text).toBe(
          source.lines
            .slice(citation.startLine - 1, citation.endLine)
            .join("\n"),
        );
        expect(citation.contentHash).toBe(source.file.contentHash);
      }
    },
  );

  it("keeps prepared answers within a restrictive file and selected source range", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("MENTOR_DB_PATH", ":memory:");
    const file = listFiles().find((entry) => entry.path === "src/react.ts")!;
    const related = await answerQuestion({
      question: "What is getInitialState?",
      snapshotId: file.snapshotId,
      fileId: file.fileId,
      startLine: 26,
      endLine: 37,
    });
    // This authored explanation also needs vanilla.ts, which is outside the selected file.
    expect(related).toMatchObject({
      status: "unavailable",
      mode: "live",
      citations: [],
    });
    const repository = await answerQuestion({
      question: "What is getInitialState?",
      snapshotId: file.snapshotId,
    });
    expect(repository).toMatchObject({ status: "answered", mode: "reviewed" });
    expect(
      repository.citations.map(
        (citation) => getSource(citation.fileId).file.path,
      ),
    ).toEqual(["src/vanilla.ts", "src/react.ts"]);
    const result = await answerQuestion({
      question: "How do I unsubscribe?",
      snapshotId: file.snapshotId,
      fileId: file.fileId,
      startLine: 1,
      endLine: 9,
    });
    expect(result.status).toBe("unavailable");
    expect(result.mode).toBe("live");
  });
});

describe("question HTTP boundary", () => {
  it("serves a prepared answer without enabling intermediary caching", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("MENTOR_DB_PATH", ":memory:");
    const response = await questionRoute(
      new Request("http://localhost/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "How does setState update state?",
          snapshotId: getSnapshot().snapshotId,
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      status: "answered",
      mode: "reviewed",
    });
  });

  it.each([
    { body: "{broken", expected: 400 },
    {
      body: JSON.stringify({ ...input, question: "q".repeat(5000) }),
      expected: 413,
    },
    { body: JSON.stringify({ ...input, snapshotId: "wrong" }), expected: 409 },
  ])(
    "rejects malformed, oversized and wrong-snapshot requests: $expected",
    async ({ body, expected }) => {
      const response = await questionRoute(
        new Request("http://localhost/api/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        }),
      );
      expect(response.status).toBe(expected);
      expect(await response.json()).toHaveProperty("error.code");
    },
  );

  it.each(["missing-file", "invalid-range"])(
    "returns an explicit source error for %s",
    async (kind) => {
      vi.stubEnv("MENTOR_DB_PATH", ":memory:");
      const file = listFiles().find(
        (entry) => entry.path === "src/vanilla.ts",
      )!;
      const context =
        kind === "missing-file"
          ? { fileId: "../unlisted-file" }
          : { fileId: file.fileId, startLine: 1, endLine: file.lineCount + 1 };
      const response = await questionRoute(
        new Request("http://localhost/api/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: "How does setState update state?",
            snapshotId: file.snapshotId,
            ...context,
          }),
        }),
      );
      expect(response.status).toBe(kind === "missing-file" ? 404 : 400);
      expect(await response.json()).toMatchObject({
        error: {
          code: kind === "missing-file" ? "FILE_NOT_FOUND" : "INVALID_RANGE",
        },
      });
    },
  );
});
