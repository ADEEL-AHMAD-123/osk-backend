import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../shared/asyncHandler';
import {
  authenticate,
  authorize,
  type AuthUser,
} from '../../shared/middleware/auth';
import { UnauthorizedError, ValidationError } from '../../shared/errors';
import { sendSuccess } from '../../shared/response';
import { auditService } from '../audit/audit.service';
import { settingsPatchSchema } from './settings.schema';
import { settingsService } from './settings.service';

/* Public — anyone can read site settings (powers the footer, contact
 * page, theme application). */
const getSettings: RequestHandler = async (_req, res) => {
  sendSuccess(res, await settingsService.get());
};

/* Admin-only — patch any subset of theme / branding / contact. */
const updateSettings: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const parsed = settingsPatchSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);

  const before = await settingsService.get();
  const after = await settingsService.update(parsed.data);

  /* Only audit the diff we actually changed — keeps the activity feed
   * scannable. */
  if (parsed.data.activeTheme && parsed.data.activeTheme !== before.activeTheme) {
    void auditService.record({
      actor: req.user as AuthUser,
      action: 'settings.update',
      entityType: 'settings',
      entityId: 'default',
      meta: {
        field: 'activeTheme',
        before: before.activeTheme,
        after: after.activeTheme,
      },
      req,
    });
  }
  if (parsed.data.logoUrl !== undefined && parsed.data.logoUrl !== before.logoUrl) {
    void auditService.record({
      actor: req.user as AuthUser,
      action: 'settings.update',
      entityType: 'settings',
      entityId: 'default',
      meta: { field: 'logoUrl' },
      req,
    });
  }
  if (parsed.data.companyName && parsed.data.companyName !== before.companyName) {
    void auditService.record({
      actor: req.user as AuthUser,
      action: 'settings.update',
      entityType: 'settings',
      entityId: 'default',
      meta: { field: 'companyName', before: before.companyName, after: after.companyName },
      req,
    });
  }
  if (parsed.data.contact && Object.keys(parsed.data.contact).length > 0) {
    void auditService.record({
      actor: req.user as AuthUser,
      action: 'settings.update',
      entityType: 'settings',
      entityId: 'default',
      meta: { field: 'contact', changed: Object.keys(parsed.data.contact) },
      req,
    });
  }

  sendSuccess(res, after);
};

export const settingsRoutes = Router();
settingsRoutes.get('/', asyncHandler(getSettings));
