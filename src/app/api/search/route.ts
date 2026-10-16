import { jsonError } from '@/lib/api';
import { searchSource } from '@/lib/search';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  try {
    return Response.json(searchSource(Object.fromEntries(new URL(request.url).searchParams)), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return jsonError(error); }
}
