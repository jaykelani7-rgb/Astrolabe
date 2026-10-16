import { jsonError, readJson } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { sessionResponse } from "@/lib/learning/session";
import { answerHistory } from "@/lib/workspace";
export function GET(request: Request) {
  try {
    const snapshotId =
      new URL(request.url).searchParams.get("snapshotId") ?? undefined;
    return sessionResponse(request, (id) => ({
      answers: answerHistory(id, snapshotId),
    }));
  } catch (error) {
    return jsonError(error);
  }
}
