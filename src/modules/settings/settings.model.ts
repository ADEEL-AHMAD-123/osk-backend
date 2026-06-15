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

/**
 * CORS allowlist editable from the admin dashboard.
 *
 *  - `allowedOrigins`: each entry is either an exact origin
 *    ("https://app.osk.dev") or a wildcard pattern with `*` matching
 *    a single hostname segment ("https://*.vercel.app",
 *    "https://*.osk.dev"). The matcher treats `*` as `[a-zA-Z0-9-]+`
 *    so `https://*.vercel.app` matches `https://osk-frontend-abc.vercel.app`
 *    but NOT `https://attacker.example/vercel.app/foo`.
 *  - `allowAll`: emergency switch. When true, the CORS middleware
 *    echoes back any Origin header. Use sparingly — it makes the API
 *    addressable from any domain (which is what some operators want
 *    for preview deploys but is unsafe for credentialed auth flows in
 *    untrusted environments).
 *  - `allowSubdomainsOf`: optional convenience list. Each entry is a
 *    bare domain ("osk.dev"); the matcher treats it as both the
 *    apex origin (https + http) AND any single-level subdomain. Lets
 *    the admin write "osk.dev" and stop worrying about preview URLs.
 *
 * The CORS middleware reads this through a 30s in-memory cache so the
 * per-request check stays cheap; the cache is invalidated on every
 * PATCH /admin/settings.
 */
export interface SiteSettingsCors {
  allowedOrigins: string[];
  allowSubdomainsOf: string[];
  allowAll: boolean;
}

/**
 * About-page content. The page used to ship with hardcoded copy; this
 * shape exposes every visible string so the admin can rewrite the
 * marketing without a deploy.
 *
 *  - `header.*`        the eyebrow / title / lede above the stats grid
 *  - `values.*`        the "What we believe" cards (3 by default)
 *  - `process.*`       the new "How it works" numbered steps
 *  - `cta.*`           the bottom call-to-action box
 *
 * Stats stay on `homeStats` (same content as the home trust strip).
 */
export interface SiteSettingsAboutItem {
  title: string;
  body: string;
}

export interface SiteSettingsAbout {
  header: {
    eyebrow: string;
    titlePrefix: string;
    titleEmphasis: string;
    lede: string;
  };
  values: {
    eyebrow: string;
    title: string;
    items: SiteSettingsAboutItem[];
  };
  process: {
    eyebrow: string;
    title: string;
    items: SiteSettingsAboutItem[];
  };
  cta: {
    title: string;
    body: string;
  };
}

/**
 * Home-page "Trusted partners" strip.
 *
 *  - eyebrow / title / sub  the header copy above the partner tiles
 *  - items                  array of (name, role) pairs — the tiles
 *                           render an initials avatar + name + role
 *
 * Edited from /admin/settings → Home tab. Renders default content
 * when not yet configured, mirroring the About-page pattern.
 */
export interface SiteSettingsPartnerItem {
  name: string;
  role: string;
}

export interface SiteSettingsPartners {
  eyebrow: string;
  title: string;
  sub: string;
  items: SiteSettingsPartnerItem[];
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
  cors: SiteSettingsCors;
  about: SiteSettingsAbout;
  partners: SiteSettingsPartners;
  createdAt: Date;
  updatedAt: Date;
}

/* Each contact field is optional at the schema level so a fresh
 * install can start with no contact details and the admin fills them
 * in via /admin/settings. Empty strings make the public footer hide
 * the relevant line rather than broadcast a placeholder. */
