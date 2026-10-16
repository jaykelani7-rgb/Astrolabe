import { clearSession } from '@/lib/learning';
import { sessionResponse } from '@/lib/learning/session';
import { jsonError } from '@/lib/api';
export const runtime = 'nodejs';
export function POST(request: Request) { try { return sessionResponse(request, clearSession); } catch (error) { return jsonError(error); } }
