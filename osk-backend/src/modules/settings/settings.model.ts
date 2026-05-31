import { Schema, model, type Document, type Types } from 'mongoose';

export const THEME_NAMES = [
  'theme-luxe-light',
  'theme-luxe-dark',
  'theme-emerald',
  'theme-sandstone',
] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export interface SiteSettingsContact {
  email: string;
  phoneTel: string;
  phoneDisplay: string;
  addressLine1: string;
  addressCity: string;
  addressRegion: string;
  addressPostalCode: string;
  addressCountry: string;
}

export interface SiteSettingsDoc extends Document {
  _id: Types.ObjectId;
  /** Marker so we can singleton-enforce via a unique index. */
  singletonKey: 'default';
  activeTheme: ThemeName;
  companyName: string;
  /** Resolved media URL (absolute or /uploads/...). Empty string == no logo. */
  logoUrl: string;
  contact: SiteSettingsContact;
  createdAt: Date;
  updatedAt: Date;
}

const contactSchema = new Schema<SiteSettingsContact>(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    phoneTel: { type: String, required: true, trim: true },
    phoneDisplay: { type: String, required: true, trim: true },
    addressLine1: { type: String, required: true, trim: true },
    addressCity: { type: String, required: true, trim: true },
    addressRegion: { type: String, required: true, trim: true },
    addressPostalCode: { type: String, required: true, trim: true },
    addressCountry: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const settingsSchema = new Schema<SiteSettingsDoc>(
  {
    singletonKey: {
      type: String,
      enum: ['default'],
      required: true,
      unique: true,
      default: 'default',
    },
    activeTheme: {
      type: String,
      enum: THEME_NAMES,
      default: 'theme-luxe-light',
    },
    companyName: { type: String, required: true, trim: true, default: 'OSK' },
    logoUrl: { type: String, default: '' },
    contact: { type: contactSchema, required: true },
  },
  { timestamps: true },
);

export const SiteSettingsModel = model<SiteSettingsDoc>(
  'SiteSettings',
  settingsSchema,
);

/** Defaults baked into the seed of the singleton on first read. */
export const DEFAULT_CONTACT: SiteSettingsContact = {
  email: 'hello@osk.dev',
  phoneTel: '+13659557829',
  phoneDisplay: '+1 (365) 955-7829',
  addressLine1: '101 Catherine Street, 6th Floor',
  addressCity: 'Ottawa',
  addressRegion: 'Ontario',
  addressPostalCode: 'K2P 2K9',
  addressCountry: 'Canada',
};