const contactSchema = new Schema<SiteSettingsContact>(
  {
    email: { type: String, default: '', trim: true, lowercase: true },
    phoneTel: { type: String, default: '', trim: true },
    phoneDisplay: { type: String, default: '', trim: true },
    addressLine1: { type: String, default: '', trim: true },
    addressCity: { type: String, default: '', trim: true },
    addressRegion: { type: String, default: '', trim: true },
    addressPostalCode: { type: String, default: '', trim: true },
    addressCountry: { type: String, default: '', trim: true },
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

const corsSchema = new Schema<SiteSettingsCors>(
  {
    allowedOrigins: { type: [String], default: [] },
    allowSubdomainsOf: { type: [String], default: [] },
    allowAll: { type: Boolean, default: false },
  },
  { _id: false },
);

const aboutItemSchema = new Schema<SiteSettingsAboutItem>(
  {
    title: { type: String, default: '', trim: true, maxlength: 160 },
    body: { type: String, default: '', trim: true, maxlength: 2000 },
  },
  { _id: false },
);

/* ─── About sub-sections as plain nested paths ────────────────────────
 *
 * IMPORTANT: these sections are declared as plain nested-object paths
 * (no `new Schema(...)` wrapper). Earlier they were sub-Schemas, which
 * Mongoose treats as separate sub-subdocuments with their own cast
 * pipeline — and that pipeline was silently dropping string-field
 * replacements when the parent subdoc had already been instantiated.
 * The result was that `doc.about = mergedAbout` followed by `.save()`
 * persisted only the items arrays (whose change tracker is per-array,
 * not per-subdoc) and silently no-op'd every string field on
 * `header`, `values`, `process`, and `cta`.
 *
 * Plain nested-path declarations are documented as the safer pattern
 * for content that's written as a single blob from an admin form:
 * Mongoose flattens them into the parent and tracks each leaf
 * normally, so string changes always propagate to `save()`.
 *
 * The `aboutItemSchema` array IS still a sub-schema because items
 * are reordered/added/removed and need per-element identity. */
const aboutSchema = new Schema<SiteSettingsAbout>(
  {
    header: {
      eyebrow: { type: String, default: '', trim: true, maxlength: 80 },
      titlePrefix: { type: String, default: '', trim: true, maxlength: 120 },
      titleEmphasis: { type: String, default: '', trim: true, maxlength: 120 },
      lede: { type: String, default: '', trim: true, maxlength: 1000 },
    },
    values: {
      eyebrow: { type: String, default: '', trim: true, maxlength: 80 },
      title: { type: String, default: '', trim: true, maxlength: 160 },
      items: { type: [aboutItemSchema], default: [] },
    },
    process: {
      eyebrow: { type: String, default: '', trim: true, maxlength: 80 },
      title: { type: String, default: '', trim: true, maxlength: 160 },
      items: { type: [aboutItemSchema], default: [] },
    },
    cta: {
      title: { type: String, default: '', trim: true, maxlength: 160 },
      body: { type: String, default: '', trim: true, maxlength: 1000 },
    },
  },
  { _id: false },
);

/* `partnerItemSchema` is a sub-schema because items are reordered /
 * added / removed and need per-element identity. Top-level partner
 * fields stay as plain nested paths for the same reason `about.header`
 * does — see the comment above the about schema. */
const partnerItemSchema = new Schema<SiteSettingsPartnerItem>(
  {
    name: { type: String, default: '', trim: true, maxlength: 120 },
    role: { type: String, default: '', trim: true, maxlength: 160 },
  },
  { _id: false },
);

const partnersSchema = new Schema<SiteSettingsPartners>(
  {
    eyebrow: { type: String, default: '', trim: true, maxlength: 80 },
    title: { type: String, default: '', trim: true, maxlength: 160 },
    sub: { type: String, default: '', trim: true, maxlength: 1000 },
    items: { type: [partnerItemSchema], default: [] },
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
      default: 'OSK Property Real Estate | Buy, Sell & Rent Homes & Properties.',
      maxlength: 120,
    },
    companyName: { type: String, required: true, trim: true, default: 'OSK' },
    logoUrl: { type: String, default: '' },
    contact: {
      type: contactSchema,
      default: () => ({
        email: '',
        phoneTel: '',
        phoneDisplay: '',
        addressLine1: '',
        addressCity: '',
        addressRegion: '',
        addressPostalCode: '',
        addressCountry: '',
      }),
    },
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
    about: {
      type: aboutSchema,
      default: () => DEFAULT_ABOUT,
    },
    partners: {
      type: partnersSchema,
      default: () => DEFAULT_PARTNERS,
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

/**
 * Default copy for the About page. Country-neutral; the admin can
 * rewrite anything from /admin/settings.
 */
export const DEFAULT_ABOUT: SiteSettingsAbout = {
  header: {
    eyebrow: 'About us',
    titlePrefix: 'A better way to',
    titleEmphasis: 'find a home.',
    lede: 'We bring together owners, verified agents and serious buyers — and we keep the experience quiet, honest, and direct.',
  },
  values: {
    eyebrow: 'What we believe',
    title: 'Three things shape every page',
    items: [
      {
        title: 'Curated, not crowded',
        body: 'Every listing is reviewed by a person before it goes live. We keep the catalog tight so what you find is worth your time.',
      },
      {
        title: 'Direct lines',
        body: 'No spam middlemen. You talk to owners and verified agents by chat, call, WhatsApp or email — your call.',
      },
      {
        title: 'Privacy first',
        body: 'Your details stay with the listing owner. Numbers are masked, emails are relayed, consent is logged.',
      },
    ],
  },
  process: {
    eyebrow: 'How it works',
    title: 'Four quiet steps from search to move-in',
    items: [
      {
        title: 'Browse curated inventory',
        body: 'Filter by price, neighborhood, or amenities — every listing is hand-reviewed before it appears.',
      },
      {
        title: 'Connect directly',
        body: 'Reach the owner or agent on the channel you prefer: chat, call, WhatsApp, or email relay.',
      },
      {
        title: 'Schedule on your terms',
        body: 'Book a viewing time that works for you — no back-and-forth, no pressure.',
      },
      {
        title: 'Close with confidence',
        body: 'Move forward with verified counterparties and a clear paper trail from first contact to handover.',
      },
    ],
  },
  cta: {
    title: 'List a property',
    body: 'Reach serious buyers — and stay in control of how people contact you.',
  },
};

/**
 * Default "Trusted partners" strip — generic placeholder roles so
 * we never claim a real partnership we don't have. Admin can rewrite
 * via /admin/settings → Home tab.
 */
export const DEFAULT_PARTNERS: SiteSettingsPartners = {
  eyebrow: 'Trusted partners',
  title: 'A network you can close with.',
  sub: 'From financing to the final inspection, OSK works with vetted local pros so every step of the move stays under one roof.',
  items: [
    { name: 'Atlas Mortgage', role: 'Mortgage broker' },
    { name: 'Liberty Title', role: 'Title insurance' },
    { name: 'Apex Inspections', role: 'Home inspection' },
    { name: 'First Federal Bank', role: 'Lender' },
    { name: 'Sterling Insure', role: 'Home insurance' },
    { name: 'Cornerstone Movers', role: 'Relocation' },
  ],
};

/* Empty defaults: a fresh install starts with no contact details,
 * the admin fills them in via /admin/settings. The footer renders
 * only the lines that have non-empty values, so an unconfigured
 * install never shows someone else's address. */
export const DEFAULT_CONTACT: SiteSettingsContact = {
  email: '',
  phoneTel: '',
  phoneDisplay: '',
  addressLine1: '',
  addressCity: '',
  addressRegion: '',
  addressPostalCode: '',
  addressCountry: '',
};
