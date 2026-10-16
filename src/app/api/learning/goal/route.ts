import { jsonError, readJson } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { sessionResponse } from "@/lib/learning/session";
import { goalInput, setGoal, getGoal } from "@/lib/workspace";
import { getSnapshot } from "@/lib/repository";
export function GET(request: Request) {
  try {
    const snapshot = getSnapshot(
      new URL(request.url).searchParams.get("snapshotId") ?? undefined,
    );
    return sessionResponse(request, (id) => ({
      snapshotId: snapshot.snapshotId,
      goal: getGoal(id, snapshot.snapshotId) ?? null,
    }));
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const input = await readJson(request, goalInput);
    return sessionResponse(request, (id) =>
      setGoal(id, input.snapshotId, input.goal),
    );
  } catch (error) {
    return jsonError(error);
  }
}
