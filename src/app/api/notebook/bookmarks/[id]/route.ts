import { jsonError, readJson } from '@/lib/api';
import { sessionResponse } from '@/lib/learning/session';
import { bookmarkEditSchema, bookmarkSnapshotSchema, readBookmark, editBookmark, removeBookmark } from '@/lib/workspace';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { snapshotId } = bookmarkSnapshotSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { id } = await context.params;
    return sessionResponse(request, session => readBookmark(session, snapshotId, id));
  } catch (error) { return jsonError(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const input = await readJson(request, bookmarkEditSchema);
    const { id } = await context.params;
    return sessionResponse(request, session => editBookmark(session, id, input));
  } catch (error) { return jsonError(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const { snapshotId } = bookmarkSnapshotSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { id } = await context.params;
    return sessionResponse(request, session => removeBookmark(session, snapshotId, id));
  } catch (error) { return jsonError(error); }
}
