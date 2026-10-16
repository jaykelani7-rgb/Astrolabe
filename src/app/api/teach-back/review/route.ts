import { jsonError, readJson } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { sessionResponse } from "@/lib/learning/session";
import {
  reviewTeachBack,
  teachBackReviewSchema,
} from "@/lib/learning/teach-back";
export async function POST(request: Request) {
  try {
    const input = await readJson(request, teachBackReviewSchema);
    return sessionResponse(request, (id) => reviewTeachBack(id, input));
  } catch (error) {
    return jsonError(error);
  }
}
