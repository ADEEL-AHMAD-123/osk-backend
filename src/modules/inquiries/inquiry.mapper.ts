import type { InquiryDoc } from './inquiry.model';

export interface InquiryDTO {
  id: string;
  propertyId: string;
  ownerId: string;
  channel: InquiryDoc['channel'];
  status: InquiryDoc['status'];
  name: string;
  email?: string;
  phone?: string;
  message?: string;
  slots?: string[];
  source?: InquiryDoc['source'];
  createdAt: string;
  updatedAt: string;
}

export function toInquiryDTO(doc: InquiryDoc): InquiryDTO {
  return {
    id: doc._id.toString(),
    propertyId: doc.propertyId.toString(),
    ownerId: doc.ownerId.toString(),
    channel: doc.channel,
    status: doc.status,
    name: doc.name,
    email: doc.email,
    phone: doc.phone,
    message: doc.message,
    slots: doc.slots,
    source: doc.source,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
