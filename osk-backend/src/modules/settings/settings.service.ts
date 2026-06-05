import {
  DEFAULT_APP_LINKS,
  DEFAULT_CONTACT,
  DEFAULT_GEO,
  DEFAULT_HOME_STATS,
  DEFAULT_LEGAL,
  SiteSettingsModel,
  THEME_NAMES,
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
  updatedAt: string;
}

function toDTO(doc: SiteSettingsDoc): SiteSettingsDTO {
  return {
    activeTheme: doc.activeTheme,
    siteTitle: doc.siteTitle || 'OSK — Real Estate',
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
    updatedAt: doc.updatedAt.toISOString(),
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
          siteTitle: 'OSK — Real Estate',
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
