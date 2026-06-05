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

/**
 * Mobile-app URLs for the "Get the OSK App" poster. All three optional —
 * when every field is empty the poster auto-hides on the home page.
 *
 *  - appStoreUrl   → button on the poster, links to iOS App Store listing
 *  - googlePlayUrl → button on the poster, links to Play Store listing
 *  - appQrUrl      → target URL the QR code resolves to (typically a smart
 *                    link page that detects OS and forwards on; if empty
 *                    we fall back to appStoreUrl, then googlePlayUrl)
 */
export interface SiteSettingsAppLinks {
  appStoreUrl: string;
  googlePlayUrl: string;
  appQrUrl: string;
}

/**
 * Geographic scope of the marketplace.
 *
 *  - mode === 'all'         → every country in the dataset is bookable
 *                             and browseable (current default).
 *  - mode === 'restricted'  → only the ISO-2 codes in allowedCountries
 *                             are shown in pickers; the property list
 *                             endpoint filters results to that set on
 *                             every read, so an attacker poking the API
 *                             directly can't get listings from other
 *                             countries back either.
 *
 * `allowedCountries` is only enforced when mode === 'restricted'. We
 * store it on both modes so the admin can switch back without losing
 * the selection.
 */
export interface SiteSettingsGeo {
  mode: 'all' | 'restricted';
  /** ISO 3166-1 alpha-2, uppercase. */
  allowedCountries: string[];
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
  appLinks: SiteSettingsAppLinks;
  geo: SiteSettingsGeo;
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

const appLinksSchema = new Schema<SiteSettingsAppLinks>(
  {
    appStoreUrl: { type: String, default: '', trim: true, maxlength: 500 },
    googlePlayUrl: { type: String, default: '', trim: true, maxlength: 500 },
    appQrUrl: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { _id: false },
);

const geoSchema = new Schema<SiteSettingsGeo>(
  {
    mode: {
      type: String,
      enum: ['all', 'restricted'],
      default: 'all',
    },
    allowedCountries: {
      type: [String],
      default: [],
      /* ISO-2 codes are always uppercase; mongoose can't validate items
       * directly but the service layer normalises on write. */
    },
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
    appLinks: {
      type: appLinksSchema,
      default: () => ({ appStoreUrl: '', googlePlayUrl: '', appQrUrl: '' }),
    },
    geo: {
      type: geoSchema,
      default: () => ({ mode: 'all', allowedCountries: [] }),
    },
  },
  { timestamps: true },
);

export const SiteSettingsModel = model<SiteSettingsDoc>(
  'SiteSettings',
  settingsSchema,
);

/** Defaults baked into the seed of the singleton on first read. */
export const DEFAULT_APP_LINKS: SiteSettingsAppLinks = {
  appStoreUrl: '',
  googlePlayUrl: '',
  appQrUrl: '',
};

export const DEFAULT_GEO: SiteSettingsGeo = {
  mode: 'all',
  allowedCountries: [],
};

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
