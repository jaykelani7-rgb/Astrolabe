import { jsonError, readJson } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { sessionResponse } from "@/lib/learning/session";
import { bookmark, bookmarkSchema } from "@/lib/workspace";
export async function POST(request: Request) {
  try {
    const input = await readJson(request, bookmarkSchema, 12000);
    return sessionResponse(request, (id) => bookmark(id, input));
  } catch (error) {
    return jsonError(error);
  }
}
