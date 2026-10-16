import { jsonError, readJson } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { sessionResponse } from "@/lib/learning/session";
import { contributionPlan } from "@/lib/workspace";
import { learningGoalSchema } from "@/contracts";
export function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const goal = query.has("goal")
      ? learningGoalSchema.parse(query.get("goal"))
      : undefined;
    return sessionResponse(request, (id) =>
      contributionPlan(id, query.get("snapshotId") ?? undefined, goal),
    );
  } catch (error) {
    return jsonError(error);
  }
}
