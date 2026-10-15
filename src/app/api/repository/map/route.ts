import { jsonError } from '@/lib/api';
import { getMap } from '@/lib/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(): Response {
  try { return Response.json(getMap()); }
  catch (error) { return jsonError(error); }
}
