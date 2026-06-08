import type { RequestHandler } from 'express';
import { ConflictError, UnauthorizedError, ValidationError } from '../../shared/errors';
import { sendSuccess } from '../../shared/response';
import { logger } from '../../config/logger';
import { getEmailProvider } from '../../shared/email/EmailProvider';
import { emailSettingsService } from './emailSettings.service';
import {
  sendTestEmailSchema,
  updateEmailSettingsSchema,
} from './emailSettings.schema';

/* ─── Admin reads & writes ────────────────────────────────────────── */

export const getEmailSettings: RequestHandler = async (_req, res) => {
  sendSuccess(res, await emailSettingsService.getSettings());
};

export const updateEmailSettings: RequestHandler = async (req, res) => {
  const parsed = updateEmailSettingsSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  sendSuccess(res, await emailSettingsService.updateSettings(parsed.data));
};

/**
 * Send a one-shot test email using whatever provider is currently
 * configured. Admin can pass any recipient; defaults to their own
 * authed email when the body is empty.
 */
export const sendTestEmail: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const parsed = sendTestEmailSchema.safeParse({
    to: req.body?.to ?? req.user.email,
  });
  if (!parsed.success) throw new ValidationError(parsed.error.issues);

  const settings = await emailSettingsService.getSettings();
  if (!settings.ready) {
    throw new ConflictError(
      `Email is not ready to send. Current provider: ${settings.provider}. Configure required fields in /admin/email.`,
    );
  }

  const provider = await getEmailProvider();
  try {
    await provider.send({
      to: parsed.data.to,
      subject: 'OSK email is configured correctly',
      html: `
        <p>Hi,</p>
        <p>This is a test message from your OSK admin panel.</p>
        <p>If you're reading this, your <strong>${settings.provider}</strong> provider is working end-to-end —
        nice work.</p>
        <p style="color:#888;font-size:12px;margin-top:24px">
          Sent from /admin/email · ${new Date().toISOString()}
        </p>
      `,
      text: `OSK test email — provider ${settings.provider} is configured correctly. Sent ${new Date().toISOString()}.`,
    });
    logger.info(
      {
        adminId: req.user.id,
        provider: settings.provider,
        to: parsed.data.to,
      },
      'admin sent email-test',
    );
    sendSuccess(res, { sent: true, to: parsed.data.to });
  } catch (err) {
    /* Surface a useful reason rather than a generic 500 — the admin
     * pasted the wrong key, hit a Resend rate limit, etc. */
    const reason = err instanceof Error ? err.message : 'Unknown error';
    throw new ConflictError(`Test send failed: ${reason}`);
  }
};
