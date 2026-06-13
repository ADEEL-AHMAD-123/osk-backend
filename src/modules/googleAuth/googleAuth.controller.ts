import type { RequestHandler } from 'express';
import { authService } from '../auth/auth.service';
import { setRefreshCookie } from '../auth/auth.controller';
import { sendSuccess } from '../../shared/response';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { googleAuthService } from './googleAuth.service';
import { updateGoogleAuthSettingsSchema } from './googleAuthSettings.schema';

/* ─────────────────────────────────────────────────────────────────
 * Google OAuth endpoints + admin settings.
 *
 * Path layout (mounted by index.ts):
 *
 *   GET  /auth/google/config        public, no auth
 *   GET  /auth/google/start         302 → Google consent screen
 *   GET  /auth/google/callback      302 ← Google with `code` and `state`
 *
 *   GET  /admin/auth/google         admin only — masked settings
 *   PATCH /admin/auth/google        admin only — partial update
 * ──────────────────────────────────────────────────────────────── */

const STATE_COOKIE = 'osk_oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Compute the backend URL that Google should redirect the user back to.
 *  Derived from the live request so the same code works on any domain
 *  without an env var. */
function callbackUrlFor(req: Parameters<RequestHandler>[0]): string {
  /* `x-forwarded-proto` is set by Railway / most reverse proxies and
   * trumps req.protocol when the public scheme differs from how the
   * proxy talks to us internally. */
  const proto =
    (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() ||
    req.protocol;
  const host =
    (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim() ||
    req.get('host') ||
    '';
  /* `req.baseUrl` is `/api/v1` because the API router is mounted
   * there; the callback handler is at `/auth/google/callback`
   * relative to that base. */
  return `${proto}://${host}${req.baseUrl}/auth/google/callback`;
}

/** Where to send the user after a successful sign-in. Comes from the
 *  `redirectTo` query param at /start time, round-tripped through the
 *  `state` cookie. Falls back to the Origin header so we land back on
 *  whichever domain the user came from. */
function resolveFinalRedirect(opts: {
  redirectTo?: string | null;
  origin?: string | null;
}): string {
  const explicit = sanitize(opts.redirectTo);
  if (explicit) return explicit;
  const origin = sanitize(opts.origin);
  if (origin) return `${origin.replace(/\/+$/, '')}/dashboard`;
  return '/dashboard';
}

function sanitize(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  /* Only allow absolute http(s) URLs and same-origin paths. Anything
   * else (`javascript:`, `data:`, etc.) is dropped. */
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.protocol === 'http:' || u.protocol === 'https:') return trimmed;
  } catch {
    /* fall through */
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────────
 * Public config — frontend uses this to know whether to mount the
 * "Continue with Google" button.
 * ──────────────────────────────────────────────────────────────── */
export const getPublicConfig: RequestHandler = async (req, res) => {
  sendSuccess(res, await googleAuthService.getPublicConfig(callbackUrlFor(req)));
};

/* ─────────────────────────────────────────────────────────────────
 * /auth/google/start
 *
 * Builds the Google consent URL and 302s the browser there. We bake a
 * random `state` value into a short-lived httpOnly cookie + the URL so
 * the callback can detect CSRF (cookie value must match the `state` we
 * get back). `redirectTo` is round-tripped through the same cookie.
 * ──────────────────────────────────────────────────────────────── */
export const startGoogle: RequestHandler = async (req, res, next) => {
  try {
    const keys = await googleAuthService.getDecryptedKeys();
    if (!keys) throw new NotFoundError('Google sign-in is not enabled');

    const { randomBytes } = await import('node:crypto');
    const state = randomBytes(24).toString('base64url');
    const redirectTo =
      sanitize(typeof req.query.redirectTo === 'string' ? req.query.redirectTo : null) ??
      sanitize(req.headers.origin ?? null) ??
      '';

    res.cookie(STATE_COOKIE, JSON.stringify({ s: state, r: redirectTo }), {
      httpOnly: true,
      secure: req.secure || (req.headers['x-forwarded-proto'] === 'https'),
      sameSite: 'lax', // must be lax — Google's redirect is a top-level nav
      maxAge: STATE_TTL_MS,
      path: '/',
    });

    const params = new URLSearchParams({
      client_id: keys.clientId,
      redirect_uri: callbackUrlFor(req),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
      include_granted_scopes: 'true',
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────────────────────────
 * /auth/google/callback
 *
 * Validates `state`, exchanges `code` for an ID token, verifies it,
 * finds-or-creates-or-links a user, mints session tokens, and 302s
 * back to the frontend.
 *
 * Failure modes redirect to the frontend's sign-in page with an
 * `oauthError` query so the form can surface a meaningful message
 * instead of leaving the user on a blank API response.
 * ──────────────────────────────────────────────────────────────── */
export const googleCallback: RequestHandler = async (req, res, next) => {
  try {
    const stateCookieRaw = req.cookies?.[STATE_COOKIE] as string | undefined;
    res.clearCookie(STATE_COOKIE, { path: '/' });

    const failureBase =
      sanitize(req.headers.origin ?? null) ??
      sanitize(process.env.APP_BASE_URL ?? null) ??
      '';

    const fail = (reason: string): void => {
      const url = failureBase
        ? `${failureBase.replace(/\/+$/, '')}/sign-in?oauthError=${encodeURIComponent(reason)}`
        : `/sign-in?oauthError=${encodeURIComponent(reason)}`;
      res.redirect(url);
    };

    if (!stateCookieRaw) return fail('state_missing');
    let stateCookie: { s?: string; r?: string };
    try {
      stateCookie = JSON.parse(stateCookieRaw);
    } catch {
      return fail('state_invalid');
    }
    const stateFromQuery =
      typeof req.query.state === 'string' ? req.query.state : '';
    if (!stateCookie.s || stateCookie.s !== stateFromQuery) {
      return fail('state_mismatch');
    }

    if (typeof req.query.error === 'string') {
      return fail(req.query.error);
    }
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code) return fail('missing_code');

    const keys = await googleAuthService.getDecryptedKeys();
    if (!keys) return fail('google_disabled');

    const redirectUri = callbackUrlFor(req);
    const idToken = await googleAuthService.exchangeCodeForIdToken({
      code,
      clientId: keys.clientId,
      clientSecret: keys.clientSecret,
      redirectUri,
    });
    if (!idToken) return fail('token_exchange_failed');

    const profile = await googleAuthService.verifyIdToken(idToken, keys.clientId);
    if (!profile) return fail('id_token_invalid');

    /* Hand off to the auth service — it owns find-or-link-or-create
     * + token issuance. Origin is the FRONTEND origin we want links
     * to point at, which is encoded in `state.r` (redirectTo). */
    const targetOrigin =
      sanitize(stateCookie.r ?? null) ??
      sanitize(req.headers.origin ?? null);
    const { result, refreshToken } = await authService.loginWithGoogle(profile, {
      origin: targetOrigin && targetOrigin.startsWith('http') ? targetOrigin : null,
    });

    setRefreshCookie(res, refreshToken);

    /* If the form passed a path like "/dashboard" round-trip it
     * literally; if it passed an origin like "https://app.com" land
     * on /dashboard there. */
    const final = resolveFinalRedirect({
      redirectTo: stateCookie.r ?? null,
      origin: req.headers.origin ?? null,
    });
    /* Encode the freshly-minted access token in the redirect URL hash
     * so the frontend can hydrate the in-memory access token without a
     * second round-trip. Hash fragments aren't sent to the server, so
     * this stays out of nginx/Railway access logs. */
    const tokenPayload = encodeURIComponent(
      JSON.stringify({
        accessToken: result.accessToken,
        accessTokenExpiresAt: result.accessTokenExpiresAt,
        user: result.user,
      }),
    );
    const sep = final.includes('?') ? '&' : '?';
    res.redirect(`${final}${sep}googleSignedIn=1#osk_session=${tokenPayload}`);
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────────────────────────
 * Admin settings.
 * ──────────────────────────────────────────────────────────────── */
export const getGoogleSettings: RequestHandler = async (_req, res) => {
  sendSuccess(res, await googleAuthService.getSettings());
};

export const updateGoogleSettings: RequestHandler = async (req, res) => {
  const parsed = updateGoogleAuthSettingsSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  sendSuccess(res, await googleAuthService.updateSettings(parsed.data));
};
