import { Resend } from 'resend';
import { logger } from '../../config/logger';
import type { EmailMessage, EmailProvider } from './EmailProvider';

/**
 * Resend adapter.
 *
 * Resend is an HTTPS-only API (api.resend.com) so it works out-of-the
 * box on Railway / Vercel / Render without SMTP-port allow-listing or
 * STARTTLS gymnastics. The only thing the operator has to configure
 * is a single API key + a verified From address.
 *
 * Setup:
 *   1. dashboard.resend.com → API keys → "Create API key"
 *   2. dashboard.resend.com → Domains → verify the sending domain
 *      (SPF + DKIM TXT records). Until verified, Resend will accept
 *      sends but only deliver to the account owner's address.
 *   3. Paste the key into /admin/email and save.
 *
 * On Railway specifically:
 *   - No outbound port restrictions to worry about (HTTPS only).
 *   - Set `OSK_SECRETS_KEY` so the saved key is encrypted at rest.
 *   - Optionally set `RESEND_API_KEY` as a bootstrap env var; the DB
 *     value takes precedence as soon as the admin saves anything.
 */

interface ResendDeps {
  apiKey: string;
  defaultFrom: string;
}

function fromHeader(deps: ResendDeps, override?: string): string {
  return override || deps.defaultFrom;
}

/** Build a one-shot adapter bound to the current credentials. The
 *  factory is called per-request by `getEmailProvider()` so an admin
 *  update of the API key takes effect immediately, without a restart. */
export function createResendProvider(deps: ResendDeps): EmailProvider {
  if (!deps.apiKey) {
    throw new Error(
      'Resend transport needs an API key — set it in /admin/email or RESEND_API_KEY.',
    );
  }
  const client = new Resend(deps.apiKey);
  return {
    async send(message: EmailMessage): Promise<void> {
      const from = fromHeader(deps, message.from);
      try {
        const { data, error } = await client.emails.send({
          from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          replyTo: message.replyTo,
        });
        if (error) {
          /* Resend SDK puts API errors on `error`, not as throws. We
           * surface them as proper rejections so callers can react. */
          throw new Error(error.message || 'Resend rejected the send');
        }
        logger.info(
          {
            provider: 'resend',
            to: message.to,
            subject: message.subject,
            from,
            messageId: data?.id,
            delivered: true,
          },
          'email delivered via Resend',
        );
      } catch (err) {
        logger.error(
          {
            err,
            provider: 'resend',
            to: message.to,
            subject: message.subject,
            delivered: false,
            reason: err instanceof Error ? err.message : 'Unknown Resend error',
          },
          'email delivery failed',
        );
        throw err;
      }
    },
  };
}
