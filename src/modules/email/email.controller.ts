import type { RequestHandler } from 'express';
import {
  ConflictError,
  UnauthorizedError,
  ValidationError,
} from '../../shared/errors';
import { sendSuccess } from '../../shared/response';
import { logger } from '../../config/logger';
import { getEmailProvider } from '../../shared/email/EmailProvider';
import { SmtpDeliveryError } from '../../shared/email/smtpProvider';
import { renderEmailPreview } from '../../shared/email/emailPreviews';
import { renderEmailTemplate } from '../../shared/email/emailTemplates';
import { getBrandingContext } from '../../shared/email/brandingContext';
import {
  PREVIEWABLE_EMAIL_TYPES,
  type PreviewableEmailType,
} from '../../shared/email/notificationEmails';
import { EMAIL_TEMPLATE_KEYS, type EmailTemplateKey } from './emailSettings.model';
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
 * configured. On failure the response includes a decoded reason +
 * remediation hints so the admin can fix the config without trawling
 * logs.
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

  /* Wrap the test in the active template + live branding so the
   * admin sees what real emails will actually look like — including
   * the configured From identity and the contact line in the footer. */
  const branding = await getBrandingContext();
  const { html, text } = renderEmailTemplate(
    settings.activeTemplate,
    {
      title: `${branding.appName} email is configured`,
      body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Hi — this is a test message from your ${branding.appName} admin panel. If you can read this, the <strong>${settings.provider}</strong> provider is working end-to-end and the active template is rendering correctly.</p>
             <p style="margin:0 0 8px;font-size:13px;">Sent at ${new Date().toISOString()}.</p>`,
      buttonHref: '#',
      buttonLabel: 'Confirmed',
    },
    branding,
  );

  const provider = await getEmailProvider();
  try {
    await provider.send({
      to: parsed.data.to,
      subject: `${branding.appName} email is configured correctly`,
      html,
      text,
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
    /* SmtpDeliveryError carries pre-decoded `reason` + `hints` so the
     * UI can render a useful card instead of guessing from the raw
     * provider message. Other providers (Resend) fall back to a
     * single-line reason. */
    if (err instanceof SmtpDeliveryError) {
      const conflict = new ConflictError(err.reason);
      /* Stash hints on the error details slot — the central error
       * handler echoes `details` back to the client. */
      (conflict as unknown as { details: unknown }).details = [
        { field: 'hints', message: err.hints.join('\n') },
        ...err.hints.map((h) => ({ field: 'hint', message: h })),
      ];
      throw conflict;
    }
    const reason = err instanceof Error ? err.message : 'Unknown error';
    throw new ConflictError(`Test send failed: ${reason}`);
  }
};

/**
 * Render a sample email for the admin preview pane.
 * Query string: `?template=warm&type=welcome`. Both default to the
 * admin's currently saved template and the welcome email when absent.
 *
 * Returns `{ subject, html, text }` so the frontend can render the
 * HTML inside a sandboxed iframe and show the subject line above it.
 */
export const previewEmail: RequestHandler = async (req, res) => {
  const requestedTemplate =
    typeof req.query.template === 'string' ? req.query.template : '';
  const requestedType =
    typeof req.query.type === 'string' ? req.query.type : 'welcome';
  const settings = await emailSettingsService.getSettings();

  const template: EmailTemplateKey = (
    EMAIL_TEMPLATE_KEYS as readonly string[]
  ).includes(requestedTemplate)
    ? (requestedTemplate as EmailTemplateKey)
    : settings.activeTemplate;

  const type: PreviewableEmailType = (
    PREVIEWABLE_EMAIL_TYPES as readonly string[]
  ).includes(requestedType)
    ? (requestedType as PreviewableEmailType)
    : 'welcome';

  /* Fetch the live branding so the preview footer matches what an
   * actual send would produce — From identity, support phone and
   * postal address from /admin/email + /admin/settings. */
  const branding = await getBrandingContext();
  sendSuccess(res, {
    template,
    type,
    ...renderEmailPreview(template, type, branding),
  });
};
