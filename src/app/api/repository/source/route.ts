import { AppError, jsonError } from '@/lib/api';
import { getSource } from '@/lib/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request): Response {
  try {
    const query = new URL(request.url).searchParams;
    const fileId = query.get('fileId');
    if (!fileId) throw new AppError('INVALID_INPUT', 'Choose a repository file.');
    const document = getSource(fileId, query.get('snapshotId') ?? undefined);
    const first = query.get('startLine'); const last = query.get('endLine');
    if ((first === null) !== (last === null)) throw new AppError('INVALID_RANGE', 'Provide both the first and last source line.');
    if (first !== null && last !== null) {
      const start = /^\d+$/.test(first) ? Number(first) : NaN;
      const end = /^\d+$/.test(last) ? Number(last) : NaN;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > document.file.lineCount) throw new AppError('INVALID_RANGE', `Choose lines between 1 and ${document.file.lineCount}.`);
    }
    return Response.json(document);
  } catch (error) { return jsonError(error); }
}
