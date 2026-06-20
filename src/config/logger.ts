import pino from 'pino';
import { env, isProd } from './env';

/**
 * Structured logger (Pino).
 *
 * We use `pino-pretty` in BOTH dev and prod. JSON envelopes are
 * great for log-aggregator pipelines, but Railway / Vercel / Fly
 * console output is read by humans 99% of the time, and a wall of
 * `{"level":30,"time":...}` lines is hard to scan. Pretty mode emits
 * one-liners like:
 *
 *   10:33:12 INFO  POST /api/v1/auth/login → 200 [from oskbooking.com] (req_abc123)
 *
 * which is what you want when you're tailing logs to debug a
 * specific request. Pretty-printing has a small CPU cost; if a high
 * traffic deploy ever needs raw JSON for log shipping we can flip
 * `LOG_FORMAT=json` (read here) and revert to the structured stream.
 *
 *  - The `messageFormat` template puts every field we care about on
 *    one line: HTTP verb, URL, status, origin domain, and requestId.
 *  - `ignore` strips the noisy keys pino-pretty normally re-prints
 *    after the message.
 *  - Long-conversation correlation: requestId is attached per-request
 *    by pino-http (see app.ts) and surfaced inline by the template.
 */
const useJson = process.env.LOG_FORMAT === 'json';

export const logger = pino({
  level: isProd ? 'info' : 'debug',
  transport: useJson
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname,service,env,req,res,responseTime,requestId,origin',
          /* `msg` already includes method+url+status (see customSuccessMessage
           * in app.ts) so the template just wraps origin + requestId for
           * scannability. Falsy values render as blank, keeping the line
           * tidy for non-HTTP log entries. */
          messageFormat:
            '{msg}{if origin} [from {origin}]{end}{if requestId} ({requestId}){end}',
        },
      },
  base: { service: 'osk-backend', env: env.NODE_ENV },
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password'],
});
