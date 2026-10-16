import { jsonError, readJson } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { sessionResponse } from "@/lib/learning/session";
import { bookmark, bookmarkSchema, bookmarkListSchema, listBookmarks } from "@/lib/workspace";
export function GET(request: Request) {
  try {
    const input = bookmarkListSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return sessionResponse(request, id => listBookmarks(id, input));
  } catch (error) { return jsonError(error); }
}
export async function POST(request: Request) {
  try {
    const input = await readJson(request, bookmarkSchema, 12000);
    return sessionResponse(request, (id) => bookmark(id, input));
  } catch (error) {
    return jsonError(error);
  }
}
