import { env } from '../../config/env';

/** Final environment fallback for the email-link base URL. Prefer
 *  the explicit `APP_BASE_URL` env (used historically for the
 *  customer-facing site), fall back to `PUBLIC_APP_URL` (already
 *  validated by the env schema for payment redirects), and finally
 *  to localhost for dev. */
function envFallback(): string {
  return (
    process.env.APP_BASE_URL ||
    env.PUBLIC_APP_URL ||
    'http://localhost:3000'
  );
}

/**
 * Resolve the base URL to embed inside transactional email links.
 *
 * Priority — highest wins:
 *  1. `requestOrigin` — the Origin header of the request that
 *     triggered the action (login screen, "resend verification" click,
 *     subscribe form, etc.). This is the most accurate signal of
 *     which domain the user is actually on right now, so we honour
 *     it above anything else.
 *  2. `userOrigin`   — the recipient's stored `User.lastOrigin`.
 *     Used by background flows (subscription webhook activation,
 *     admin-triggered property review) where no live request from
 *     the recipient is available. It reflects the last domain the
 *     user was seen on.
 *  3. `APP_BASE_URL` env var — fallback for very first-time emails
 *     where the user has no `lastOrigin` yet (e.g. webhook-triggered
 *     send for a user who only signed in from a browser without
 *     forwarding `Origin`).
 *  4. `http://localhost:3000` — dev default.
 *
 * Trailing slashes are stripped so callers can safely
 * concatenate `${appUrl}/verify-email?...`.
 *
 * Accepts plain origin strings ("https://example.com"); does not
 * validate against the CORS blocklist here — that's already enforced
 * upstream by the request-time middleware.
 */
export function resolveAppBaseUrl(opts: {
  requestOrigin?: string | null;
  userOrigin?: string | null;
} = {}): string {
  const candidate =
    sanitize(opts.requestOrigin) ||
    sanitize(opts.userOrigin) ||
    sanitize(envFallback()) ||
    'http://localhost:3000';
  return candidate.replace(/\/+$/, '');
}

function sanitize(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  /* Best-effort URL validity — `new URL` throws for garbage. We don't
   * normalise to .origin here because callers may legitimately pass
   * env.APP_BASE_URL which can include a path prefix. */
  try {
    /* eslint-disable-next-line no-new */
    new URL(trimmed);
    return trimmed;
  } catch {
    return '';
  }
}
