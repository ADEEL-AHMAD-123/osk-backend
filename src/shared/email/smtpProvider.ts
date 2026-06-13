import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from '../../config/logger';
import { diagnoseSmtpError } from './smtpDiagnose';
import type { EmailMessage, EmailProvider } from './EmailProvider';

interface SmtpErrorLike {
  code?: string;
  command?: string;
  response?: string;
  responseCode?: number;
}

/**
 * Error class enriched with a human-readable diagnosis and remediation
 * hints. The admin controller catches this and surfaces both on the
 * test-send response so the operator can act without trawling logs.
 */
export class SmtpDeliveryError extends Error {
  readonly reason: string;
  readonly hints: string[];
  override readonly cause?: unknown;

  constructor(reason: string, hints: string[], cause?: unknown) {
    super(reason);
    this.name = 'SmtpDeliveryError';
    this.reason = reason;
    this.hints = hints;
    this.cause = cause;
  }
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

  const isGmailHost = /(^|\.)smtp\.gmail\.com$/i.test(deps.host.trim());
  const smtpUserNormalized = deps.user.trim().toLowerCase();

  const usesAuthenticatedMailbox = (from: string): boolean =>
    from.toLowerCase().includes(smtpUserNormalized);

  return {
    async send(message: EmailMessage): Promise<void> {
      const requestedFrom = message.from ?? deps.defaultFrom;
      /* Gmail commonly rejects sends when the From mailbox differs from the
       * authenticated SMTP user unless that alias is explicitly configured.
       * To avoid false "SMTP failed" reports for valid credentials, force the
       * authenticated mailbox for Gmail hosts when the sender doesn't match. */
      const from =
        isGmailHost && !usesAuthenticatedMailbox(requestedFrom)
          ? deps.user
          : requestedFrom;
      try {
        if (from !== requestedFrom) {
          logger.warn(
            {
              provider: 'smtp',
              host: deps.host,
              requestedFrom,
              effectiveFrom: from,
              smtpUser: deps.user,
            },
            'smtp sender adjusted to authenticated mailbox',
          );
        }
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
        const diag = diagnoseSmtpError(err, {
          host: deps.host,
          port: deps.port,
          secure: deps.secure,
          user: deps.user,
        });
        logger.error(
          {
            err,
            provider: 'smtp',
            to: message.to,
            subject: message.subject,
            delivered: false,
            reason: diag.reason,
            hints: diag.hints,
            code: smtpErr.code,
            command: smtpErr.command,
            responseCode: smtpErr.responseCode,
            rawResponse: smtpErr.response,
          },
          `email delivery failed: ${diag.reason}`,
        );
        /* Throw an enriched error so the admin controller can surface
         * the decoded reason + remediation hints on the response,
         * not a generic "Internal server error". */
        throw new SmtpDeliveryError(diag.reason, diag.hints, err);
      }
    },
  };
}
