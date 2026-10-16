import { jsonError } from "@/lib/api";
import { getSnapshot, listFiles } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request?: Request): Response {
  try {
    const id = request
      ? (new URL(request.url).searchParams.get("snapshotId") ?? undefined)
      : undefined;
    return Response.json({ snapshot: getSnapshot(id), files: listFiles(id) });
  } catch (error) {
    return jsonError(error);
  }
}
