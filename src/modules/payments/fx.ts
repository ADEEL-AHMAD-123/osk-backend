/**
 * Server-side FX table.
 *
 * Used to convert a plan's authored price into a currency the chosen
 * provider can actually charge. Example: a plan priced in USD, the
 * customer picks Paystack (which doesn't take USD on the operator's
 * account) — we convert the amount to NGN at checkout and charge
 * that. The plan's display price stays USD everywhere else.
 *
 * Rates are USD-pivot: `1 USD = N <currency>`. Convert via
 * `amount / RATE[from] * RATE[to]`. These are deliberately approximate;
 * they exist so checkout never blocks on "no compatible currency".
 * Refresh every few months. For the canonical billing record the
 * Payment doc keeps both the original (plan) currency and the
 * charged currency separately.
 */
export const USD_FX_RATES: Record<string, number> = {
  USD: 1,
  CAD: 1.36,
  EUR: 0.92,
  GBP: 0.79,
  AUD: 1.51,
  NGN: 1550,
  GHS: 14.5,
  ZAR: 18.6,
  KES: 130,
};

/** Convert `amount` from `from` to `to` using the USD-pivot table.
 *  Returns the original amount unchanged when either currency is
 *  missing from the table — the caller (resolveCheckoutPair) then
 *  decides whether to throw or fall through to a different
 *  provider-supported currency. */
export function convertAmount(amount: number, from: string, to: string): number {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return amount;
  const fromRate = USD_FX_RATES[f];
  const toRate = USD_FX_RATES[t];
  if (!fromRate || !toRate) return amount;
  return (amount / fromRate) * toRate;
}

/** Round a converted billing amount to a sensible minor-unit value.
 *  Avoids fractional kobo / pesewa on Paystack charges. NGN/GHS/ZAR/KES
 *  round to the whole unit; USD/EUR/etc. round to 2 decimal places. */
export function roundForBilling(amount: number, currency: string): number {
  const integerOnly = ['NGN', 'GHS', 'ZAR', 'KES'];
  if (integerOnly.includes(currency.toUpperCase())) {
    return Math.ceil(amount);
  }
  return Math.round(amount * 100) / 100;
}
