/**
 * EmailProvider — provider-agnostic interface for transactional email.
 *
 * The auth flow (verify-email / reset-password) and inquiry endpoints
 * call into this abstraction; the actual SMTP / API call is delegated
 * to whichever adapter `getEmailProvider()` returns. In dev/test the
 * console adapter logs to pino so flows are observable without a real
 * mail server. Swap in SendGrid / Postmark / SES by adding an adapter
 * and reading `env.EMAIL_PROVIDER`.
 */
import { logger } from '../../config/logger';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text version. Auto-derived from `html` when omitted. */
  text?: string;
  /** Sender override. Defaults to env.EMAIL_FROM. */
  from?: string;
  /** Optional reply-to address (e.g. the inquirer's email on a relay). */
  replyTo?: string;
}

export interface EmailProvider {
  /** Deliver a transactional message. Resolves on accept, throws on hard fail. */
  send(message: EmailMessage): Promise<void>;
}

/** Default sender; overridable via env. */
function defaultFrom(): string {
  return process.env.EMAIL_FROM ?? 'OSK <no-reply@osk.dev>';
}

/** Dev-friendly adapter — logs the message and returns. */
const consoleProvider: EmailProvider = {
  async send(message) {
    logger.warn(
      {
        provider: 'console',
        to: message.to,
        subject: message.subject,
        from: message.from ?? defaultFrom(),
        replyTo: message.replyTo,
        delivered: false,
        reason:
          'EMAIL_PROVIDER is not set to smtp; message was logged only and not sent',
      },
      'email delivery skipped',
    );
  },
};

let cached: EmailProvider | null = null;

/**
 * Select an email provider once and cache it. Add new adapters here and
 * branch on `process.env.EMAIL_PROVIDER`. Console is the default so the
 * auth flow runs without any third-party credentials.
 */
export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  const flavor = (process.env.EMAIL_PROVIDER ?? 'console').toLowerCase();
  switch (flavor) {
    case 'smtp': {
      /* Lazy require so the SMTP module — and its `nodemailer` import —
       * stays out of the dev startup graph until you actually opt in. */
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { smtpEmailProvider } = require('./smtpProvider') as typeof import('./smtpProvider');
      cached = smtpEmailProvider;
      break;
    }
    // case 'sendgrid': cached = sendgridProvider(); break;
    // case 'ses':      cached = sesProvider(); break;
    case 'console':
    default:
      cached = consoleProvider;
      break;
  }
  logger.info({ provider: flavor }, 'email provider configured');
  return cached;
}
