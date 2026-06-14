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
    /* About — flat dot-notation writes per leaf field so an admin
     * editing only one section doesn't blow away the others. The
     * `items` arrays are written as a whole (re-ordering / add /
     * remove only makes sense atomically). */
    if (patch.about) {
      if (patch.about.header) {
        for (const [k, v] of Object.entries(patch.about.header)) {
          if (typeof v === 'string') update[`about.header.${k}`] = v;
        }
      }
      if (patch.about.values) {
        if (typeof patch.about.values.eyebrow === 'string')
          update['about.values.eyebrow'] = patch.about.values.eyebrow;
        if (typeof patch.about.values.title === 'string')
          update['about.values.title'] = patch.about.values.title;
        if (Array.isArray(patch.about.values.items)) {
          update['about.values.items'] = patch.about.values.items.map((it) => ({
            title: it.title.trim(),
            body: it.body.trim(),
          }));
        }
      }
      if (patch.about.process) {
        if (typeof patch.about.process.eyebrow === 'string')
          update['about.process.eyebrow'] = patch.about.process.eyebrow;
        if (typeof patch.about.process.title === 'string')
          update['about.process.title'] = patch.about.process.title;
        if (Array.isArray(patch.about.process.items)) {
          update['about.process.items'] = patch.about.process.items.map((it) => ({
            title: it.title.trim(),
            body: it.body.trim(),
          }));
        }
      }
      if (patch.about.cta) {
        for (const [k, v] of Object.entries(patch.about.cta)) {
          if (typeof v === 'string') update[`about.cta.${k}`] = v;
        }
      }
    }

    const doc = await SiteSettingsModel.findOneAndUpdate(
      { singletonKey: 'default' },
      { $set: update, $setOnInsert: { singletonKey: 'default' } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();
    return toDTO(doc);
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
