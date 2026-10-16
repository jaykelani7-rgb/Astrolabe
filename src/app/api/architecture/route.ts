import { jsonError, readJson } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { architectureOverview } from "@/lib/architecture";
export function GET(request: Request) {
  try {
    return Response.json(
      architectureOverview(
        new URL(request.url).searchParams.get("snapshotId") ?? undefined,
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}
