import type { EmailTemplateKey } from '../../modules/email/emailSettings.model';

/* ─────────────────────────────────────────────────────────────────────
 * Email template renderer.
 *
 * Every template is a function `(branding, title, body) => html` so
 * the App name, support email, phone and company address are pulled
 * fresh from the operator's saved settings on each send — never
 * baked into the source. That means:
 *
 *   - The admin's `From name` and `From address` from /admin/email
 *     drive what appears in the footer.
 *   - The contact phone and physical address from /admin/settings
 *     drive the "X · address · phone · email" footer line.
 *   - A change saved in either panel takes effect on the next email,
 *     no restart or template-edit required.
 *
 * The admin preview endpoint shares the same renderer, so what they
 * see is exactly what the seller receives.
 * ──────────────────────────────────────────────────────────────────── */

export interface BrandingContext {
  /** Display name shown in the header / signature. */
  appName: string;
  /** Support reply-to address shown in the footer. */
  supportEmail: string;
  /** Optional phone number shown in the footer. Empty string hides it. */
  supportPhone: string;
  /** Pre-composed single-line postal address shown in the footer. Empty
   *  string hides it. */
  companyAddress: string;
}

const DEFAULT_BRANDING: BrandingContext = {
  appName: 'OSK',
  supportEmail: '',
  supportPhone: '',
  companyAddress: '',
};

/** Strip every char that isn't valid in a `tel:` URI. */
function telHref(phone: string): string {
  return phone.replace(/[\s()\-–—.]/g, '');
}

/** Render the shared footer-line markup once so all four templates
 *  stay in sync. The colour is the lighter "muted" tone per-template. */
function footerLine(brand: BrandingContext, color: string): string {
  const bits: string[] = [];
  if (brand.appName) bits.push(`<span style="color:${color};">${brand.appName}</span>`);
  if (brand.companyAddress) bits.push(brand.companyAddress);
  const meta = bits.join(' · ');
  const links: string[] = [];
  if (brand.supportPhone) {
    links.push(
      `<a href="tel:${telHref(brand.supportPhone)}" style="color:${color};text-decoration:none;">${brand.supportPhone}</a>`,
    );
  }
  if (brand.supportEmail) {
    links.push(
      `<a href="mailto:${brand.supportEmail}" style="color:${color};text-decoration:none;">${brand.supportEmail}</a>`,
    );
  }
  return [meta, links.join(' · ')].filter(Boolean).join('<br/>');
}

/* ─── Warm (default) — ivory/beige, earthy tones ─────────────────── */
function warmShell(brand: BrandingContext, title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f7f5f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e7e3da;">
    <tr><td style="padding:24px 28px;border-bottom:1px solid #efece5;font-weight:700;letter-spacing:0.14em;font-size:11px;color:#8a7a55;text-transform:uppercase;">${brand.appName}</td></tr>
    <tr><td style="padding:32px 28px;">
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;letter-spacing:-0.01em;color:#1a1a1a;">${title}</h1>
      ${body}
    </td></tr>
    <tr><td style="padding:18px 28px;background:#fafaf6;border-top:1px solid #efece5;font-size:12px;color:#807a6c;line-height:1.6;">
      If you didn&rsquo;t expect this email, you can safely ignore it.<br/>
      ${footerLine(brand, '#807a6c')}
    </td></tr>
  </table>
</body></html>`;
}

function warmButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#1f2937;color:#ffffff;text-decoration:none;font-weight:600;letter-spacing:0.04em;font-size:14px;">${label}</a>`;
}

/* ─── Clean — white background, minimal ───────────────────────────── */
function cleanShell(brand: BrandingContext, title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:32px 16px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <tr><td style="padding:20px 32px;border-bottom:1px solid #f0f0f0;">
      <span style="font-size:17px;font-weight:700;color:#18181b;letter-spacing:-0.02em;">${brand.appName}</span>
    </td></tr>
    <tr><td style="padding:36px 32px;">
      <h1 style="margin:0 0 14px;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#09090b;">${title}</h1>
      ${body}
    </td></tr>
    <tr><td style="padding:20px 32px;background:#fafafa;border-top:1px solid #f0f0f0;font-size:12px;color:#71717a;line-height:1.7;">
      ${footerLine(brand, '#71717a')}
    </td></tr>
  </table>
</body></html>`;
}

function cleanButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:11px 22px;border-radius:8px;background:#18181b;color:#fafafa;text-decoration:none;font-weight:600;font-size:14px;">${label}</a>`;
}

