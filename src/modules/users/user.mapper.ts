import type { UserDoc } from '../auth/user.model';

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: UserDoc['role'];
  status: UserDoc['status'];
  emailVerified: boolean;
  avatarUrl?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  companyName?: string;
  companyRegistration?: string;
  createdAt: string;
  updatedAt: string;
}

/** Public-facing agent profile — no email / status / verification flags. */
export interface AgentPublicDTO {
  id: string;
  name: string;
  avatarUrl?: string;
  createdAt: string;
}

export function toUserDTO(doc: UserDoc): UserDTO {
  return {
    id: doc._id.toString(),
    name: doc.name,
    email: doc.email,
    role: doc.role,
    status: doc.status,
    emailVerified: doc.emailVerified,
    avatarUrl: doc.avatarUrl,
    phone: doc.phone,
    address: doc.address,
    city: doc.city,
    state: doc.state,
    country: doc.country,
    companyName: doc.companyName,
    companyRegistration: doc.companyRegistration,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function toAgentPublicDTO(doc: UserDoc): AgentPublicDTO {
  return {
    id: doc._id.toString(),
    name: doc.name,
    avatarUrl: doc.avatarUrl,
    createdAt: doc.createdAt.toISOString(),
  };
}
