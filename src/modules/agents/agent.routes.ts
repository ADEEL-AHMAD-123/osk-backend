import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../../shared/asyncHandler';
import { ValidationError, NotFoundError } from '../../shared/errors';
import { sendSuccess, buildMeta } from '../../shared/response';
import { userService } from '../users/user.service';
import { toAgentPublicDTO } from '../users/user.mapper';
import { userFiltersSchema } from '../users/user.schema';
import { propertyFiltersSchema } from '../properties/property.schema';
import { propertyService } from '../properties/property.service';

/**
 * Public agent directory. Derives from the existing UserModel (role=agent)
 * — a dedicated AgentProfile collection (bios, license info, ratings) is
 * Phase 2 in the blueprint.
 */
const listAgents: RequestHandler = async (req, res) => {
  const parsed = userFiltersSchema.safeParse(req.query);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const { items, total } = await userService.list(parsed.data, {
    role: 'agent',
  });
  sendSuccess(
    res,
    items.map(toAgentPublicDTO),
    { meta: buildMeta(parsed.data.page, parsed.data.limit, total) },
  );
};

const getAgent: RequestHandler = async (req, res) => {
  const user = await userService.findById(req.params.id ?? '');
  if (user.role !== 'agent') {
    throw new NotFoundError('Agent not found');
  }
  sendSuccess(res, toAgentPublicDTO(user));
};

/** GET /agents/:id/listings — published inventory for a single agent. */
const listAgentListings: RequestHandler = async (req, res) => {
  const user = await userService.findById(req.params.id ?? '');
  if (user.role !== 'agent') {
    throw new NotFoundError('Agent not found');
  }
  const filters = propertyFiltersSchema.parse(req.query);
  const page = await propertyService.listPublicForOwner(
    user._id.toString(),
    filters,
  );
  sendSuccess(res, page.items, {
    meta: buildMeta(page.page, page.limit, page.total),
  });
};

export const agentRoutes = Router();
agentRoutes.get('/', asyncHandler(listAgents));
agentRoutes.get('/:id', asyncHandler(getAgent));
agentRoutes.get('/:id/listings', asyncHandler(listAgentListings));
