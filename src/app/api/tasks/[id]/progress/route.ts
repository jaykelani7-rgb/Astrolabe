import { taskSessionProgress } from '@/lib/learning';
import { sessionResponse } from '@/lib/learning/session';
import { jsonError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await context.params;
    return sessionResponse(request, (sessionId) => taskSessionProgress(sessionId, id));
  } catch (error) { return jsonError(error); }
}
