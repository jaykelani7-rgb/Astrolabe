import { getTask } from '@/lib/learning';
import { jsonError } from '@/lib/api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) { try { return Response.json(getTask((await context.params).id), { headers: { 'Cache-Control': 'no-store' } }); } catch (error) { return jsonError(error); } }
