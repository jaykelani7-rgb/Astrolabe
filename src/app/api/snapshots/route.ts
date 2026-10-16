import { jsonError, readJson } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { listSnapshots } from "@/lib/repository";
export function GET() {
  try {
    return Response.json({ snapshots: listSnapshots() });
  } catch (error) {
    return jsonError(error);
  }
}
