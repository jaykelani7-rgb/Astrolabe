import { jsonError, readJson } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { getSession } from "@/lib/learning/session";
import { exportNotebook } from "@/lib/workspace";
export function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams,
      session = getSession(request);
    const response = new Response(
      exportNotebook(
        session.id,
        query.get("snapshotId") ?? undefined,
        query.get("againstSnapshotId") ?? undefined,
      ),
      {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": "attachment; filename=astrolabe-notebook.md",
          "Cache-Control": "no-store",
        },
      },
    );
    if (session.cookie) response.headers.set("Set-Cookie", session.cookie);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
