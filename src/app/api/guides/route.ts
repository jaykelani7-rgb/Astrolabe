import { publicLearning } from '@/lib/learning';
import { jsonError } from '@/lib/api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET() { try { return Response.json(publicLearning(), { headers: { 'Cache-Control': 'no-store' } }); } catch (error) { return jsonError(error); } }
