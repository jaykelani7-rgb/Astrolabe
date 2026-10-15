import { jsonError } from '@/lib/api';
import { getSnapshot, listFiles } from '@/lib/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(): Response {
  try { return Response.json({ snapshot: getSnapshot(), files: listFiles() }); }
  catch (error) { return jsonError(error); }
}
