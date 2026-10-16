import { z } from 'zod';

export const modelAnswerSchema = z.object({
  status: z.enum(['answered', 'evidence_gap']),
  answer: z.string().trim().min(1).max(6000),
  citationIds: z.array(z.string().min(1).max(200)).max(8),
  limitations: z.array(z.string().trim().min(1).max(500)).max(6),
}).strict();
export type ModelAnswer = z.infer<typeof modelAnswerSchema>;

export const modelJsonSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['answered', 'evidence_gap'] },
    answer: { type: 'string' },
    citationIds: { type: 'array', items: { type: 'string' } },
    limitations: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'answer', 'citationIds', 'limitations'],
  additionalProperties: false,
};
