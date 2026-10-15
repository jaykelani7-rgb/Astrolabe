import { questionSchema } from '@/contracts';
import { answerQuestion } from '@/lib/ai';
import { jsonError, readJson } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const input = await readJson(request, questionSchema, 4096);
    return Response.json(await answerQuestion(input), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return jsonError(error); }
}
