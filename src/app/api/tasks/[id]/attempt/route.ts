import { attemptSchema } from '@/contracts';
import { submitAttempt } from '@/lib/learning';
import { sessionResponse } from '@/lib/learning/session';
import { jsonError, readJson } from '@/lib/api';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const input = await readJson(request, attemptSchema);
    const { id } = await context.params;
    return sessionResponse(request, (sessionId) => submitAttempt(sessionId, id, input));
  } catch (error) { return jsonError(error); }
}
