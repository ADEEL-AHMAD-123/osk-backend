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

/**
 * Optional URLs that drive the "Get the OSK App" poster. Each accepts an
 * empty string (used to clear an existing value) or a valid URL — the
 * frontend hides the poster when every field is empty.
 */
const urlOrEmpty = z.union([z.literal(''), z.string().url().max(500)]);

const appLinksPatchSchema = z
  .object({
    appStoreUrl: urlOrEmpty,
    googlePlayUrl: urlOrEmpty,
    appQrUrl: urlOrEmpty,
  })
  .partial();

/**
 * Geographic scope patch. Country list is normalised to uppercase ISO-2
 * codes and de-duplicated; the resolver below rejects anything that
 * isn't 2 characters so junk like 'usa' or 'United States' can't slip
 * through.
 */
const geoPatchSchema = z
  .object({
    mode: z.enum(['all', 'restricted']),
    allowedCountries: z
      .array(
        z
          .string()
          .length(2)
          .transform((s) => s.toUpperCase()),
      )
      .max(250)
      .transform((arr) => Array.from(new Set(arr))),
  })
  .partial();

/**
 * Trust-strip stats. We accept exactly four entries (matches the home
 * layout). Each entry has a short display value + label; empty strings
 * are allowed so the admin can hide a slot if they want fewer than 4.
 */
const statPatchSchema = z.object({
  value: z.string().max(24),
  label: z.string().max(40),
});
const homeStatsPatchSchema = z.array(statPatchSchema).length(4);

/**
 * Legal-page markdown. We cap each blob at 50 KB — generous for full
 * policies but enough to stop accidental DB blowups. updatedAt is a
 * free-form ISO date string so the admin can backdate if needed.
 */
const legalPatchSchema = z
  .object({
    privacyMarkdown: z.string().max(50_000),
    termsMarkdown: z.string().max(50_000),
    privacyUpdatedAt: z.string().max(40),
    termsUpdatedAt: z.string().max(40),
  })
  .partial();

export const settingsPatchSchema = z
  .object({
    activeTheme: z.enum(THEME_NAMES),
    siteTitle: z.string().min(1).max(120),
    companyName: z.string().min(1).max(80),
    logoUrl: z.string().max(500),
    contact: contactPatchSchema,
    appLinks: appLinksPatchSchema,
    geo: geoPatchSchema,
    homeStats: homeStatsPatchSchema,
    legal: legalPatchSchema,
  })
  .partial();

export type SettingsPatchInput = z.infer<typeof settingsPatchSchema>;
