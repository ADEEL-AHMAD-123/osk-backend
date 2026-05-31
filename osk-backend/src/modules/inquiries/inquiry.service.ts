import { Types } from 'mongoose';
import { ForbiddenError, NotFoundError } from '../../shared/errors';
import { logger } from '../../config/logger';
import { getEmailProvider } from '../../shared/email/EmailProvider';
import type { AuthUser } from '../../shared/middleware/auth';
import { propertyRepository } from '../properties/property.repository';
import { notificationService } from '../notifications/notification.service';
import {
  inquiryRepository,
  type CreateInquiryInput,
} from './inquiry.repository';
import type { InquiryDoc, InquiryStatus } from './inquiry.model';
import type {
  CallbackDto,
  InquiryDto,
  InquiryFilters,
} from './inquiry.schema';

/* ─── helpers ────────────────────────────────────────────────────────── */

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

async function resolveOwner(propertyId: string): Promise<Types.ObjectId> {
  const property = await propertyRepository.findById(propertyId);
  if (!property) throw new NotFoundError('Property not found');
  return property.owner as Types.ObjectId;
}

/* ─── service ────────────────────────────────────────────────────────── */

export const inquiryService = {
  /** Persist an email inquiry and notify the owner. */
  async createEmailInquiry(
    body: InquiryDto,
    meta: RequestMeta,
  ): Promise<InquiryDoc> {
    const ownerId = await resolveOwner(body.propertyId);
    const input: CreateInquiryInput = {
      propertyId: body.propertyId,
      ownerId,
      channel: 'email',
      name: body.name,
      email: body.email,
      phone: body.phone,
      message: body.message,
      consent: body.consent,
      ip: meta.ip,
      userAgent: meta.userAgent,
    };
    const inquiry = await inquiryRepository.create(input);

    // In-app notification for the owner.
    void notificationService
      .notify({
        userId: ownerId,
        type: 'inquiry.new',
        title: `New inquiry from ${body.name}`,
        body: body.message.slice(0, 200),
        href: `/dashboard/inquiries/${inquiry._id.toString()}`,
        meta: { propertyId: body.propertyId, inquiryId: inquiry._id.toString() },
      })
      .catch((err) => logger.warn({ err }, 'notification.notify failed'));

    // Fire-and-forget — never block the request on email delivery.
    void getEmailProvider()
      .send({
        to: `Owner <owner-${ownerId.toString()}@osk.dev>`, // TODO: resolve real owner email
        subject: `New inquiry on your listing`,
        replyTo: body.email,
        html: `
          <p>You have a new inquiry from <strong>${body.name}</strong>.</p>
          <p>${body.message}</p>
          <p>Reply directly to this email to reach them.</p>
        `,
      })
      .catch((err) => logger.warn({ err }, 'email.send failed'));

    return inquiry;
  },

  /** Persist a callback request. */
  async createCallbackRequest(
    body: CallbackDto,
    meta: RequestMeta,
  ): Promise<InquiryDoc> {
    const ownerId = await resolveOwner(body.propertyId);
    const input: CreateInquiryInput = {
      propertyId: body.propertyId,
      ownerId,
      channel: 'call',
      name: body.name,
      phone: body.phone,
      slots: body.slots,
      consent: body.consent,
      ip: meta.ip,
      userAgent: meta.userAgent,
    };
    const inquiry = await inquiryRepository.create(input);
    void notificationService
      .notify({
        userId: ownerId,
        type: 'inquiry.callback',
        title: `Callback requested by ${body.name}`,
        body: `Prefers: ${body.slots.join(', ')}`,
        href: `/dashboard/inquiries/${inquiry._id.toString()}`,
        meta: { propertyId: body.propertyId, inquiryId: inquiry._id.toString() },
      })
      .catch((err) => logger.warn({ err }, 'notification.notify failed'));
    return inquiry;
  },

  /** Owner / admin list. */
  async list(
    filters: InquiryFilters,
    actor: AuthUser,
  ): Promise<{ items: InquiryDoc[]; total: number }> {
    const scope = actor.role === 'admin' ? undefined : actor.id;
    return inquiryRepository.list(filters, scope);
  },

  async updateStatus(
    id: string,
    status: InquiryStatus,
    actor: AuthUser,
  ): Promise<InquiryDoc> {
    const inquiry = await inquiryRepository.findById(id);
    if (!inquiry) throw new NotFoundError('Inquiry not found');
    if (
      inquiry.ownerId.toString() !== actor.id &&
      actor.role !== 'admin'
    ) {
      throw new ForbiddenError('You can only manage your own inquiries');
    }
    const updated = await inquiryRepository.updateStatus(id, status);
    if (!updated) throw new NotFoundError('Inquiry not found');
    return updated;
  },
};
