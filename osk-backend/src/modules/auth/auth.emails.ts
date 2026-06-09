import { logger } from '../../config/logger';
import { getEmailProvider } from '../../shared/email/EmailProvider';
import { emailSettingsService } from '../email/emailSettings.service';
import { renderEmailTemplate } from '../../shared/email/emailTemplates';

/* ──────────────────────────────────────────────────────────────────────
 * Templated transactional emails for the auth flow. The active template
 * is pulled from the admin email settings at send time, so switching
 * templates in /admin/email takes effect immediately.
 * Failures are logged but never thrown — a delivery hiccup must not break
 * registration or password recovery.
 * ────────────────────────────────────────────────────────────────────── */

const APP_NAME = 'OSK';

function appUrl(): string {
  return (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(
    /\/+$/,
    '',
  );
}

export interface VerifyEmailParams {
  to: string;
  name: string;
  token: string;
}

export async function sendVerifyEmail({ to, name, token }: VerifyEmailParams): Promise<void> {
  const url = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const first = name.split(/\s+/)[0] || 'there';
  const secrets = await emailSettingsService.getProviderSecrets();
  const { html, text } = renderEmailTemplate(secrets.activeTemplate, {
    title: `Confirm your ${APP_NAME} email`,
    body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Hi ${first} — welcome to ${APP_NAME}. Tap the button below to verify your email and unlock saved listings, inquiries and messaging.</p>`,
    buttonHref: url,
    buttonLabel: 'Verify email',
  });
  try {
    const provider = await getEmailProvider();
    await provider.send({
      to,
      subject: `Confirm your ${APP_NAME} email`,
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
}

export async function sendPasswordResetEmail({
  to,
  name,
  token,
}: PasswordResetEmailParams): Promise<void> {
  const url = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const first = name.split(/\s+/)[0] || 'there';
  const secrets = await emailSettingsService.getProviderSecrets();
  const { html, text } = renderEmailTemplate(secrets.activeTemplate, {
    title: `Reset your ${APP_NAME} password`,
    body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Hi ${first} — you (or someone using your email) asked to reset your ${APP_NAME} password. Use the button below within the next hour.</p>
           <p style="margin:0;font-size:13px;">If you didn&rsquo;t request this, ignore this email and your password stays the same.</p>`,
    buttonHref: url,
    buttonLabel: 'Reset password',
  });
  try {
    const provider = await getEmailProvider();
    await provider.send({
      to,
      subject: `Reset your ${APP_NAME} password`,
      html,
      text,
    });
  } catch (err) {
    logger.error({ err, to }, 'password reset email send failed');
  }
}
