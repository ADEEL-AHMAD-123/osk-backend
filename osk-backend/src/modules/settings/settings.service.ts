import {
  DEFAULT_CONTACT,
  SiteSettingsModel,
  THEME_NAMES,
  type SiteSettingsContact,
  type SiteSettingsDoc,
  type ThemeName,
} from './settings.model';

/** Public-facing DTO — what the GET /settings endpoint returns. */
export interface SiteSettingsDTO {
  activeTheme: ThemeName;
  companyName: string;
  logoUrl: string;
  contact: SiteSettingsContact;
  updatedAt: string;
}

function toDTO(doc: SiteSettingsDoc): SiteSettingsDTO {
  return {
    activeTheme: doc.activeTheme,
    companyName: doc.companyName,
    logoUrl: doc.logoUrl,
    contact: doc.contact,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** Whitelist for PATCH /admin/settings. */
export interface SettingsPatch {
  activeTheme?: ThemeName;
  companyName?: string;
  logoUrl?: string;
  contact?: Partial<SiteSettingsContact>;
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

    const doc = await SiteSettingsModel.findOneAndUpdate(
      { singletonKey: 'default' },
      { $set: update, $setOnInsert: { singletonKey: 'default' } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();
    return toDTO(doc);
  },
};
