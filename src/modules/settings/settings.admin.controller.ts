import { RequestHandler } from 'express';
import { settingsPatchSchema } from './settings.schema';
import { settingsService } from './settings.service';
import { UnauthorizedError, ValidationError } from '../../shared/errors';
import { sendSuccess } from '../../shared/response';
import { auditService } from '../audit/audit.service';
import { AuthUser } from '../../shared/middleware/auth';

export const patchAdminSettings: RequestHandler = async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const parsed = settingsPatchSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);

  const before = await settingsService.get();
  const after = await settingsService.update(parsed.data);

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
  if (parsed.data.siteTitle && parsed.data.siteTitle !== before.siteTitle) {
    void auditService.record({
      actor: req.user as AuthUser,
      action: 'settings.update',
      entityType: 'settings',
      entityId: 'default',
      meta: { field: 'siteTitle', before: before.siteTitle, after: after.siteTitle },
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
  if (parsed.data.homeStats && parsed.data.homeStats.length > 0) {
    void auditService.record({
      actor: req.user as AuthUser,
      action: 'settings.update',
      entityType: 'settings',
      entityId: 'default',
      meta: { field: 'homeStats' },
      req,
    });
  }

  sendSuccess(res, after);
};
