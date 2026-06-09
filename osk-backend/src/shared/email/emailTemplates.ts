import type { EmailTemplateKey } from '../../modules/email/emailSettings.model';

const APP_NAME = 'OSK';
const COMPANY_ADDRESS =
  '101 Catherine Street, 6th Floor · Ottawa, Ontario K2P 2K9 · Canada';
const SUPPORT_EMAIL = 'hello@osk.dev';
const SUPPORT_PHONE = '+1 (365) 955-7829';

/* ─────────────────────────────────────────────────────────────────────
 * 4 email template variants.
 * All use inline CSS only — email clients mostly ignore <style> blocks.
 * ──────────────────────────────────────────────────────────────────── */

/** Warm (default) — ivory/beige, earthy tones, current brand look. */
function warmShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f7f5f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e7e3da;">
    <tr><td style="padding:24px 28px;border-bottom:1px solid #efece5;font-weight:700;letter-spacing:0.14em;font-size:11px;color:#8a7a55;text-transform:uppercase;">${APP_NAME}</td></tr>
    <tr><td style="padding:32px 28px;">
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;letter-spacing:-0.01em;color:#1a1a1a;">${title}</h1>
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

function warmButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#1f2937;color:#ffffff;text-decoration:none;font-weight:600;letter-spacing:0.04em;font-size:14px;">${label}</a>`;
}

/** Clean — white background, subtle borders, modern minimal. */
function cleanShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:32px 16px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr><td style="padding:20px 32px;border-bottom:1px solid #f0f0f0;">
      <span style="font-size:17px;font-weight:700;color:#18181b;letter-spacing:-0.02em;">${APP_NAME}</span>
    </td></tr>
    <tr><td style="padding:36px 32px;">
      <h1 style="margin:0 0 14px;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#09090b;">${title}</h1>
      ${body}
    </td></tr>
    <tr><td style="padding:20px 32px;background:#fafafa;border-top:1px solid #f0f0f0;font-size:12px;color:#71717a;line-height:1.7;">
      ${APP_NAME} · ${COMPANY_ADDRESS}<br/>
      <a href="tel:${SUPPORT_PHONE.replace(/\s|\(|\)|-/g, '')}" style="color:#71717a;text-decoration:none;">${SUPPORT_PHONE}</a> ·
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#71717a;text-decoration:none;">${SUPPORT_EMAIL}</a>
    </td></tr>
  </table>
</body></html>`;
}

function cleanButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:11px 22px;border-radius:8px;background:#18181b;color:#fafafa;text-decoration:none;font-weight:600;font-size:14px;">${label}</a>`;
}

/** Dark — dark background throughout, great for night-mode inboxes. */
function darkShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e5e5e5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#171717;border-radius:14px;overflow:hidden;border:1px solid #262626;">
    <tr><td style="padding:24px 28px;border-bottom:1px solid #262626;font-weight:700;letter-spacing:0.14em;font-size:11px;color:#a3a3a3;text-transform:uppercase;">${APP_NAME}</td></tr>
    <tr><td style="padding:32px 28px;">
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;letter-spacing:-0.01em;color:#fafafa;">${title}</h1>
      ${body}
    </td></tr>
    <tr><td style="padding:18px 28px;background:#0f0f0f;border-top:1px solid #262626;font-size:12px;color:#737373;line-height:1.6;">
      If you didn&rsquo;t expect this email, you can safely ignore it.<br/>
      <span style="color:#d4d4d4;">${APP_NAME}</span> · ${COMPANY_ADDRESS}<br/>
      <a href="tel:${SUPPORT_PHONE.replace(/\s|\(|\)|-/g, '')}" style="color:#737373;text-decoration:none;">${SUPPORT_PHONE}</a> ·
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#737373;text-decoration:none;">${SUPPORT_EMAIL}</a>
    </td></tr>
  </table>
