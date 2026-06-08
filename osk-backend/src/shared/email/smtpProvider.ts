import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from '../../config/logger';
import type { EmailMessage, EmailProvider } from './EmailProvider';

interface SmtpErrorLike {
  code?: string;
  command?: string;
  response?: string;
  responseCode?: number;
}

/**
 * SMTP adapter via nodemailer — works against any SMTP-capable
 * provider (Outlook 365, Zoho, Mailtrap, the box's own mailer-daemon,
 * etc.). Kept for operators who already run their own mail; for new
 * deploys we recommend Resend (HTTPS-only, works everywhere) via the
 * `resendProvider` adapter.
 */

interface SmtpDeps {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  defaultFrom: string;
}

const SMTP_CONNECTION_TIMEOUT_MS = 10_000;
const SMTP_GREETING_TIMEOUT_MS = 10_000;
const SMTP_SOCKET_TIMEOUT_MS = 15_000;

export function createSmtpProvider(deps: SmtpDeps): EmailProvider {
  if (!deps.host || !deps.user || !deps.password) {
    throw new Error(
      'SMTP transport needs host, user and password — configure in /admin/email.',
    );
  }
  logger.info(
    {
      provider: 'smtp',
      host: deps.host,
      port: deps.port,
      secure: deps.secure,
      user: deps.user,
      connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    },
    'smtp transporter initialized',
  );
  const transporter: Transporter = nodemailer.createTransport({
    host: deps.host,
    port: deps.port,
    secure: deps.secure,
    auth: { user: deps.user, pass: deps.password },
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
  });

  return {
    async send(message: EmailMessage): Promise<void> {
      const from = message.from ?? deps.defaultFrom;
      try {
        logger.info(
          {
            provider: 'smtp',
            to: message.to,
            subject: message.subject,
            from,
            replyTo: message.replyTo,
          },
          'email delivery started',
        );
        const info = await transporter.sendMail({
          from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          replyTo: message.replyTo,
        });
        logger.info(
          {
            provider: 'smtp',
            to: message.to,
            subject: message.subject,
            messageId: info.messageId,
            accepted: info.accepted,
            rejected: info.rejected,
            pending: info.pending,
            delivered: info.rejected.length === 0,
          },
          'email delivered',
        );
      } catch (err) {
        const smtpErr = err as SmtpErrorLike;
        logger.error(
          {
            err,
            provider: 'smtp',
            to: message.to,
            subject: message.subject,
            delivered: false,
            reason:
              smtpErr.response ??
              (err instanceof Error ? err.message : 'Unknown SMTP error'),
            code: smtpErr.code,
            command: smtpErr.command,
            responseCode: smtpErr.responseCode,
          },
          'email delivery failed',
        );
        throw err;
      }
    },
  };
}
