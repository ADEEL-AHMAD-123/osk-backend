import type { RequestHandler } from 'express';
import { ValidationError } from '../../shared/errors';
import { sendSuccess, buildMeta } from '../../shared/response';
import { userService } from './user.service';
import { toUserDTO } from './user.mapper';
import { updateProfileSchema, userFiltersSchema } from './user.schema';

/** GET /users/me — current user profile. */
export const getMe: RequestHandler = async (req, res) => {
  const user = await userService.findById(req.user!.id);
  sendSuccess(res, toUserDTO(user));
};

/** PATCH /users/me — partial profile update. */
export const updateMe: RequestHandler = async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const user = await userService.updateProfile(req.user!.id, parsed.data);
  sendSuccess(res, toUserDTO(user));
};

/** GET /users — admin list with optional role / q filter. */
export const listUsers: RequestHandler = async (req, res) => {
  const parsed = userFiltersSchema.safeParse(req.query);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const { items, total } = await userService.list(parsed.data);
  sendSuccess(
    res,
    items.map(toUserDTO),
    { meta: buildMeta(parsed.data.page, parsed.data.limit, total) },
  );
};
