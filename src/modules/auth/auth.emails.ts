import { logger } from '../../config/logger';
import { getEmailProvider } from '../../shared/email/EmailProvider';
import { emailSettingsService } from '../email/emailSettings.service';
import { renderEmailTemplate } from '../../shared/email/emailTemplates';
import { getBrandingContext } from '../../shared/email/brandingContext';
import { resolveAppBaseUrl } from '../../shared/email/appBaseUrl';

/* ──────────────────────────────────────────────────────────────────────
 * Templated transactional emails for the auth flow. The active template
 * AND the operator's branding (From identity, support phone, postal
 * address) are pulled from settings at send time, so switching either
 * in the admin dashboard takes effect on the next email — no restart
 * needed.
 *
 * Failures are logged but never thrown — a delivery hiccup must not
 * break registration or password recovery.
 * ────────────────────────────────────────────────────────────────────── */

export interface VerifyEmailParams {
  to: string;
  name: string;
  token: string;
  /** The origin of the request that triggered this send (typically
   *  `req.headers.origin`). Wins over every other source so the
   *  verify link points back to the exact domain the user just
   *  registered on. */
  requestOrigin?: string | null;
  /** Recipient's stored `User.lastOrigin` — fallback for background
   *  flows where no live request is available. */
  userOrigin?: string | null;
}

export async function sendVerifyEmail({
  to,
  name,
  token,
  requestOrigin,
  userOrigin,
}: VerifyEmailParams): Promise<void> {
  const appUrl = resolveAppBaseUrl({ requestOrigin, userOrigin });
  const url = `${appUrl}/verify-email?token=${encodeURIComponent(token)}`;
  const first = name.split(/\s+/)[0] || 'there';
  const [secrets, branding] = await Promise.all([
    emailSettingsService.getProviderSecrets(),
    getBrandingContext(),
  ]);
  const { html, text } = renderEmailTemplate(
    secrets.activeTemplate,
    {
      title: `Confirm your ${branding.appName} email`,
      body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Hi ${first} — welcome to ${branding.appName}. Tap the button below to verify your email and unlock saved listings, inquiries and messaging.</p>`,
      buttonHref: url,
      buttonLabel: 'Verify email',
    },
    branding,
  );
  try {
    const provider = await getEmailProvider();
    await provider.send({
      to,
      subject: `Confirm your ${branding.appName} email`,
      html,
      text,
    });
  } catch (err) {
    logger.error({ err, to }, 'verify email send failed');
  }
}

export interface PasswordResetEmailParams {
  to: string;
  name: string;
  token: string;
  requestOrigin?: string | null;
  userOrigin?: string | null;
}

export async function sendPasswordResetEmail({
  to,
  name,
  token,
  requestOrigin,
  userOrigin,
}: PasswordResetEmailParams): Promise<void> {
  const appUrl = resolveAppBaseUrl({ requestOrigin, userOrigin });
  const url = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const first = name.split(/\s+/)[0] || 'there';
  const [secrets, branding] = await Promise.all([
    emailSettingsService.getProviderSecrets(),
    getBrandingContext(),
  ]);
  const { html, text } = renderEmailTemplate(
    secrets.activeTemplate,
    {
      title: `Reset your ${branding.appName} password`,
      body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Hi ${first} — you (or someone using your email) asked to reset your ${branding.appName} password. Use the button below within the next hour.</p>
             <p style="margin:0;font-size:13px;">If you didn&rsquo;t request this, ignore this email and your password stays the same.</p>`,
      buttonHref: url,
      buttonLabel: 'Reset password',
    },
    branding,
  );
  try {
    const provider = await getEmailProvider();
    await provider.send({
      to,
      subject: `Reset your ${branding.appName} password`,
      html,
      text,
    });
  } catch (err) {
    logger.error({ err, to }, 'password reset email send failed');
  }
}
