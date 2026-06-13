import { logger } from '../../config/logger';
import { getEmailProvider } from './EmailProvider';
import { emailSettingsService } from '../../modules/email/emailSettings.service';
import { renderEmailTemplate } from './emailTemplates';
import { getBrandingContext } from './brandingContext';
import { resolveAppBaseUrl } from './appBaseUrl';

/* ──────────────────────────────────────────────────────────────────────
 * Event-driven transactional emails.
 *
 *  - Welcome (post-signup)
 *  - Subscription activated
 *  - Subscription cancelled
 *  - Property approved
 *  - Property rejected (with reason)
 *
 * Every helper picks the admin's current template at send time via
 * EmailSettings — so switching the look from /admin/email takes
 * effect on the next email without a restart.
 *
 * All helpers are fire-and-forget: failures log but never throw, so
 * a flaky delivery never breaks the parent flow (subscribe, review,
 * etc.).
 * ────────────────────────────────────────────────────────────────────── */

const APP_NAME = 'OSK';

/**
 * Common params every event-driven email helper accepts. The two
 * origin fields drive the `resolveAppBaseUrl` priority: current
 * request first, then the recipient's stored last origin, then env.
 */
interface OriginParams {
  requestOrigin?: string | null;
  userOrigin?: string | null;
}

function appUrl(opts: OriginParams): string {
  return resolveAppBaseUrl(opts);
}

function firstName(full: string): string {
  return full.split(/\s+/)[0] || 'there';
}

/** Escape user-controlled text so it can't break the HTML body. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fire(opts: {
  to: string;
  subject: string;
  title: string;
  body: string;
  buttonHref: string;
  buttonLabel: string;
  logKey: string;
}): Promise<void> {
  try {
    /* Pull the active template + the live branding (From identity +
     * site contact info) in parallel so the footer matches whatever
     * the admin saved in /admin/email and /admin/settings. */
    const [secrets, branding] = await Promise.all([
      emailSettingsService.getProviderSecrets(),
      getBrandingContext(),
    ]);
    const { html, text } = renderEmailTemplate(
      secrets.activeTemplate,
      {
        title: opts.title,
        body: opts.body,
        buttonHref: opts.buttonHref,
        buttonLabel: opts.buttonLabel,
      },
      branding,
    );
    const provider = await getEmailProvider();
    await provider.send({
      to: opts.to,
      subject: opts.subject,
      html,
      text,
    });
  } catch (err) {
    logger.error({ err, to: opts.to, kind: opts.logKey }, `${opts.logKey} send failed`);
  }
}

/* ─── welcome ─────────────────────────────────────────────────────── */

export interface WelcomeEmailParams extends OriginParams {
  to: string;
  name: string;
}

export async function sendWelcomeEmail({
  to,
  name,
  requestOrigin,
  userOrigin,
}: WelcomeEmailParams): Promise<void> {
  const first = firstName(name);
  await fire({
    to,
    subject: `Welcome to ${APP_NAME}, ${first}`,
    title: `Welcome to ${APP_NAME}`,
    body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Hi ${escapeHtml(
      first,
    )} — your account is ready. Browse, save listings, send inquiries to owners and agents, or list your own property if you're selling. We&rsquo;re glad you&rsquo;re here.</p>`,
    buttonHref: `${appUrl({ requestOrigin, userOrigin })}/dashboard`,
    buttonLabel: 'Open your dashboard',
    logKey: 'welcome-email',
  });
}

/* ─── subscription ────────────────────────────────────────────────── */

export interface SubscriptionEmailParams extends OriginParams {
  to: string;
  name: string;
  planName: string;
  amount?: number;
  currency?: string;
  periodEnd?: Date | null;
}

export async function sendSubscriptionActivatedEmail({
  to,
  name,
  planName,
  amount,
  currency,
  periodEnd,
  requestOrigin,
  userOrigin,
}: SubscriptionEmailParams): Promise<void> {
  const first = firstName(name);
  const priceLine =
    amount && currency
      ? `<p style="margin:0 0 14px;font-size:14px;">You'll be charged <strong>${amount.toLocaleString(
          'en-US',
        )} ${escapeHtml(currency)}</strong>${
          periodEnd
            ? ` and your next renewal is on <strong>${periodEnd.toLocaleDateString(
                'en-US',
                { dateStyle: 'medium' },
              )}</strong>`
            : ''
        }.</p>`
      : '';
  await fire({
    to,
    subject: `Your ${escapeHtml(planName)} plan is active`,
    title: `${escapeHtml(planName)} plan activated`,
    body:
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Hi ${escapeHtml(
        first,
      )} — your subscription to <strong>${escapeHtml(planName)}</strong> is live. You can start using every feature on your tier right away.</p>` +
      priceLine,
    buttonHref: `${appUrl({ requestOrigin, userOrigin })}/dashboard/subscription`,
    buttonLabel: 'Manage subscription',
    logKey: 'subscription-activated-email',
  });
}

export async function sendSubscriptionCancelledEmail({
  to,
  name,
  planName,
  periodEnd,
  requestOrigin,
  userOrigin,
}: Omit<SubscriptionEmailParams, 'amount' | 'currency'>): Promise<void> {
  const first = firstName(name);
  const accessLine = periodEnd
    ? `<p style="margin:0 0 14px;font-size:14px;">You&rsquo;ll keep access to <strong>${escapeHtml(
        planName,
      )}</strong> until <strong>${periodEnd.toLocaleDateString('en-US', {
        dateStyle: 'medium',
      })}</strong>, then the account drops back to the free tier.</p>`
    : `<p style="margin:0 0 14px;font-size:14px;">Your account is now back on the free tier.</p>`;
  await fire({
    to,
    subject: `Your ${escapeHtml(planName)} subscription is cancelled`,
    title: `Subscription cancelled`,
    body:
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Hi ${escapeHtml(
        first,
      )} — we&rsquo;ve cancelled your <strong>${escapeHtml(
        planName,
      )}</strong> plan as requested.</p>` + accessLine,
    buttonHref: `${appUrl({ requestOrigin, userOrigin })}/pricing`,
    buttonLabel: 'See plans again',
    logKey: 'subscription-cancelled-email',
  });
}

