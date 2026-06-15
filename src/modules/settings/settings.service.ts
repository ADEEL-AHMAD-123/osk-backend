import {
  DEFAULT_ABOUT,
  DEFAULT_APP_LINKS,
  DEFAULT_CONTACT,
  DEFAULT_GEO,
  DEFAULT_HOME_STATS,
  DEFAULT_LEGAL,
  SiteSettingsModel,
  THEME_NAMES,
  type SiteSettingsAbout,
  type SiteSettingsAboutItem,
  type SiteSettingsAppLinks,
  type SiteSettingsContact,
  type SiteSettingsDoc,
  type SiteSettingsGeo,
  type SiteSettingsLegal,
  type SiteSettingsStat,
  type ThemeName,
} from './settings.model';

/** Public-facing DTO — what the GET /settings endpoint returns. */
export interface SiteSettingsDTO {
  activeTheme: ThemeName;
  siteTitle: string;
  companyName: string;
  logoUrl: string;
  contact: SiteSettingsContact;
  appLinks: SiteSettingsAppLinks;
  geo: SiteSettingsGeo;
  homeStats: SiteSettingsStat[];
  legal: SiteSettingsLegal;
  about: SiteSettingsAbout;
  updatedAt: string;
}

function toDTO(doc: SiteSettingsDoc): SiteSettingsDTO {
  return {
    activeTheme: doc.activeTheme,
    siteTitle:
      doc.siteTitle ||
      'OSK Property Real Estate | Buy, Sell & Rent Homes & Properties.',
    companyName: doc.companyName,
    logoUrl: doc.logoUrl,
    contact: doc.contact,
    /* Older docs (created before the appLinks column existed) might be
     * missing the field — fall back to a fully-empty object so the UI
     * just treats them as "not configured" and hides the poster. */
    appLinks: doc.appLinks ?? DEFAULT_APP_LINKS,
    geo: doc.geo ?? DEFAULT_GEO,
    /* Same pattern as appLinks: older singletons might be missing these
     * fields. Fall back to defaults so the UI never crashes on null. */
    homeStats:
      Array.isArray(doc.homeStats) && doc.homeStats.length === 4
        ? doc.homeStats
        : DEFAULT_HOME_STATS,
    legal: doc.legal ?? DEFAULT_LEGAL,
    /* about lands here as a Mongoose subdoc — surface any missing
     * sub-sections through the defaults so the public About page
     * never has to render null. */
    about: mergeAbout(doc.about),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** Merge a (possibly partial) stored about doc against the defaults
 *  so older singletons that pre-date this field still render. */
function mergeAbout(stored: SiteSettingsAbout | undefined): SiteSettingsAbout {
  if (!stored) return DEFAULT_ABOUT;
  return {
    header: { ...DEFAULT_ABOUT.header, ...(stored.header ?? {}) },
    values: {
      eyebrow: stored.values?.eyebrow ?? DEFAULT_ABOUT.values.eyebrow,
      title: stored.values?.title ?? DEFAULT_ABOUT.values.title,
      items:
        Array.isArray(stored.values?.items) && stored.values!.items.length > 0
          ? stored.values!.items
          : DEFAULT_ABOUT.values.items,
    },
    process: {
      eyebrow: stored.process?.eyebrow ?? DEFAULT_ABOUT.process.eyebrow,
      title: stored.process?.title ?? DEFAULT_ABOUT.process.title,
      items:
        Array.isArray(stored.process?.items) && stored.process!.items.length > 0
          ? stored.process!.items
          : DEFAULT_ABOUT.process.items,
    },
    cta: { ...DEFAULT_ABOUT.cta, ...(stored.cta ?? {}) },
  };
}

/** Whitelist for PATCH /admin/settings. */
export interface SettingsPatch {
  activeTheme?: ThemeName;
  siteTitle?: string;
  companyName?: string;
  logoUrl?: string;
  contact?: Partial<SiteSettingsContact>;
  appLinks?: Partial<SiteSettingsAppLinks>;
  geo?: Partial<SiteSettingsGeo>;
  /** Trust-strip stats — exactly four entries when sent. */
  homeStats?: SiteSettingsStat[];
  legal?: Partial<SiteSettingsLegal>;
  about?: {
    header?: Partial<SiteSettingsAbout['header']>;
    values?: {
      eyebrow?: string;
      title?: string;
      items?: SiteSettingsAboutItem[];
    };
    process?: {
      eyebrow?: string;
      title?: string;
      items?: SiteSettingsAboutItem[];
    };
    cta?: Partial<SiteSettingsAbout['cta']>;
  };
}

export const settingsService = {
  /**
   * Idempotent get — lazily creates the singleton on first hit so a fresh
   * install just works. After that all reads return the same doc.
   */
  async get(): Promise<SiteSettingsDTO> {
    const doc = await SiteSettingsModel.findOneAndUpdate(
      { singletonKey: 'default' },
      {
        $setOnInsert: {
          singletonKey: 'default',
          activeTheme: 'theme-luxe-light',
          siteTitle: 'OSK Property Real Estate | Buy, Sell & Rent Homes & Properties.',
          companyName: 'OSK',
          logoUrl: '',
          contact: DEFAULT_CONTACT,
          appLinks: DEFAULT_APP_LINKS,
          homeStats: DEFAULT_HOME_STATS,
          legal: DEFAULT_LEGAL,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();
    return toDTO(doc);
  },

  /** PATCH — only whitelisted fields land in the doc. */
  async update(patch: SettingsPatch): Promise<SiteSettingsDTO> {
    /* Build a $set object on demand so we don't blow away nested
     * contact fields the caller didn't specify. */
    const update: Record<string, unknown> = {};
    if (patch.activeTheme && THEME_NAMES.includes(patch.activeTheme)) {
      update.activeTheme = patch.activeTheme;
    }
    if (typeof patch.siteTitle === 'string') {
      update.siteTitle = patch.siteTitle.trim();
    }
    if (typeof patch.companyName === 'string') {
      update.companyName = patch.companyName.trim();
    }
    if (typeof patch.logoUrl === 'string') {
      update.logoUrl = patch.logoUrl;
    }
    if (patch.contact) {
      for (const [k, v] of Object.entries(patch.contact)) {
        if (typeof v === 'string') update[`contact.${k}`] = v;
      }
    }
    /* Same nested-merge pattern as contact — write only the keys the
     * caller actually sent so we don't blow away the other URLs. */
    if (patch.appLinks) {
      for (const [k, v] of Object.entries(patch.appLinks)) {
        if (typeof v === 'string') update[`appLinks.${k}`] = v;
      }
    }
    /* Geo restriction: mode + allowedCountries are written as a pair
     * but individually patchable. The schema layer already normalised
     * the country codes (uppercased + deduped). */
    if (patch.geo) {
      if (patch.geo.mode === 'all' || patch.geo.mode === 'restricted') {
        update['geo.mode'] = patch.geo.mode;
      }
      if (Array.isArray(patch.geo.allowedCountries)) {
        update['geo.allowedCountries'] = patch.geo.allowedCountries;
      }
    }
    /* Home stats are written as a whole 4-entry array — partial writes
     * would be ambiguous (which slot is which?). The Zod schema already
     * guarantees length === 4 when it's present. */
    if (Array.isArray(patch.homeStats)) {
      update.homeStats = patch.homeStats;
    }
    /* Legal copy follows the nested-merge pattern so an admin can update
     * privacy without nuking terms (or vice-versa). */
    if (patch.legal) {
      for (const [k, v] of Object.entries(patch.legal)) {
        if (typeof v === 'string') update[`legal.${k}`] = v;
      }
    }
    if (Array.isArray(patch.homeStats) && patch.homeStats.length === 4) {
      update.homeStats = patch.homeStats.map((stat) => ({
        value: stat.value.trim(),
        label: stat.label.trim(),
      }));
    }
    if (patch.legal) {
      for (const [k, v] of Object.entries(patch.legal)) {
        if (typeof v === 'string') update[`legal.${k}`] = v.trim();
      }
    }
    /* About — write as a whole sub-document so Mongoose's nested
     * subdoc casting actually runs.
     *
     * The dot-notation pattern we use for `contact`, `appLinks`,
     * `legal` etc. works because those subdocs already exist on the
     * singleton (they were defined long ago). For an `about` field
     * added later, an existing singleton has `about: undefined`, and
     * Mongoose's `$set: { 'about.values.items': [...] }` against a
     * missing parent silently no-ops without throwing — that's the
     * bug that made admin saves look successful but not stick.
     *
     * The fix: deep-merge the partial patch against the current
     * about + defaults, then $set the entire `about` blob atomically.
     * That always autovivifies the parent and runs schema casting
     * through aboutSchema cleanly. */
    /* For everything OTHER than `about`, use findOneAndUpdate with
     * dot-notation $set. That's been working for months and we don't
     * want to refactor working code. */
    const doc = await SiteSettingsModel.findOneAndUpdate(
      { singletonKey: 'default' },
      { $set: update, $setOnInsert: { singletonKey: 'default' } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();

    /* `about` gets a second pass via load + mutate + .save() because
     *  findOneAndUpdate with nested-subdocument $set has bitten us:
     *  when the existing singleton doc has `about: undefined` (any
     *  singleton created before this field was added in code), even
     *  writing the entire about blob through $set can silently no-op
     *  because Mongoose's path resolver doesn't always autovivify a
     *  brand-new nested subdoc reliably. Loading the doc, assigning
     *  to `doc.about` directly, and calling `.save()` always works —
     *  it runs Mongoose's full schema casting and we get back the
     *  document in the exact state we set it. */
    if (patch.about) {
      const base = mergeAbout(doc.about);
      const merged: SiteSettingsAbout = {
        header: {
          eyebrow: patch.about.header?.eyebrow ?? base.header.eyebrow,
          titlePrefix:
            patch.about.header?.titlePrefix ?? base.header.titlePrefix,
          titleEmphasis:
            patch.about.header?.titleEmphasis ?? base.header.titleEmphasis,
          lede: patch.about.header?.lede ?? base.header.lede,
        },
        values: {
          eyebrow: patch.about.values?.eyebrow ?? base.values.eyebrow,
          title: patch.about.values?.title ?? base.values.title,
          items: Array.isArray(patch.about.values?.items)
            ? patch.about.values!.items.map((it) => ({
                title: it.title.trim(),
                body: it.body.trim(),
              }))
            : base.values.items,
        },
        process: {
          eyebrow: patch.about.process?.eyebrow ?? base.process.eyebrow,
          title: patch.about.process?.title ?? base.process.title,
          items: Array.isArray(patch.about.process?.items)
            ? patch.about.process!.items.map((it) => ({
                title: it.title.trim(),
                body: it.body.trim(),
              }))
            : base.process.items,
        },
        cta: {
          title: patch.about.cta?.title ?? base.cta.title,
          body: patch.about.cta?.body ?? base.cta.body,
        },
      };
      doc.about = merged;
      /* Mongoose's change tracker is per-subschema. Marking just
       *  `about` is NOT enough — when `about` is itself a nested
       *  Schema with sub-Schemas (one per section), the change-tracker
       *  cascades down to the leaf type. We have to mark each
       *  sub-section explicitly so the save actually persists header
       *  / values / process / cta. Without these, only fields whose
       *  change is "obvious" to Mongoose (e.g. array reassignments
       *  on items) end up in the write — that's why values + process
       *  items were saving but the header strings and cta strings
       *  were silently dropped. */
      doc.markModified('about');
      doc.markModified('about.header');
      doc.markModified('about.values');
      doc.markModified('about.process');
      doc.markModified('about.cta');
      await doc.save();
    }

    // Return a fresh snapshot so callers never receive stale nested data.
    const latest = await SiteSettingsModel.findOne({ singletonKey: 'default' }).exec();
    return toDTO(latest ?? doc);
  },

  /**
   * Read-only geo restriction for downstream modules (property list,
   * etc.). Returns the resolved geo block — defaults to {mode:'all'} if
   * the doc doesn't have one yet, so callers can treat it uniformly.
   */
  async getGeo(): Promise<SiteSettingsGeo> {
    const dto = await this.get();
    return dto.geo;
  },
};
