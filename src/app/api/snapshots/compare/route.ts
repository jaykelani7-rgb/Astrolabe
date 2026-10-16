import { jsonError, readJson } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";
import { compareSnapshots } from "@/lib/snapshots";
const schema = z
  .object({
    fromSnapshotId: z.string().min(1).max(120),
    toSnapshotId: z.string().min(1).max(120),
  })
  .strict();
export async function POST(request: Request) {
  try {
    const input = await readJson(request, schema);
    return Response.json(
      compareSnapshots(input.fromSnapshotId, input.toSnapshotId),
    );
  } catch (error) {
    return jsonError(error);
  }
}
