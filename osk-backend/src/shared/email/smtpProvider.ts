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
 * SMTP adapter via nodemailer — works against any SMTP-capable provider
 * (Gmail, Outlook 365, Zoho, Mailtrap, the box's own mailer-daemon, etc.)
 * so no paid third-party service is required.
 *
 * Configure with:
 *   SMTP_HOST       e.g. smtp.gmail.com
 *   SMTP_PORT       587 (STARTTLS) or 465 (TLS) — default 587
 *   SMTP_SECURE     "true" for port 465, otherwise "false"
 *   SMTP_USER       username/email
 *   SMTP_PASSWORD   password or app-password
 *
 * Activate with EMAIL_PROVIDER=smtp. Until then the console adapter
 * (lib/EmailProvider.ts) remains the default — auth flows still work
 * without ever sending a real message.
 */

interface SmtpEnv {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}

const SMTP_CONNECTION_TIMEOUT_MS = 10_000;
const SMTP_GREETING_TIMEOUT_MS = 10_000;
const SMTP_SOCKET_TIMEOUT_MS = 15_000;

function readEnv(): SmtpEnv {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  if (!host || !user || !password) {
    throw new Error(
      'SMTP transport needs SMTP_HOST, SMTP_USER and SMTP_PASSWORD',
    );
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = (process.env.SMTP_SECURE ?? '').toLowerCase() === 'true';
  return { host, port, secure, user, password };
}

let transporter: Transporter | null = null;
function getTransporter(): Transporter {
  if (transporter) return transporter;
  const env = readEnv();
  logger.info(
    {
      provider: 'smtp',
      host: env.host,
      port: env.port,
      secure: env.secure,
      user: env.user,
      connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    },
    'smtp transporter initialized',
  );
  transporter = nodemailer.createTransport({
    host: env.host,
    port: env.port,
    secure: env.secure,
    auth: { user: env.user, pass: env.password },
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
  });
  return transporter;
}

const defaultFrom = (): string =>
  process.env.EMAIL_FROM ?? 'OSK <no-reply@osk.dev>';

export const smtpEmailProvider: EmailProvider = {
  async send(message: EmailMessage): Promise<void> {
    const t = getTransporter();
    try {
      logger.info(
        {
          provider: 'smtp',
          to: message.to,
          subject: message.subject,
          from: message.from ?? defaultFrom(),
          replyTo: message.replyTo,
        },
        'email delivery started',
      );
      const info = await t.sendMail({
        from: message.from ?? defaultFrom(),
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
          reason: smtpErr.response ?? (err instanceof Error ? err.message : 'Unknown SMTP error'),
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
