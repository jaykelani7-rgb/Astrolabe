import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { answerQuestion } from "../src/lib/ai";
import { defaultSnapshotId } from "../src/lib/repository";
async function main() {
  const directory = path.resolve(".data/verification");
  mkdirSync(directory, { recursive: true });
  const output = path.join(
    directory,
    `live-qa-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  if (!process.env.GEMINI_API_KEY?.trim()) {
    writeFileSync(
      output,
      JSON.stringify(
        {
          status: "blocked",
          reason: "missing_server_credential",
          liveRequests: 0,
          preparedMatching: false,
          cache: false,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      JSON.stringify({
        status: "blocked",
        reason: "missing_server_credential",
        liveRequests: 0,
        preparedMatching: false,
        cache: false,
        output,
      }),
    );
    process.exitCode = 2;
    return;
  }
  const questions = [
    "How do useStore and useSyncExternalStore connect to createStore and subscribe?",
    "What happens when a subscriber unsubscribes during notification?",
    "Why did the maintainers historically choose this design?",
    "Where is the PostgreSQL migration engine implemented?",
  ];
  const results = [];
  for (const question of questions) {
    const started = performance.now();
    const response = await answerQuestion(
      {
        question,
        snapshotId: defaultSnapshotId(),
        scope: "repository",
        depth: "developer",
      },
      { prepared: false, useCache: false },
    );
    results.push({
      question,
      latencyMs: Math.round(performance.now() - started),
      response,
      humanClaimReview: "pending",
    });
  }
  writeFileSync(
    output,
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
        preparedMatching: false,
        cache: false,
        results,
        limitations: [
          "A successful request does not establish that every answer is correct. Independently review claims and evidence.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      output,
      requests: results.length,
      answered: results.filter((item) => item.response.status === "answered")
        .length,
      humanClaimReview: "pending",
    }),
  );
  if (!results.some((item) => item.response.status === "answered"))
    process.exitCode = 1;
}
main().catch(() => {
  console.error(
    "Live verification failed before completing. Check server configuration without sharing credentials.",
  );
  process.exitCode = 1;
});
