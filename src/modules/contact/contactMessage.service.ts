import { logger } from '../../config/logger';
import { getBrandingContext } from '../../shared/email/brandingContext';
import { getEmailProvider } from '../../shared/email/EmailProvider';
import { renderEmailTemplate } from '../../shared/email/emailTemplates';
import { resolveAppBaseUrl } from '../../shared/email/appBaseUrl';
import { emailSettingsService } from '../email/emailSettings.service';
import { UserModel } from '../auth/user.model';
import { notificationService } from '../notifications/notification.service';
import {
  ContactMessageModel,
  type ContactMessageDoc,
  type ContactMessageStatus,
  type ContactTopic,
} from './contactMessage.model';
import type {
  ContactGeneralInput,
  ContactMessagePatchInput,
} from './contactMessage.schema';

/** Stable DTO returned to clients — uses `id` (not Mongo's `_id`) and
 *  ISO timestamps so the React side doesn't have to convert. */
export interface ContactMessageDTO {
  id: string;
  name: string;
  email: string;
  topic: ContactTopic;
  message: string;
  status: ContactMessageStatus;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
}

export function toContactMessageDTO(doc: ContactMessageDoc): ContactMessageDTO {
  return {
    id: doc._id.toString(),
    name: doc.name,
    email: doc.email,
    topic: doc.topic,
    message: doc.message,
    status: doc.status,
    adminNote: doc.adminNote ?? '',
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/* ─────────────────────────────────────────────────────────────────
 * Contact-message application layer.
 *
 *  - create(): persists + notifies every admin (in-app bell + email).
 *  - list(): paginated admin list with status filter.
 *  - update(): admin marks replied / closed + saves note.
 *
 * Email notification is fire-and-forget — a delivery blip must not
 * fail the public form submission. The admin still sees the record
 * in the dashboard regardless.
 * ──────────────────────────────────────────────────────────────── */

interface RequestMeta {
  ip?: string;
  userAgent?: string;
  /** Browser Origin where the form was submitted — used as the base
   *  URL for the "Open in admin" link in the notification email. */
  origin?: string | null;
}

export interface ContactListFilters {
  status?: ContactMessageStatus;
  page: number;
  limit: number;
}

export interface ContactListPage {
  items: ContactMessageDoc[];
  total: number;
  unread: number;
}

export const contactMessageService = {
  async create(
    input: Omit<ContactGeneralInput, 'consent' | 'captchaToken'>,
    meta: RequestMeta,
  ): Promise<ContactMessageDoc> {
    const doc = await ContactMessageModel.create({
      name: input.name.trim(),
      email: input.email.trim(),
      topic: input.topic,
      message: input.message.trim(),
      status: 'new',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    /* Notify every admin in parallel — they all see the new message
     * in the bell. We deliberately don't dedupe past notifications;
     * each admin gets their own row so "mark read" is per-user. */
    void (async () => {
      try {
        const admins = await UserModel.find({ role: 'admin' })
          .select('_id email')
          .lean()
          .exec();
        const preview = doc.message.length > 200
          ? `${doc.message.slice(0, 200)}…`
          : doc.message;
        await Promise.all(
          admins.map((admin) =>
            notificationService
              .notify({
                userId: admin._id,
                type: 'system',
                title: `New contact message — ${doc.topic}`,
                body: `${doc.name}: ${preview}`,
                href: '/admin/contact-messages',
                meta: { contactMessageId: doc._id.toString() },
              })
              .catch((err) =>
                logger.warn({ err }, 'admin contact notify failed'),
              ),
          ),
        );

        /* Email every admin too — many operators don't keep the
         * dashboard open all day. Uses the regular branded template
         * so the message looks like any other transactional email. */
        const [emailSettings, branding] = await Promise.all([
          emailSettingsService.getProviderSecrets(),
          getBrandingContext(),
        ]);
        const provider = await getEmailProvider();
        const html = `
          <p style="margin:0 0 12px;font-size:15px;line-height:1.55;">
            <strong>${escapeHtml(doc.name)}</strong>
            (<a href="mailto:${escapeHtml(doc.email)}">${escapeHtml(doc.email)}</a>)
            sent a message via the contact form.
          </p>
          <p style="margin:0 0 12px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#888;">
            Topic: ${escapeHtml(doc.topic)}
          </p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.55;white-space:pre-wrap;">
            ${escapeHtml(doc.message)}
          </p>`;
        const { html: rendered, text } = renderEmailTemplate(
          emailSettings.activeTemplate,
          {
            title: `New contact message — ${doc.topic}`,
            body: html,
            buttonHref: `${resolveAppBaseUrl({ requestOrigin: meta.origin })}/admin/contact-messages`,
            buttonLabel: 'Open in admin',
          },
          branding,
        );
        await Promise.all(
          admins
            .filter((a) => Boolean(a.email))
            .map((admin) =>
              provider
                .send({
                  to: admin.email,
                  subject: `New contact: ${doc.topic} from ${doc.name}`,
                  html: rendered,
                  text,
                  replyTo: doc.email,
                })
                .catch((err) =>
                  logger.warn({ err, to: admin.email }, 'admin contact email failed'),
                ),
            ),
        );
      } catch (err) {
        logger.warn({ err }, 'admin contact fan-out failed');
      }
    })();

    return doc;
  },

  async list(filters: ContactListFilters): Promise<ContactListPage> {
    const query: Record<string, unknown> = {};
    if (filters.status) query.status = filters.status;
    const skip = (filters.page - 1) * filters.limit;
    const [items, total, unread] = await Promise.all([
      ContactMessageModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(filters.limit)
        .exec(),
      ContactMessageModel.countDocuments(query).exec(),
      ContactMessageModel.countDocuments({ status: 'new' }).exec(),
    ]);
    return { items, total, unread };
  },

  async update(
    id: string,
    patch: ContactMessagePatchInput,
  ): Promise<ContactMessageDoc | null> {
    const update: Record<string, unknown> = {};
    if (patch.status) update.status = patch.status;
    if (typeof patch.adminNote === 'string') update.adminNote = patch.adminNote;
    return ContactMessageModel.findByIdAndUpdate(id, update, {
      new: true,
    }).exec();
  },

  /**
   * Send an email reply to the visitor through the configured email
   * provider. On success, the message is marked `replied` and the
   * reply text is appended to `adminNote` as an audit trail. The
   * replying admin gets an in-app notification confirming the send.
   *
   * Throws if the message doesn't exist, the email provider isn't
   * configured, or delivery fails — the controller maps these to
   * proper HTTP errors so the admin sees a useful toast.
   */
  async sendReply(
    id: string,
    opts: {
      body: string;
      adminId: import('mongoose').Types.ObjectId;
      adminName: string;
      origin?: string | null;
    },
  ): Promise<ContactMessageDoc> {
    const doc = await ContactMessageModel.findById(id).exec();
    if (!doc) throw new Error('Contact message not found');

    const trimmed = opts.body.trim();
    if (trimmed.length < 2) {
      throw new Error('Reply body is empty');
    }

    const [branding] = await Promise.all([getBrandingContext()]);
    const emailSettings = await emailSettingsService.getProviderSecrets();
    const provider = await getEmailProvider();

    const html = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(
        trimmed,
      )}</p>
      <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;" />
      <p style="margin:0 0 6px;font-size:12px;color:#888;">Your original message:</p>
      <blockquote style="margin:0;padding-left:12px;border-left:3px solid #ddd;font-size:13px;color:#555;line-height:1.55;white-space:pre-wrap;">${escapeHtml(
        doc.message,
      )}</blockquote>`;

    const { html: rendered, text } = renderEmailTemplate(
      emailSettings.activeTemplate,
      {
        title: `Re: ${doc.topic}`,
        body: html,
        buttonHref: resolveAppBaseUrl({ requestOrigin: opts.origin }),
        buttonLabel: 'Visit site',
      },
      branding,
    );

    await provider.send({
      to: doc.email,
      subject: `Re: ${doc.topic}`,
      html: rendered,
      text,
      /* `replyTo` set to the admin's address so the visitor's reply
       * lands back in the admin inbox — keeps the thread coherent. */
      replyTo: branding.supportEmail,
    });

    /* Persist after the send so a delivery failure doesn't mark a
     * message as replied. Append (don't replace) the admin note so
     * earlier notes survive the audit trail. */
    const stamp = new Date().toISOString();
    const previousNote = doc.adminNote?.trim() ?? '';
    const replyEntry = `[${stamp}] ${opts.adminName} replied:\n${trimmed}`;
    doc.adminNote = previousNote
      ? `${previousNote}\n\n${replyEntry}`
      : replyEntry;
    doc.status = 'replied';
    await doc.save();

    /* Confirmation notification for the admin who hit Send. */
    void notificationService
      .notify({
        userId: opts.adminId,
        type: 'system',
        title: `Reply sent to ${doc.name}`,
        body: `Your reply about "${doc.topic}" was delivered to ${doc.email}.`,
        href: '/admin/contact-messages',
        meta: { contactMessageId: doc._id.toString() },
      })
      .catch((err) =>
        logger.warn({ err }, 'reply confirmation notification skipped'),
      );

    return doc;
  },
};

/** Tiny HTML-escape so user-supplied strings can't break the email
 *  layout or inject markup. Strict allow-list: <, >, &, ", '. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
