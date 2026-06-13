import type { RequestHandler } from 'express';
import { nanoid } from 'nanoid';

/**
 * Assigns a correlation ID to every request. Honors an inbound
 * `x-request-id`, otherwise generates one. Echoed on the response and
 * threaded into logs and the response envelope.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && incoming.length > 0
      ? incoming
      : `req_${nanoid(12)}`;

  res.locals.requestId = id;
  res.setHeader('x-request-id', id);
  next();
};
