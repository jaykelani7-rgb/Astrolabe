import { sessionResults } from "@/lib/learning";
import { sessionResponse } from "@/lib/learning/session";
import { jsonError } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  try {
    return sessionResponse(request, (id) =>
      sessionResults(
        id,
        new URL(request.url).searchParams.get("snapshotId") ?? undefined,
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}
