import { logger } from '../../config/logger';
import { getEmailProvider } from '../../shared/email/EmailProvider';

/* ──────────────────────────────────────────────────────────────────────
 * Templated transactional emails for the auth flow. Templates render to
 * an HTML string and a plain-text fallback; the EmailProvider abstraction
 * handles the actual delivery (console in dev, SES/SendGrid/etc in prod).
 * Failures are logged but never thrown — a delivery hiccup must not break
 * registration or password recovery.
 * ────────────────────────────────────────────────────────────────────── */

const APP_NAME = 'OSK';
const COMPANY_ADDRESS =
  '101 Catherine Street, 6th Floor · Ottawa, Ontario K2P 2K9 · Canada';
const SUPPORT_EMAIL = 'hello@osk.dev';
const SUPPORT_PHONE = '+1 (365) 955-7829';

function appUrl(): string {
  return (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(
    /\/+$/,
    '',
  );
}

/* Tiny shell so all transactional mail shares the same chrome. Inline
 * styles only — most email clients ignore <style>. */
function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f7f5f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e7e3da;">
    <tr><td style="padding:24px 28px;border-bottom:1px solid #efece5;font-weight:700;letter-spacing:0.14em;font-size:11px;color:#8a7a55;text-transform:uppercase;">${APP_NAME}</td></tr>
    <tr><td style="padding:32px 28px;">
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;letter-spacing:-0.01em;">${title}</h1>
      ${body}
    </td></tr>
    <tr><td style="padding:18px 28px;background:#fafaf6;border-top:1px solid #efece5;font-size:12px;color:#807a6c;line-height:1.6;">
      If you didn&rsquo;t expect this email, you can safely ignore it.<br/>
      <span style="color:#3a3a3a;">${APP_NAME}</span> · ${COMPANY_ADDRESS}<br/>
      <a href="tel:${SUPPORT_PHONE.replace(/\s|\(|\)|-/g, '')}" style="color:#807a6c;text-decoration:none;">${SUPPORT_PHONE}</a> ·
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#807a6c;text-decoration:none;">${SUPPORT_EMAIL}</a>
    </td></tr>
  </table>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#1f2937;color:#ffffff;text-decoration:none;font-weight:600;letter-spacing:0.04em;font-size:14px;">${label}</a>`;
}

export interface VerifyEmailParams {
  to: string;
  name: string;
  token: string;
}

export async function sendVerifyEmail({ to, name, token }: VerifyEmailParams): Promise<void> {
  const url = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const first = name.split(/\s+/)[0] || 'there';
  const html = shell(
    `Confirm your ${APP_NAME} email`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#3a3a3a;">Hi ${first} — welcome to ${APP_NAME}. Tap the button below to verify your email and unlock saved listings, inquiries and messaging.</p>
     <p style="margin:0 0 24px;">${button(url, 'Verify email')}</p>
     <p style="margin:0;font-size:13px;color:#807a6c;">Or paste this URL into your browser:<br/><span style="word-break:break-all;color:#3a3a3a;">${url}</span></p>`,
  );
  const text = `Hi ${first},\n\nWelcome to ${APP_NAME}. Confirm your email:\n${url}\n\nIf you didn't expect this email, ignore it.`;
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
  const html = shell(
    `Reset your ${APP_NAME} password`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#3a3a3a;">Hi ${first} — you (or someone using your email) asked to reset your ${APP_NAME} password. Use the button below within the next hour.</p>
     <p style="margin:0 0 24px;">${button(url, 'Reset password')}</p>
     <p style="margin:0 0 16px;font-size:13px;color:#807a6c;">Or paste this URL into your browser:<br/><span style="word-break:break-all;color:#3a3a3a;">${url}</span></p>
     <p style="margin:0;font-size:13px;color:#807a6c;">If you didn&rsquo;t request this, ignore the email and your password stays the same.</p>`,
  );
  const text = `Hi ${first},\n\nReset your ${APP_NAME} password within the next hour:\n${url}\n\nIf you didn't request this, ignore the email.`;
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
