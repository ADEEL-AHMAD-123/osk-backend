import { settingsService } from '../../modules/settings/settings.service';
import { emailSettingsService } from '../../modules/email/emailSettings.service';
import { logger } from '../../config/logger';
import type { BrandingContext } from './emailTemplates';

/**
 * Build the branding strings every email template needs from the live
 * settings — not from hardcoded constants — so the From identity and
 * company contact info the admin saved in the dashboard appear in
 * every transactional email and in the preview pane.
 *
 *  - `appName`         comes from EmailSettings.fromName, falling back
 *                      to SiteSettings.companyName so even an admin
 *                      who hasn't touched /admin/email still gets a
 *                      reasonable header.
 *  - `supportEmail`    is the From address (sender) — that's what
 *                      replies are routed to, so it's the right thing
 *                      to surface in the footer.
 *  - `supportPhone`    is the public-facing display number from
 *                      SiteSettings.contact.phoneDisplay.
 *  - `companyAddress`  is the single-line postal address composed
 *                      from the structured address fields.
 *
 * Each piece is independently resilient: if SiteSettings hasn't been
 * seeded yet (rare race on a fresh deploy) the helper falls back to
 * empty strings, and the template's `footerLine` simply skips lines
 * it has no data for.
 */
export async function getBrandingContext(): Promise<BrandingContext> {
  /* Settle both reads in parallel — they're independent Mongo lookups
   * and the template renderer needs both before it can build the
   * footer. */
  const [emailSettings, siteSettings] = await Promise.all([
    emailSettingsService.getSettings().catch(() => null),
    settingsService.get().catch(() => null),
  ]);

  const appName =
    emailSettings?.fromName?.trim() ||
    siteSettings?.companyName?.trim() ||
    'OSK';

  /* The footer's email link is the *public support* address — what
   * users should reach out to. That's the contact email the admin
   * edits in /admin/settings → Contact, not the From address (which
   * is a sender identity and usually a no-reply mailbox). Fall back
   * to the From address only if the contact field is empty. */
  const supportEmail =
    siteSettings?.contact?.email?.trim() ||
    emailSettings?.fromAddress?.trim() ||
    '';

  const supportPhone = siteSettings?.contact?.phoneDisplay?.trim() || '';

  const companyAddress = composeAddress(siteSettings?.contact);

  /* DEBUG: surface what we actually resolved at send time so an
   * operator who claims "I updated contact email but the footer
   * still shows old" can confirm whether the DB actually has the
   * new value. Grep your Railway logs for "branding resolved". */
  logger.debug(
    {
      appName,
      supportEmail,
      supportPhone,
      companyAddress,
      siteContactEmail: siteSettings?.contact?.email,
      emailFromAddress: emailSettings?.fromAddress,
    },
    'branding resolved',
  );

  return { appName, supportEmail, supportPhone, companyAddress };
}

/** Compose a single-line postal address from the structured fields.
 *  Skips blank parts so a partially-configured contact block (e.g.
 *  just city + country) still renders cleanly. */
function composeAddress(
  contact:
    | {
        addressLine1?: string;
        addressCity?: string;
        addressRegion?: string;
        addressPostalCode?: string;
        addressCountry?: string;
      }
    | null
    | undefined,
): string {
  if (!contact) return '';
  const cityRegion = [contact.addressCity, contact.addressRegion]
    .filter((s) => s && s.trim())
    .join(', ');
  const postalCountry = [contact.addressPostalCode, contact.addressCountry]
    .filter((s) => s && s.trim())
    .join(' · ');
  const parts = [
    contact.addressLine1?.trim() || '',
    cityRegion,
    postalCountry,
  ].filter(Boolean);
  return parts.join(' · ');
}
