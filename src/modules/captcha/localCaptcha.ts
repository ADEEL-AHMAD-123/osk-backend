import crypto from 'node:crypto';
import { env } from '../../config/env';

/* ─────────────────────────────────────────────────────────────────
 * Local (built-in) text-captcha helpers.
 *
 *   - generateLocalChallenge()  → { token, svg }
 *   - verifyLocalAnswer(token)  → boolean
 *
 * Token format (URL-safe, self-contained, no server-side storage):
 *
 *     <payload>.<hmac>
 *
 *   where payload = base64url(JSON({
 *     c: <code>,           // the text the user has to type, lowercase
 *     e: <expiry ms>,      // unix ms after which we refuse
 *     n: <nonce>           // random, makes each token single-use
 *   }))
 *
 *   and hmac = base64url(HMAC-SHA256(secret, payload))
 *
 * The combined token+answer flows from the frontend as a single
 * string in the existing `captchaToken` field, joined by `|`:
 *
 *     "<token>|<user_answer>"
 *
 * The service splits the two and verifies in one step. We never store
 * the challenge anywhere — the HMAC + expiry are the only guarantees,
 * and the nonce baked into the token prevents trivial reuse within
 * the validity window when callers track seen nonces (we don't yet).
 *
 * Stronger than nothing, weaker than Turnstile against OCR bots.
 * ──────────────────────────────────────────────────────────────── */

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
/* Skip easily-confused glyphs: 0/O, 1/I/l. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const SVG_W = 160;
const SVG_H = 56;

function getSecret(): string {
  /* Reuse the same env var we already require for at-rest secret
   * encryption — the captcha token doesn't need its own key. */
  return env.OSK_SECRETS_KEY || 'dev-only-fallback-secret';
}

function b64urlEncode(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(input: string): Buffer | null {
  try {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    return Buffer.from(padded + pad, 'base64');
  } catch {
    return null;
  }
}

function randomCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    s += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return s;
}

function sign(payload: string): string {
  return b64urlEncode(
    crypto.createHmac('sha256', getSecret()).update(payload).digest(),
  );
}

/** Build a token + SVG for the same code. The frontend renders the
 *  SVG and submits `<token>|<user_answer>` back when the form is sent. */
export function generateLocalChallenge(): { token: string; svg: string } {
  const code = randomCode();
  const payload = b64urlEncode(
    JSON.stringify({
      c: code.toLowerCase(),
      e: Date.now() + CHALLENGE_TTL_MS,
      n: b64urlEncode(crypto.randomBytes(8)),
    }),
  );
  const token = `${payload}.${sign(payload)}`;
  return { token, svg: renderSvg(code) };
}

/** Verify the combined `<token>|<answer>` string the frontend
 *  submits. Constant-time compares the HMAC; falls if anything is
 *  malformed, expired, or doesn't match. Case-insensitive on the
 *  user's answer. */
export function verifyLocalAnswer(combined: string | null | undefined): boolean {
  if (!combined || typeof combined !== 'string') return false;
  const sep = combined.indexOf('|');
  if (sep === -1) return false;
  const token = combined.slice(0, sep);
  const answer = combined.slice(sep + 1).trim().toLowerCase();
  if (!answer) return false;

  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const payload = token.slice(0, dot);
  const hmac = token.slice(dot + 1);

  const expected = sign(payload);
  if (expected.length !== hmac.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmac))) {
    return false;
  }

  const raw = b64urlDecode(payload);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw.toString('utf8')) as {
      c?: string;
      e?: number;
    };
    if (typeof parsed.c !== 'string' || typeof parsed.e !== 'number') {
      return false;
    }
    if (Date.now() > parsed.e) return false;
    return parsed.c === answer;
  } catch {
    return false;
  }
}

/* ─────────────────────────────────────────────────────────────────
 * SVG rendering. Each glyph gets a random position, slight rotation
 * and a token-driven hue so the image isn't trivially OCRable but
 * stays legible to a human. A few sketch lines run across the image
 * for extra noise.
 * ──────────────────────────────────────────────────────────────── */

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function renderSvg(code: string): string {
  const cols = code.length;
  const slotW = (SVG_W - 16) / cols;
  const glyphs = code
    .split('')
    .map((ch, i) => {
      const cx = 8 + slotW * (i + 0.5);
      const cy = SVG_H / 2 + rand(-4, 4);
      const rotate = rand(-22, 22).toFixed(1);
      const hue = Math.floor(rand(210, 290));
      const fontSize = rand(26, 32).toFixed(1);
      return `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}"
        font-family="Georgia, 'Times New Roman', serif"
        font-style="italic" font-weight="700"
        font-size="${fontSize}"
        fill="hsl(${hue}, 55%, 35%)"
        text-anchor="middle"
        dominant-baseline="middle"
        transform="rotate(${rotate} ${cx.toFixed(1)} ${cy.toFixed(1)})"
      >${ch}</text>`;
    })
    .join('');

  const lines = Array.from({ length: 4 }, () => {
    const x1 = rand(0, SVG_W).toFixed(1);
    const y1 = rand(0, SVG_H).toFixed(1);
    const x2 = rand(0, SVG_W).toFixed(1);
    const y2 = rand(0, SVG_H).toFixed(1);
    const hue = Math.floor(rand(200, 320));
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
      stroke="hsl(${hue}, 50%, 60%)" stroke-width="1.2" opacity="0.55" />`;
  }).join('');

  const dots = Array.from({ length: 28 }, () => {
    const cx = rand(0, SVG_W).toFixed(1);
    const cy = rand(0, SVG_H).toFixed(1);
    const r = rand(0.6, 1.6).toFixed(1);
    const hue = Math.floor(rand(0, 360));
    return `<circle cx="${cx}" cy="${cy}" r="${r}"
      fill="hsl(${hue}, 40%, 55%)" opacity="0.55" />`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} ${SVG_H}"
    width="${SVG_W}" height="${SVG_H}" role="img" aria-label="Captcha challenge">
    <rect width="100%" height="100%" fill="#f3e8ff" />
    ${lines}
    ${glyphs}
    ${dots}
  </svg>`;
}
