import { publicLearning } from "@/lib/learning";
import { jsonError } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request?: Request) {
  try {
    return Response.json(
      publicLearning(
        request
          ? (new URL(request.url).searchParams.get("snapshotId") ?? undefined)
          : undefined,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
