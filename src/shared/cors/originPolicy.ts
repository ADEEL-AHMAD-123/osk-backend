import { env } from '../../config/env';

/**
 * Origin policy for the API.
 *
 *  - Default behaviour: REFLECT any browser-supplied `Origin` header.
 *    That means a frontend deployed at any domain you choose can call
 *    the API without the operator touching env vars first. The
 *    security model relies on Bearer auth (`Authorization: Bearer …`)
 *    which a malicious site can't forge — it doesn't have the JWT
 *    that lives in the legitimate frontend's memory.
 *
 *  - Optional blocklist via `CORS_BLOCKLIST`: comma-separated list of
 *    origins (exact match OR `https://*.example.com` wildcard) that
 *    are explicitly refused. Useful if you ever need to revoke a
 *    specific tenant without redeploying.
 *
 *  - The classic `CORS_ORIGIN` env still exists but is now informational
 *    only (the operator-friendly "these are the domains I expect" list).
 *    The middleware does not enforce it.
 *
 *  - Server-to-server callers without an `Origin` header are always
 *    allowed (`undefined`).
 *
 * Wildcard syntax for blocklist entries: `*` matches a single hostname
 * segment, so `https://*.evil.com` matches `https://foo.evil.com` but
 * NOT `https://foo.evil.com.attacker.net`.
 */

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function originToRegex(pattern: string): RegExp | null {
  /* Exact match shortcut — the common case. */
  if (!pattern.includes('*')) {
    return new RegExp(`^${escapeRe(pattern)}$`, 'i');
  }
  /* Wildcard expansion: replace `*` with a single hostname-segment
   *  match so wildcard patterns can't be tricked into matching
   *  attacker-controlled suffixes. */
  const re = pattern
    .split('*')
    .map(escapeRe)
    .join('[a-zA-Z0-9-]+');
  return new RegExp(`^${re}$`, 'i');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const blocklistPatterns = parseList(process.env.CORS_BLOCKLIST)
  .map(originToRegex)
  .filter((re): re is RegExp => re !== null);

/** True when `origin` matches any blocklist entry. */
function isBlocked(origin: string): boolean {
  return blocklistPatterns.some((re) => re.test(origin));
}

/**
 * Hand-off function for the `cors` middleware's `origin` option.
 * Returns the origin itself when allowed (so the browser gets a
 * concrete `Access-Control-Allow-Origin` rather than `*`, which is
 * required when `credentials: true`).
 */
export function corsOriginResolver(
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean | string) => void,
): void {
  if (!origin) {
    /* Server-to-server callers (no browser, no Origin header). */
    cb(null, true);
    return;
  }
  if (isBlocked(origin)) {
    cb(new Error(`Origin ${origin} is blocked by CORS_BLOCKLIST`));
    return;
  }
  /* Reflect the origin back. The CORS spec requires the response's
   * `Access-Control-Allow-Origin` value to exactly match the request's
   * `Origin` when credentials are involved — returning `true` here
   * causes the `cors` package to do exactly that. */
  cb(null, true);
}

/**
 * Synchronous variant used by Socket.IO, which doesn't accept a
 * node-style callback. Returns `true` / a regex / a string.
 */
export function corsOriginPredicate(origin: string | undefined): boolean {
  if (!origin) return true;
  if (isBlocked(origin)) return false;
  return true;
}

/**
 * The informational allowlist from `CORS_ORIGIN` — not enforced by the
 * middleware anymore, but consumed by modules that need a single
 * "primary frontend origin" (e.g. constructing public links inside
 * emails / payment redirects).
 */
export function preferredFrontendOrigin(): string {
  const list = parseList(env.CORS_ORIGIN);
  return list[0] || 'http://localhost:3000';
}

/** Resolve a checkout success/cancel base URL.
 *  Prefers the request's own Origin (so a checkout fired from
 *  the canonical frontend redirects back to itself), falls back
 *  to env.PUBLIC_APP_URL, then to the preferred CORS origin. */
export function resolveCheckoutBaseFromOrigin(
  requestOrigin: string | undefined,
): string {
  if (requestOrigin && !isBlocked(requestOrigin)) {
    return requestOrigin.replace(/\/$/, '');
  }
  if (env.PUBLIC_APP_URL) return env.PUBLIC_APP_URL.replace(/\/$/, '');
  return preferredFrontendOrigin().replace(/\/$/, '');
}