/* ─── Dark — night-mode style ────────────────────────────────────── */
function darkShell(brand: BrandingContext, title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e5e5e5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#171717;border-radius:14px;overflow:hidden;border:1px solid #262626;">
    <tr><td style="padding:24px 28px;border-bottom:1px solid #262626;font-weight:700;letter-spacing:0.14em;font-size:11px;color:#a3a3a3;text-transform:uppercase;">${brand.appName}</td></tr>
    <tr><td style="padding:32px 28px;">
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;letter-spacing:-0.01em;color:#fafafa;">${title}</h1>
      ${body}
    </td></tr>
    <tr><td style="padding:18px 28px;background:#0f0f0f;border-top:1px solid #262626;font-size:12px;color:#737373;line-height:1.6;">
      If you didn&rsquo;t expect this email, you can safely ignore it.<br/>
      ${footerLine(brand, '#737373')}
    </td></tr>
  </table>
</body></html>`;
}

function darkButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#f5f5f5;color:#0a0a0a;text-decoration:none;font-weight:700;letter-spacing:0.03em;font-size:14px;">${label}</a>`;
}

/* ─── Brand — accent gradient header ─────────────────────────────── */
function brandShell(brand: BrandingContext, title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr><td style="padding:26px 28px;background:linear-gradient(135deg,#1d4ed8 0%,#7c3aed 100%);">
      <span style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">${brand.appName}</span>
    </td></tr>
    <tr><td style="padding:32px 28px;">
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;letter-spacing:-0.01em;color:#0f172a;">${title}</h1>
      ${body}
    </td></tr>
    <tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;line-height:1.6;">
      ${footerLine(brand, '#64748b')}
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
  /** HTML body content (paragraphs, etc.). */
  body: string;
  buttonHref: string;
  buttonLabel: string;
}

/**
 * Return full HTML + a plain-text fallback for the chosen template.
 *
 *  @param template Which look-and-feel to wrap the content in.
 *  @param ctx      The actual message (title, body, CTA).
 *  @param branding The operator's configured From identity + contact
 *                  info. Defaults to a generic OSK fallback so unit
 *                  tests and dev scripts work without a DB hit, but
 *                  the production path always passes real values.
 */
export function renderEmailTemplate(
  template: EmailTemplateKey,
  ctx: TemplateContext,
  branding: BrandingContext = DEFAULT_BRANDING,
): { html: string; text: string } {
  let html: string;
  let buttonHtml: string;

  switch (template) {
    case 'clean':
      buttonHtml = cleanButton(ctx.buttonHref, ctx.buttonLabel);
      html = cleanShell(
        branding,
        ctx.title,
        `${ctx.body}<p style="margin:20px 0 0;">${buttonHtml}</p>
         <p style="margin:12px 0 0;font-size:12px;color:#71717a;">Or copy this link:<br/><span style="word-break:break-all;color:#18181b;">${ctx.buttonHref}</span></p>`,
      );
      break;
    case 'dark':
      buttonHtml = darkButton(ctx.buttonHref, ctx.buttonLabel);
      html = darkShell(
        branding,
        ctx.title,
        `${ctx.body}<p style="margin:20px 0 0;">${buttonHtml}</p>
         <p style="margin:12px 0 0;font-size:12px;color:#737373;">Or copy this link:<br/><span style="word-break:break-all;color:#d4d4d4;">${ctx.buttonHref}</span></p>`,
      );
      break;
    case 'brand':
      buttonHtml = brandButton(ctx.buttonHref, ctx.buttonLabel);
      html = brandShell(
        branding,
        ctx.title,
        `${ctx.body}<p style="margin:20px 0 0;">${buttonHtml}</p>
         <p style="margin:12px 0 0;font-size:12px;color:#64748b;">Or copy this link:<br/><span style="word-break:break-all;color:#1e293b;">${ctx.buttonHref}</span></p>`,
      );
      break;
    case 'warm':
    default:
      buttonHtml = warmButton(ctx.buttonHref, ctx.buttonLabel);
      html = warmShell(
        branding,
        ctx.title,
        /* 20px top margin matches the other three templates so the
         * button never collides with a body paragraph that ended in
         * margin:0 (e.g. the password-reset "ignore this email"
         * footnote). */
        `${ctx.body}<p style="margin:20px 0 0;">${buttonHtml}</p>
         <p style="margin:12px 0 0;font-size:13px;color:#807a6c;">Or paste this URL into your browser:<br/><span style="word-break:break-all;color:#3a3a3a;">${ctx.buttonHref}</span></p>`,
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
