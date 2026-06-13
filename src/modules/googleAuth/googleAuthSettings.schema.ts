import { z } from 'zod';

export const updateGoogleAuthSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  clientId: z.string().trim().max(200).optional(),
  /** Plain-text on the way in; encrypted at rest by the service. */
  clientSecret: z.string().max(4000).optional(),
});

export type UpdateGoogleAuthSettingsInput = z.infer<
  typeof updateGoogleAuthSettingsSchema
>;
