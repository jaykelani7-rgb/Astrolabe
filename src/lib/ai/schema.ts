import { z } from "zod";
const blockSchema = z
  .object({
    text: z.string().trim().min(1).max(3000),
    kind: z.enum(["observed", "inferred", "unknown"]),
    evidenceIds: z.array(z.string().min(1).max(200)).max(8),
  })
  .strict()
  .refine(
    (block) =>
      block.kind === "unknown"
        ? block.evidenceIds.length === 0
        : block.evidenceIds.length > 0,
    {
      message:
        "Source claims require evidence; unknown statements must not imply source support.",
    },
  );
export const modelAnswerSchema = z
  .object({
    status: z.enum(["answered", "evidence_gap"]),
    blocks: z.array(blockSchema).min(1).max(8),
    limitations: z.array(z.string().trim().min(1).max(500)).max(6),
  })
  .strict()
  .refine(
    (value) =>
      value.status === "answered"
        ? value.blocks.some((block) => block.kind !== "unknown")
        : value.blocks.every((block) => block.kind === "unknown"),
    { message: "An evidence gap cannot contain unsupported factual claims." },
  );
export type ModelAnswer = z.infer<typeof modelAnswerSchema>;
export const modelJsonSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["answered", "evidence_gap"] },
    blocks: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          kind: { type: "string", enum: ["observed", "inferred", "unknown"] },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
        required: ["text", "kind", "evidenceIds"],
        additionalProperties: false,
      },
    },
    limitations: { type: "array", items: { type: "string" } },
  },
  required: ["status", "blocks", "limitations"],
  additionalProperties: false,
};