</body></html>`;
}

function darkButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#f5f5f5;color:#0a0a0a;text-decoration:none;font-weight:700;letter-spacing:0.03em;font-size:14px;">${label}</a>`;
}

/** Brand — accent-colour gradient header, vibrant call-to-action. */
function brandShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr><td style="padding:26px 28px;background:linear-gradient(135deg,#1d4ed8 0%,#7c3aed 100%);">
      <span style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">${APP_NAME}</span>
    </td></tr>
    <tr><td style="padding:32px 28px;">
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;letter-spacing:-0.01em;color:#0f172a;">${title}</h1>
      ${body}
    </td></tr>
    <tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;line-height:1.6;">
      ${APP_NAME} · ${COMPANY_ADDRESS}<br/>
      <a href="tel:${SUPPORT_PHONE.replace(/\s|\(|\)|-/g, '')}" style="color:#64748b;text-decoration:none;">${SUPPORT_PHONE}</a> ·
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#64748b;text-decoration:none;">${SUPPORT_EMAIL}</a>
    </td></tr>
  </table>
</body></html>`;
}

function brandButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 24px;border-radius:8px;background:linear-gradient(135deg,#1d4ed8 0%,#7c3aed 100%);color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">${label}</a>`;
}

/* ─────────────────────────────────────────────────────────────────────
 * Public API — wrap a (title, body, href, btnLabel) into full HTML.
 * ──────────────────────────────────────────────────────────────────── */

export interface TemplateContext {
  title: string;
  body: string;        // HTML body content (paragraphs, etc.)
  buttonHref: string;
  buttonLabel: string;
}

/** Return full HTML and a plain-text fallback for the given template. */
export function renderEmailTemplate(
  template: EmailTemplateKey,
  ctx: TemplateContext,
): { html: string; text: string } {
  let html: string;
  let buttonHtml: string;

  switch (template) {
    case 'clean':
      buttonHtml = cleanButton(ctx.buttonHref, ctx.buttonLabel);
      html = cleanShell(
        ctx.title,
        `${ctx.body}<p style="margin:20px 0 0;">${buttonHtml}</p>
         <p style="margin:12px 0 0;font-size:12px;color:#71717a;">Or copy this link:<br/><span style="word-break:break-all;color:#18181b;">${ctx.buttonHref}</span></p>`,
      );
      break;
    case 'dark':
      buttonHtml = darkButton(ctx.buttonHref, ctx.buttonLabel);
      html = darkShell(
        ctx.title,
        `${ctx.body}<p style="margin:20px 0 0;">${buttonHtml}</p>
         <p style="margin:12px 0 0;font-size:12px;color:#737373;">Or copy this link:<br/><span style="word-break:break-all;color:#d4d4d4;">${ctx.buttonHref}</span></p>`,
      );
      break;
    case 'brand':
      buttonHtml = brandButton(ctx.buttonHref, ctx.buttonLabel);
      html = brandShell(
        ctx.title,
        `${ctx.body}<p style="margin:20px 0 0;">${buttonHtml}</p>
         <p style="margin:12px 0 0;font-size:12px;color:#64748b;">Or copy this link:<br/><span style="word-break:break-all;color:#1e293b;">${ctx.buttonHref}</span></p>`,
      );
      break;
    case 'warm':
    default:
      buttonHtml = warmButton(ctx.buttonHref, ctx.buttonLabel);
      html = warmShell(
        ctx.title,
        `${ctx.body}<p style="margin:0 0 24px;">${buttonHtml}</p>
         <p style="margin:0;font-size:13px;color:#807a6c;">Or paste this URL into your browser:<br/><span style="word-break:break-all;color:#3a3a3a;">${ctx.buttonHref}</span></p>`,
      );
      break;
  }

  /* Simple plain-text fallback */
  const text =
    ctx.title +
    '\n\n' +
    ctx.body.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim() +
    '\n\n' +
    ctx.buttonLabel +
    ': ' +
    ctx.buttonHref;

  return { html, text };
}
