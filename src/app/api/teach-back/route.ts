import { jsonError, readJson } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { sessionResponse } from "@/lib/learning/session";
import { submitTeachBack, teachBackSchema, teachBackProgress, teachBackProgressSchema } from "@/lib/learning/teach-back";
export async function POST(request: Request) {
  try {
    const input = await readJson(request, teachBackSchema);
    return sessionResponse(request, (id) => submitTeachBack(id, input));
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  try {
    const input = teachBackProgressSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return sessionResponse(request, id => teachBackProgress(id, input));
  } catch (error) {
    return jsonError(error);
  }
}
