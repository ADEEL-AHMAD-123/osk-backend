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
} from './contactMessage.model';
import type {
  ContactGeneralInput,
  ContactMessagePatchInput,
} from './contactMessage.schema';

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
