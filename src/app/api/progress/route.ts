import { jsonError, readJson } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { sessionResponse } from "@/lib/learning/session";
import { progressSchema, saveProgress } from "@/lib/workspace";
import { getRecords } from "@/lib/db";
import { getSnapshot } from "@/lib/repository";
export function GET(request: Request) {
  try {
    const snapshot = getSnapshot(
      new URL(request.url).searchParams.get("snapshotId") ?? undefined,
    );
    return sessionResponse(request, (id) => ({
      progress: getRecords(id, snapshot.snapshotId, "progress").at(-1) ?? null,
    }));
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const input = await readJson(request, progressSchema);
    return sessionResponse(request, (id) => saveProgress(id, input));
  } catch (error) {
    return jsonError(error);
  }
}