/* ─── property moderation ────────────────────────────────────────── */

export interface PropertyEmailParams extends OriginParams {
  to: string;
  name: string;
  propertyTitle: string;
  propertySlug: string;
}

export async function sendPropertyApprovedEmail({
  to,
  name,
  propertyTitle,
  propertySlug,
  requestOrigin,
  userOrigin,
}: PropertyEmailParams): Promise<void> {
  const first = firstName(name);
  await fire({
    to,
    subject: `Approved: ${propertyTitle}`,
    title: `Your listing is live`,
    body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Hi ${escapeHtml(
      first,
    )} — your listing <strong>${escapeHtml(
      propertyTitle,
    )}</strong> has been approved and is now visible to buyers. Share the link below or jump into your dashboard to see views and inquiries roll in.</p>`,
    buttonHref: `${appUrl({ requestOrigin, userOrigin })}/property/${encodeURIComponent(propertySlug)}`,
    buttonLabel: 'View your live listing',
    logKey: 'property-approved-email',
  });
}

export interface PropertyRejectedEmailParams extends PropertyEmailParams {
  /** Free-text reason captured by the admin. Empty string is allowed
   *  (legacy data) but the form enforces non-empty in practice. */
  reason: string;
}

/* ─── preview rendering ───────────────────────────────────────────── */

/**
 * The set of email types the admin can preview from /admin/email.
 * Stays in sync with the actual send-helpers above — every helper
 * has a sample entry here so the operator sees what each event
 * actually looks like.
 */
export const PREVIEWABLE_EMAIL_TYPES = [
  'welcome',
  'verify',
  'reset-password',
  'subscription-activated',
  'subscription-cancelled',
  'property-approved',
  'property-rejected',
] as const;
export type PreviewableEmailType = (typeof PREVIEWABLE_EMAIL_TYPES)[number];

export const PREVIEW_TYPE_LABELS: Record<PreviewableEmailType, string> = {
  welcome: 'Welcome (post-signup)',
  verify: 'Verify email',
  'reset-password': 'Password reset',
  'subscription-activated': 'Subscription activated',
  'subscription-cancelled': 'Subscription cancelled',
  'property-approved': 'Property approved',
  'property-rejected': 'Property rejected',
};


export async function sendPropertyRejectedEmail({
  to,
  name,
  propertyTitle,
  propertySlug,
  reason,
  requestOrigin,
  userOrigin,
}: PropertyRejectedEmailParams): Promise<void> {
  const first = firstName(name);
  const reasonBlock = reason
    ? `<p style="margin:0 0 12px;font-size:14px;">Here&rsquo;s what our team flagged:</p>
       <p style="margin:0 0 16px;padding:14px 16px;background:#f7e7e6;border-left:4px solid #b91c1c;border-radius:6px;font-size:14px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(
         reason,
       )}</p>`
    : `<p style="margin:0 0 16px;font-size:14px;">Please review the submission for missing or inaccurate details, then resubmit.</p>`;
  await fire({
    to,
    subject: `Action needed: ${propertyTitle}`,
    title: `Your listing needs changes`,
    body:
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Hi ${escapeHtml(
        first,
      )} — we couldn&rsquo;t publish <strong>${escapeHtml(
        propertyTitle,
      )}</strong> this round.</p>` +
      reasonBlock +
      `<p style="margin:0 0 16px;font-size:14px;">Edit the listing, then click <em>Submit for review</em> again. We aim to re-check within one business day.</p>`,
    buttonHref: `${appUrl({ requestOrigin, userOrigin })}/dashboard/listings/${encodeURIComponent(
      propertySlug,
    )}/edit`,
    buttonLabel: 'Edit listing',
    logKey: 'property-rejected-email',
  });
}
