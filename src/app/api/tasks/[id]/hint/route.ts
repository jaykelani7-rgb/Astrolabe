import { requestHint } from '@/lib/learning';
import { sessionResponse } from '@/lib/learning/session';
import { jsonError } from '@/lib/api';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return sessionResponse(request, (sessionId) => requestHint(sessionId, id)); } catch (error) { return jsonError(error); }
}
