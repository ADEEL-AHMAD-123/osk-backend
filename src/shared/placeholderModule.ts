import { Router } from 'express';
import { sendError } from './response';

/**
 * Router for domain modules that are scaffolded in the registry but not yet
 * implemented. Keeps the full module surface visible and routable while
 * returning an honest 501 — see ../docs/ARCHITECTURE.md §9 for the roadmap.
 */
export function placeholderModule(name: string): Router {
  const router = Router();
  router.all('*', (_req, res) => {
    sendError(
      res,
      501,
      'NOT_IMPLEMENTED',
      `The "${name}" module is scaffolded but not implemented yet.`,
    );
  });
  return router;
}
