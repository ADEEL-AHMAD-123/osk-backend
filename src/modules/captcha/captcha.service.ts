import { decryptSecret, encryptSecret } from '../../shared/crypto/secrets';
import { logger } from '../../config/logger';
import { CaptchaSettingsModel } from './captchaSettings.model';
import { toCaptchaSettingsDTO } from './captchaSettings.mapper';
import {
  generateLocalChallenge,
  verifyLocalAnswer,
} from './localCaptcha';
import type { UpdateCaptchaSettingsInput } from './captchaSettings.schema';
import type {
  CaptchaPublicConfig,
  CaptchaSettingsDTO,
} from './captchaSettings.types';

export interface CaptchaChallenge {
  /** Opaque HMAC-signed payload. Submitted back as `<token>|<answer>`. */
  token: string;
  /** Inline SVG markup the frontend can drop into the DOM. */
  svg: string;
}

/* ─────────────────────────────────────────────────────────────────────
 * Captcha service.
 *
 *  - `getSettings`        admin read — secret is masked
 *  - `getPublicConfig`    no-auth read — provider + siteKey only
 *  - `updateSettings`     admin write — secret is encrypted on the way in
 *  - `verifyToken`        verifies a Turnstile token against
 *                         challenges.cloudflare.com. Returns true when:
 *                           (a) the captcha is disabled (provider 'none'),
 *                               so callers don't need their own
 *                               "skip when off" branching, or
 *                           (b) the token check returns success.
 * ──────────────────────────────────────────────────────────────────── */

const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const captchaService = {
  /** Admin-facing — secret is masked. */
  async getSettings(): Promise<CaptchaSettingsDTO> {
    let doc = await CaptchaSettingsModel.findOne({
      singletonKey: 'default',
    }).exec();
    if (!doc) {
      doc = await CaptchaSettingsModel.create({ singletonKey: 'default' });
    }
    return toCaptchaSettingsDTO(doc);
  },

  /** Public-facing — never exposes the secret. */
  async getPublicConfig(): Promise<CaptchaPublicConfig> {
    let doc = await CaptchaSettingsModel.findOne({
      singletonKey: 'default',
    }).exec();
    if (!doc) {
      doc = await CaptchaSettingsModel.create({ singletonKey: 'default' });
    }
    const dto = toCaptchaSettingsDTO(doc);
    return {
      provider: dto.provider,
      siteKey: dto.siteKey,
      /* `local` doesn't need any admin-pasted keys to be enabled —
       *  the server signs the challenge itself with OSK_SECRETS_KEY.
       *  So unlike Turnstile, `ready` is just "provider !== 'none'". */
      enabled: dto.provider === 'local' ? true : dto.ready,
    };
  },

  /** Issue a fresh local-captcha challenge. Returns `null` if the
   *  current provider isn't `local` so the route layer can 404. */
  async getChallenge(): Promise<CaptchaChallenge | null> {
    const doc = await CaptchaSettingsModel.findOne({
      singletonKey: 'default',
    }).exec();
    if (!doc || doc.provider !== 'local') return null;
    return generateLocalChallenge();
  },

  async updateSettings(
    input: UpdateCaptchaSettingsInput,
  ): Promise<CaptchaSettingsDTO> {
    const update: Record<string, unknown> = {};
    if (typeof input.provider === 'string') update.provider = input.provider;
    if (typeof input.siteKey === 'string') update.siteKey = input.siteKey.trim();
    if (typeof input.secretKey === 'string') {
      update.secretKey = encryptSecret(input.secretKey.trim());
    }
    const doc = await CaptchaSettingsModel.findOneAndUpdate(
      { singletonKey: 'default' },
      { $set: update, $setOnInsert: { singletonKey: 'default' } },
      { new: true, upsert: true, runValidators: true },
    ).exec();
    return toCaptchaSettingsDTO(doc);
  },

  /**
   * Verify a captcha token submitted with a public form.
   *
   * Returns `true` when the captcha is disabled (so callers can write
   * a single branch — "fail if !verifyToken(t)"). Returns `true` on
   * successful Turnstile verification. Returns `false` on any other
   * outcome (no token, wrong token, network error, missing secret).
   *
   * The `ip` argument is the client's IP — Turnstile uses it for
   * additional heuristics but it's optional.
   */
  async verifyToken(
    token: string | null | undefined,
    ip?: string | null,
  ): Promise<boolean> {
    const doc = await CaptchaSettingsModel.findOne({
      singletonKey: 'default',
    }).exec();
    if (!doc || doc.provider === 'none') return true;

    /* Built-in text captcha — frontend sends "<token>|<answer>" as
     * the same `captchaToken` field. No outbound request, just an
     * HMAC + expiry check. */
    if (doc.provider === 'local') {
      return verifyLocalAnswer(token);
    }

    if (doc.provider !== 'turnstile') return true;

    const secret = decryptSecret(doc.secretKey ?? '').trim();
    if (!secret) {
      logger.warn(
        { provider: doc.provider },
        'captcha provider configured but secret key missing — refusing to verify',
      );
      return false;
    }
    if (!token || typeof token !== 'string' || token.length === 0) {
      return false;
    }

    try {
      const body = new URLSearchParams();
      body.set('secret', secret);
      body.set('response', token);
      if (ip) body.set('remoteip', ip);

      const res = await fetch(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });
      if (!res.ok) {
        logger.warn(
          { status: res.status },
          'turnstile verify endpoint returned non-2xx',
        );
        return false;
      }
      const payload = (await res.json()) as {
        success?: boolean;
        'error-codes'?: string[];
      };
      if (!payload.success) {
        logger.info(
          { errors: payload['error-codes'] },
          'turnstile token rejected',
        );
        return false;
      }
      return true;
    } catch (err) {
      logger.warn({ err }, 'turnstile verify request failed');
      return false;
    }
  },
};
