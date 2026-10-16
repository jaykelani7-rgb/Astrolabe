import { jsonError, readJson } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { questionSchema } from "@/contracts";
import { answerQuestion } from "@/lib/ai";
import { sessionResponseAsync } from "@/lib/learning/session";
import { storeAnswer } from "@/lib/workspace";
export async function POST(request: Request) {
  try {
    const input = await readJson(request, questionSchema, 4096);
    return await sessionResponseAsync(request, async (sessionId) =>
      storeAnswer(sessionId, input, await answerQuestion(input)),
    );
  } catch (error) {
    return jsonError(error);
  }
}
