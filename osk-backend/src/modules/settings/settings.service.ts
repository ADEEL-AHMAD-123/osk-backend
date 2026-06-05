import {
  DEFAULT_APP_LINKS,
  DEFAULT_CONTACT,
  DEFAULT_GEO,
  SiteSettingsModel,
  THEME_NAMES,
  type SiteSettingsAppLinks,
  type SiteSettingsContact,
  type SiteSettingsDoc,
  type SiteSettingsGeo,
  type ThemeName,
} from './settings.model';

/** Public-facing DTO — what the GET /settings endpoint returns. */
export interface SiteSettingsDTO {
  activeTheme: ThemeName;
  companyName: string;
  logoUrl: string;
  contact: SiteSettingsContact;
  appLinks: SiteSettingsAppLinks;
  geo: SiteSettingsGeo;
  updatedAt: string;
}

function toDTO(doc: SiteSettingsDoc): SiteSettingsDTO {
  return {
    activeTheme: doc.activeTheme,
    companyName: doc.companyName,
    logoUrl: doc.logoUrl,
    contact: doc.contact,
    /* Older docs (created before the appLinks column existed) might be
     * missing the field — fall back to a fully-empty object so the UI
     * just treats them as "not configured" and hides the poster. */
    appLinks: doc.appLinks ?? DEFAULT_APP_LINKS,
    geo: doc.geo ?? DEFAULT_GEO,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** Whitelist for PATCH /admin/settings. */
export interface SettingsPatch {
  activeTheme?: ThemeName;
  companyName?: string;
  logoUrl?: string;
  contact?: Partial<SiteSettingsContact>;
  appLinks?: Partial<SiteSettingsAppLinks>;
  geo?: Partial<SiteSettingsGeo>;
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
          companyName: 'OSK',
          logoUrl: '',
          contact: DEFAULT_CONTACT,
          appLinks: DEFAULT_APP_LINKS,
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
