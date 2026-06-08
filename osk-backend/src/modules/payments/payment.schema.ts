import { z } from 'zod';

/** Body for POST /payments/:id/proof — the URL of an uploaded
 *  screenshot the seller is submitting as proof of a bank transfer. */
export const attachProofSchema = z.object({
  url: z.string().url().max(2000),
});
export type AttachProofInput = z.infer<typeof attachProofSchema>;
