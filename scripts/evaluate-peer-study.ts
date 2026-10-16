import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
const row = z
  .object({
    participantId: z.string().min(1).max(100),
    familiarity: z.enum(["none", "some"]),
    condition: z.enum(["browsing", "mentor"]),
    order: z.number().int().min(1).max(2),
    taskVariant: z.string().min(1),
    snapshotId: z.string().min(1),
    elapsedSeconds: z.number().positive(),
    correct: z.boolean(),
    hints: z.number().int().nonnegative(),
    evidenceFound: z.boolean(),
    explanationScore: z.number().min(0).max(3),
  })
  .strict();
const schema = z
  .object({
    rubricVersion: z.string().min(1),
    reviewer: z.string().min(1),
    trials: z.array(row).min(2),
  })
  .strict();
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
try {
  const input = process.argv[2],
    output = process.argv[3];
  if (!input || !output)
    throw new Error("Usage: npm run evaluate:peers -- input.json output.json");
  const data = schema.parse(JSON.parse(readFileSync(input, "utf8")));
  const ids = [...new Set(data.trials.map((trial) => trial.participantId))];
  if (new Set(data.trials.map((trial) => trial.snapshotId)).size !== 1)
    throw new Error("Use one pinned snapshot for the study.");
  for (const id of ids) {
    const pair = data.trials.filter((trial) => trial.participantId === id);
    if (
      pair.length !== 2 ||
      new Set(pair.map((trial) => trial.condition)).size !== 2 ||
      new Set(pair.map((trial) => trial.taskVariant)).size !== 2 ||
      new Set(pair.map((trial) => trial.order)).size !== 2
    )
      throw new Error(
        "Each participant needs two conditions, different task variants and unique order.",
      );
  }
  const summary = ["browsing", "mentor"].map((condition) => {
    const rows = data.trials.filter((trial) => trial.condition === condition);
    return {
      condition,
      trials: rows.length,
      medianSeconds: median(rows.map((row) => row.elapsedSeconds)),
      correct: rows.filter((row) => row.correct).length,
      accuracy: rows.filter((row) => row.correct).length / rows.length,
      medianExplanationScore: median(rows.map((row) => row.explanationScore)),
      totalHints: rows.reduce((sum, row) => sum + row.hints, 0),
    };
  });
  const report = {
    participants: ids.length,
    rubricVersion: data.rubricVersion,
    reviewer: data.reviewer,
    summary,
    trials: data.trials,
    limitations: [
      "Small observational pilot; task matching and counterbalancing must be checked by the reviewer.",
      "No population-level or causal improvement claim follows from these summaries.",
      ...(ids.length < 6
        ? ["Fewer than six participants: planned sample not reached."]
        : []),
      ...(["browsing", "mentor"].some(
        (condition) =>
          !data.trials.some(
            (row) => row.order === 1 && row.condition === condition,
          ),
      )
        ? ["Order is not counterbalanced."]
        : []),
    ],
  };
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ output, participants: ids.length, summary }));
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Study evaluation failed",
  );
  process.exitCode = 1;
}
