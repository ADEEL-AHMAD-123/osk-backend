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

/**
 * The four "trust" stats rendered just under the hero (e.g. listings
 * count, agents count, markets covered, deal volume). Free-text values
 * so the admin can format them however they want — "12,400+", "12.4k",
 * "$4.2B", etc. — without us guessing the formatting.
 */
export interface SiteSettingsStat {
  value: string;
  label: string;
}

/**
 * Editable legal copy. Stored as plain markdown. We keep a timestamp
 * per page so we can show "Effective date: …" without forcing the
 * admin to type it inside the body.
 */
export interface SiteSettingsLegal {
  privacyMarkdown: string;
  termsMarkdown: string;
  privacyUpdatedAt: string;
  termsUpdatedAt: string;
}

export interface SiteSettingsDoc extends Document {
  _id: Types.ObjectId;
  /** Marker so we can singleton-enforce via a unique index. */
  singletonKey: 'default';
  activeTheme: ThemeName;
  siteTitle: string;
  companyName: string;
  /** Resolved media URL (absolute or /uploads/...). Empty string == no logo. */
  logoUrl: string;
  contact: SiteSettingsContact;
  appLinks: SiteSettingsAppLinks;
  geo: SiteSettingsGeo;
  homeStats: SiteSettingsStat[];
  legal: SiteSettingsLegal;
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

const statSchema = new Schema<SiteSettingsStat>(
  {
    value: { type: String, default: '', trim: true, maxlength: 24 },
    label: { type: String, default: '', trim: true, maxlength: 40 },
  },
  { _id: false },
);

const legalSchema = new Schema<SiteSettingsLegal>(
  {
    privacyMarkdown: { type: String, default: '' },
    termsMarkdown: { type: String, default: '' },
    privacyUpdatedAt: { type: String, default: '' },
    termsUpdatedAt: { type: String, default: '' },
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
    siteTitle: {
      type: String,
      required: true,
      trim: true,
      default: 'OSK — Real Estate',
      maxlength: 120,
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
    homeStats: {
      type: [statSchema],
      default: () => DEFAULT_HOME_STATS,
    },
    legal: {
      type: legalSchema,
      default: () => DEFAULT_LEGAL,
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

/**
 * Default trust-strip stats. Country-neutral wording on purpose — the
 * admin can localise via /admin/settings if their marketplace is
 * region-specific.
 */
export const DEFAULT_HOME_STATS: SiteSettingsStat[] = [
  { value: '12,400+', label: 'Curated listings' },
  { value: '850+', label: 'Verified agents' },
  { value: '40+', label: 'Active markets' },
  { value: '$4.2B', label: 'Closed last year' },
];

/**
 * Legal-page defaults — short, generic copy the admin will replace.
 * The body is plain markdown so the admin doesn't have to wrangle
 * HTML, and the timestamps live in the doc (not baked into the body)
 * so we can render "Effective date" without parsing the markdown.
 */
export const DEFAULT_LEGAL: SiteSettingsLegal = {
  privacyMarkdown: `## 1. What we collect

We collect the information you give us directly — your name, email, phone number (if you share it), the listings you save, and the inquiries you send. We also collect usage data and basic device information for security and analytics.

## 2. How we use it

Your information is used to operate the platform: to surface relevant listings, deliver your inquiries to the right owner or agent, prevent fraud and abuse, and improve the product over time. We do not sell your personal information.

## 3. Your rights

You may have the right to access, correct, delete, or export your personal information. Email our team to exercise these rights.`,
  termsMarkdown: `## 1. Using the platform

By accessing or using the platform you agree to these terms. If you don't agree, please don't use the service.

## 2. Your account

You are responsible for safeguarding your account credentials and for all activity that happens under your account.

## 3. Listings & content

You are responsible for the accuracy of any listing or message you submit. You must hold the rights to any media you upload and confirm that listings comply with local law.

## 4. Termination

We may suspend or terminate accounts that violate these terms, abuse the platform, or engage in fraudulent activity.

## 5. Limitations

The platform is provided "as is". To the maximum extent permitted by law, we exclude all warranties and limit our liability.`,
  privacyUpdatedAt: '',
  termsUpdatedAt: '',
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
