import { jsonError } from "@/lib/api";
import { getMap } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request?: Request): Response {
  try {
    return Response.json(
      getMap(
        request
          ? (new URL(request.url).searchParams.get("snapshotId") ?? undefined)
          : undefined,
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}
