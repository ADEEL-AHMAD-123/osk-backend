/**
 * Turn the cryptic nodemailer/Node socket errors into actionable advice
 * the admin can act on.
 *
 * Common SMTP failures we want to translate:
 *
 *  - `ETIMEDOUT` on a PaaS like Railway / Render / Vercel almost
 *    always means the outbound SMTP port is blocked. Most hosts block
 *    port 25 outright; some also block 465/587 on free tiers. The fix
 *    is to switch to Resend (HTTPS-only) or upgrade the host's plan.
 *
 *  - `EAUTH` with Gmail SMTP almost always means the admin pasted a
 *    normal Google account password instead of an "App password".
 *    Google disabled "Less secure app" access years ago — an App
 *    password (generated with 2FA on) is the only way to send via
 *    `smtp.gmail.com` now.
 *
 *  - `ECONNECTION` or `Greeting never received` usually means TLS
 *    mismatch — port 465 needs `secure: true`, port 587 needs
 *    `secure: false` (STARTTLS), and swapping them gives a hang.
 */

interface SmtpErrorLike {
  code?: string;
  command?: string;
  response?: string;
  responseCode?: number;
  message?: string;
}

export interface SmtpDiagnosis {
  /** Short, copy-paste-able sentence the admin sees in the toast/card. */
  reason: string;
  /** Optional list of remediation steps surfaced in the admin panel. */
  hints: string[];
}

export function diagnoseSmtpError(
  err: unknown,
  ctx: { host: string; port: number; secure: boolean; user: string },
): SmtpDiagnosis {
  const e = err as SmtpErrorLike;
  const code = (e?.code ?? '').toUpperCase();
  const responseCode = e?.responseCode;
  const message = (e?.response ?? e?.message ?? '').toLowerCase();
  const isGmail = /(^|\.)smtp\.gmail\.com$/i.test(ctx.host.trim());
  const isOutlook = /(^|\.)smtp\.office365\.com$/i.test(ctx.host.trim());

  /* ─── Connection timeout / refused — almost always a network /
   *    port-block problem on the host (Railway, Render, Vercel, etc.) */
  if (code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'ECONNECTION') {
    return {
      reason: `Could not reach ${ctx.host}:${ctx.port}. Your host is likely blocking outbound SMTP.`,
      hints: [
        'Railway, Render and Vercel block outbound SMTP on most plans (especially port 25). Port 587 and 465 are sometimes blocked too.',
        'The fastest fix is to switch the provider above to Resend — it talks HTTPS only, so no port is involved.',
        'If you need SMTP, upgrade your Railway plan or run the API on a host that allows outbound SMTP.',
      ],
    };
  }

  /* ─── Auth failures — Gmail and Outlook both have specific quirks. */
  if (code === 'EAUTH' || responseCode === 535 || /authentication/.test(message)) {
    if (isGmail) {
      return {
        reason:
          'Gmail rejected the credentials. You almost certainly need a Google "App password" instead of your account password.',
        hints: [
          'Enable 2-Step Verification on the Google account first: myaccount.google.com/security.',
          'Then create an App password at myaccount.google.com/apppasswords — paste the 16-character output (no spaces) into the Password field here.',
          'The SMTP user must be the full Gmail address (e.g. you@gmail.com).',
          'Heads up: Gmail still rate-limits SMTP heavily. For production volume, switch to Resend.',
        ],
      };
    }
    if (isOutlook) {
      return {
        reason:
          'Outlook 365 rejected the credentials. Microsoft requires Modern Auth on most tenants — basic SMTP auth is disabled by default.',
        hints: [
          'Check whether your tenant has "Authenticated SMTP" enabled for the mailbox. The fix is admin-only: Microsoft 365 admin center → Users → mailbox → Mail → Manage email apps → enable Authenticated SMTP.',
          'If your org disables SMTP auth, switch to Resend (HTTPS only) — it sidesteps the whole problem.',
        ],
      };
    }
    return {
      reason:
        'The SMTP server rejected the username or password. Double-check both fields and that this account is allowed to send mail.',
      hints: [
        'Some providers want the full email as the username; others want just the local part.',
        'Many providers also issue a separate "SMTP password" or "API token" — your dashboard password may not work here.',
      ],
    };
  }

  /* ─── TLS / handshake mismatches — wrong secure flag for the port. */
  if (
    code === 'EPROTOCOL' ||
    /greeting never received|invalid greeting|wrong version/.test(message)
  ) {
    const suggestSecure = ctx.port === 465 && !ctx.secure;
    const suggestStarttls = ctx.port === 587 && ctx.secure;
    return {
      reason: 'The SMTP server closed the connection during the TLS handshake.',
      hints: [
        suggestSecure
          ? 'Port 465 expects implicit TLS — turn the Secure toggle ON.'
          : suggestStarttls
            ? 'Port 587 expects STARTTLS — turn the Secure toggle OFF.'
            : 'Try the other Secure-toggle setting (587 → off, 465 → on).',
        'Confirm the host/port pair in your provider\'s SMTP documentation.',
      ],
    };
  }

  /* ─── Recipient / sender rejected by the server. */
  if (responseCode && responseCode >= 500 && responseCode < 600) {
    return {
      reason: `The mail server rejected the message (${responseCode}): ${e.response ?? e.message ?? 'no detail'}`,
      hints: [
        'Make sure the From address is on a domain you control AND that the SMTP user is allowed to send from that domain.',
        'Some providers require the From address to exactly match the authenticated mailbox.',
      ],
    };
  }

  /* ─── Fallback — surface whatever the SDK gave us. */
  return {
    reason: e.response || e.message || 'Unknown SMTP error',
    hints: [],
  };
}
