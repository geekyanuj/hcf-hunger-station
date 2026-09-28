import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { Permission } from '../config/permissions';

/**
 * RBAC via permissions, not role names. The access token embeds the staff
 * member's resolved permission list (computed from their Role at login time).
 * Usage: router.get('/inventory', authenticate, requireStaff, authorize('inventory.read'), handler)
 */
export function authorize(...requiredPermissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth || req.auth.type !== 'STAFF') return next(ApiError.forbidden('Staff access required'));
    const granted = new Set(req.auth.permissions);
    const missing = requiredPermissions.filter((p) => !granted.has(p));
    if (missing.length > 0) {
      return next(ApiError.forbidden(`Missing required permission(s): ${missing.join(', ')}`));
    }
    return next();
  };
}

/**
 * Passes when the staff member holds AT LEAST ONE of the given permissions.
 * Used where several roles legitimately reach the same endpoint (e.g. the
 * order-status endpoint is used by the cashier/manager via `orders.update`,
 * the kitchen via `kds.update` and delivery riders via `delivery.update`).
 * Which specific transition each of them may perform is decided by the
 * order state machine, not by the route.
 */
export function authorizeAny(...anyOf: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth || req.auth.type !== 'STAFF') return next(ApiError.forbidden('Staff access required'));
    const granted = new Set(req.auth.permissions);
    if (!anyOf.some((p) => granted.has(p))) {
      return next(ApiError.forbidden(`Requires one of: ${anyOf.join(', ')}`));
    }
    return next();
  };
}

/** Ensures the authenticated staff member is scoped to the outlet referenced by req.params.outletId or req.body.outletId. */
export function requireOutletScope(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth || req.auth.type !== 'STAFF') return next(ApiError.forbidden('Staff access required'));
  if (req.auth.role === 'OWNER') return next(); // owners see all outlets
  const outletId = (req.params.outletId ?? req.body.outletId ?? req.query.outletId) as string | undefined;
  if (!outletId) return next(); // route does not scope by outlet
  if (!req.auth.outletIds.includes(outletId)) {
    return next(ApiError.forbidden('You do not have access to this outlet'));
  }
  return next();
}
