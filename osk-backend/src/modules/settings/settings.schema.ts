import { z } from 'zod';
import { THEME_NAMES } from './settings.model';

const contactPatchSchema = z
  .object({
    email: z.string().email().max(140),
    phoneTel: z.string().min(4).max(40),
    phoneDisplay: z.string().min(4).max(40),
    addressLine1: z.string().min(2).max(140),
    addressCity: z.string().min(2).max(80),
    addressRegion: z.string().min(2).max(80),
    addressPostalCode: z.string().min(2).max(20),
    addressCountry: z.string().min(2).max(80),
  })
  .partial();

export const settingsPatchSchema = z
  .object({
    activeTheme: z.enum(THEME_NAMES),
    companyName: z.string().min(1).max(80),
    logoUrl: z.string().max(500),
    contact: contactPatchSchema,
  })
  .partial();

export type SettingsPatchInput = z.infer<typeof settingsPatchSchema>;
