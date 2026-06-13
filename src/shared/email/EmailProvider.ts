/**
 * EmailProvider — provider-agnostic interface for transactional email.
 *
 * The auth flow (verify-email / reset-password) and inquiry endpoints
 * call into this abstraction; the actual API / SMTP call is delegated
 * to whichever adapter `getEmailProvider()` resolves at send time.
 *
 * The selected provider is now persisted in the database via the
 * EmailSettings singleton (see `modules/email/emailSettings.model.ts`)
 * and is editable from /admin/email. Env vars stay supported as a
 * bootstrap fallback for fresh deploys.
 */
import { logger } from '../../config/logger';
import { emailSettingsService } from '../../modules/email/emailSettings.service';
import { createResendProvider } from './resendProvider';
import { createSmtpProvider } from './smtpProvider';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text version. Auto-derived from `html` when omitted. */
  text?: string;
  /** Sender override. Defaults to the configured From address. */
  from?: string;
  /** Optional reply-to address (e.g. the inquirer's email on a relay). */
  replyTo?: string;
}

export interface EmailProvider {
  /** Deliver a transactional message. Resolves on accept, throws on hard fail. */
  send(message: EmailMessage): Promise<void>;
}

/** Dev-friendly adapter — logs the message and returns. */
function consoleProvider(defaultFrom: string): EmailProvider {
  return {
    async send(message) {
      logger.warn(
        {
          provider: 'console',
          to: message.to,
          subject: message.subject,
          from: message.from ?? defaultFrom,
          replyTo: message.replyTo,
          delivered: false,
          reason:
            "EmailSettings.provider is 'console' — message logged only, no real send",
        },
        'email delivery skipped',
      );
    },
  };
}

function formatFrom(address: string, name: string): string {
  if (!address) return name || 'OSK';
  if (!name) return address;
  /* Standard mailbox format: "Display Name <user@host>". */
  return `${name} <${address}>`;
}

/**
 * Resolve and return the active email provider. This is awaited at
 * every send so an admin update to EmailSettings (provider switch /
 * API key paste) takes effect immediately without a process restart.
 *
 * Race notes: we hit Mongo on every send. That's fine — these are
 * transactional emails (verify/reset/inquiry), not high-frequency
 * traffic, and the singleton document is tiny. If a future high-rate
 * path needs caching, wrap this call in an in-process LRU keyed by
 * doc.updatedAt and invalidate on PATCH.
 */
export async function getEmailProvider(): Promise<EmailProvider> {
  const secrets = await emailSettingsService.getProviderSecrets();
  const defaultFrom = formatFrom(secrets.fromAddress, secrets.fromName);

  switch (secrets.provider) {
    case 'resend':
      if (!secrets.resendApiKey) {
        logger.warn(
          { provider: 'resend' },
          'Resend selected but no API key — falling back to console adapter',
        );
        return consoleProvider(defaultFrom);
      }
      return createResendProvider({
        apiKey: secrets.resendApiKey,
        defaultFrom,
      });
    case 'smtp':
      if (!secrets.smtp.host || !secrets.smtp.user || !secrets.smtp.password) {
        logger.warn(
          { provider: 'smtp' },
          'SMTP selected but missing credentials — falling back to console adapter',
        );
        return consoleProvider(defaultFrom);
      }
      return createSmtpProvider({
        host: secrets.smtp.host,
        port: secrets.smtp.port,
        secure: secrets.smtp.secure,
        user: secrets.smtp.user,
        password: secrets.smtp.password,
        defaultFrom,
      });
    case 'console':
    default:
      return consoleProvider(defaultFrom);
  }
}
