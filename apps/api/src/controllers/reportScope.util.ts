import { Request } from 'express';
import { ApiError } from '../utils/ApiError';

/**
 * Resolves the outlet(s) a reporting/analytics/dashboard request is allowed
 * to see: `?outletId=ALL` is only honored for OWNER accounts (spec: "Owner
 * can select ALL OUTLETS... Managers should normally only access assigned
 * outlet(s)"). A specific `?outletId=` must be one the requesting staff
 * member is actually assigned to, unless they're an OWNER.
 */
export function resolveOutletScope(req: Request): string[] | 'ALL' {
  if (!req.auth || req.auth.type !== 'STAFF') throw ApiError.forbidden('Staff access required');

  const requested = req.query.outletId as string | undefined;

  if (req.auth.role === 'OWNER') {
    if (!requested || requested === 'ALL') return 'ALL';
    return [requested];
  }

  if (!requested || requested === 'ALL') return req.auth.outletIds;

  if (!req.auth.outletIds.includes(requested)) {
    throw ApiError.forbidden('You do not have access to this outlet');
  }
  return [requested];
}

export function parseDateRange(req: Request): { from: Date; to: Date } {
  const preset = req.query.range as string | undefined;
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  if (req.query.from && req.query.to) {
    return { from: new Date(req.query.from as string), to: new Date(req.query.to as string) };
  }

  switch (preset) {
    case 'yesterday': {
      const from = new Date(startOfToday.getTime() - 86400000);
      const to = new Date(endOfToday.getTime() - 86400000);
      return { from, to };
    }
    case 'last7days':
      return { from: new Date(startOfToday.getTime() - 6 * 86400000), to: endOfToday };
    case 'last30days':
      return { from: new Date(startOfToday.getTime() - 29 * 86400000), to: endOfToday };
    case 'today':
    default:
      return { from: startOfToday, to: endOfToday };
  }
}
