import { jsonError } from '@/lib/api';
import { getEvidence } from '@/lib/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await context.params;
    const snapshotId = new URL(request.url).searchParams.get('snapshotId') ?? undefined;
    return Response.json(getEvidence(id, snapshotId));
  } catch (error) { return jsonError(error); }
}
