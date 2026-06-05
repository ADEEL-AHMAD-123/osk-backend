import type { RequestHandler } from 'express';
import { UnauthorizedError, ValidationError } from '../../shared/errors';
import { sendSuccess } from '../../shared/response';
import { logger } from '../../config/logger';
import type { AuthUser } from '../../shared/middleware/auth';
import { createIntentSchema } from './payment.schema';
import { paymentService } from './payment.service';
import { PROVIDER_KEYS, type ProviderKey } from './payment.types';

/* ─── seller endpoints ───────────────────────────────────────────── */

export const createIntent: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const parsed = createIntentSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  logger.info(
    {
      requestId: res.locals.requestId,
      actorId: req.user.id,
      payload: parsed.data,
    },
    'payments.intent request payload',
  );
  const result = await paymentService.createIntent(
    req.user as AuthUser,
    parsed.data.propertyId,
    parsed.data.provider,
  );
  sendSuccess(res, result, { status: 201 });
};

export const listMyPayments: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  sendSuccess(res, await paymentService.listMine(req.user as AuthUser));
};

export const listPropertyPayments: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  sendSuccess(
    res,
    await paymentService.listForProperty(
      req.user as AuthUser,
      req.params.propertyId!,
    ),
  );
};

/* ─── admin endpoints ────────────────────────────────────────────── */

export const listAdminPayments: RequestHandler = async (_req, res) => {
  sendSuccess(res, await paymentService.listAdmin());
};

export const confirmPayment: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const payment = await paymentService.confirm(
    req.user as AuthUser,
    req.params.id!,
  );
  sendSuccess(res, payment);
};

/* ─── webhooks ───────────────────────────────────────────────────── */

/**
 * One handler factory per provider. The route layer mounts each with a
 * raw-body parser so the adapter can compute / verify the signature.
 */
export function makeWebhookHandler(provider: ProviderKey): RequestHandler {
  return async (req, res) => {
    if (!PROVIDER_KEYS.includes(provider)) {
      res.status(404).send('Unknown provider');
      return;
    }
    /* express.raw() sets req.body to a Buffer when the body parser is
     * wired. If it isn't (e.g. dev), fall back to whatever Express gave us. */
    const rawBody: string | Buffer =
      req.body instanceof Buffer
        ? req.body
        : typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body ?? {});
    const result = await paymentService.handleWebhook(
      provider,
      rawBody,
      req.headers,
    );
    /* Webhooks should always 2xx so the provider stops retrying for
     * well-formed events — even if we couldn't match the paymentId. */
    res.status(result.ok ? 200 : 202).json({ received: true });
  };
}
