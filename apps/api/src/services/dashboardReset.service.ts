import { Types } from 'mongoose';
import { DashboardReset } from '../models/DashboardReset';
import { Outlet } from '../models/Outlet';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { verifyPassword } from '../utils/password';
import { AuditService } from './audit.service';
import { emitDashboardUpdated } from '../sockets';

export type OutletScope = string[] | 'ALL';

/**
 * Wrong-password protection. Resetting the dashboard is a sensitive action, so
 * repeated wrong passwords lock the *account's* ability to reset for a while
 * (on top of the per-IP auth rate limiter on the route). In-memory on purpose:
 * it is a brake, not a security boundary - the password check itself is the
 * boundary. It resets when the API restarts.
 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map<string, { fails: number; lockedUntil?: number }>();

export function resetAttemptState(userId?: string) {
  if (userId) attempts.delete(userId);
  else attempts.clear();
}

function assertNotLocked(userId: string) {
  const entry = attempts.get(userId);
  if (entry?.lockedUntil && entry.lockedUntil > Date.now()) {
    const minutes = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
    throw new ApiError(429, `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }
}

function registerFailure(userId: string) {
  const entry = attempts.get(userId) ?? { fails: 0 };
  entry.fails += 1;
  if (entry.fails >= MAX_FAILED_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCK_MS;
    entry.fails = 0;
  }
  attempts.set(userId, entry);
}

export const DashboardResetService = {
  /**
   * The moment the dashboard should start counting from for this view, or
   * null if it has never been reset. A reset made for an outlet (or for
   * "all outlets") applies to any view that includes that outlet, and the most
   * recent applicable one wins.
   */
  async latest(scope: OutletScope) {
    const filter =
      scope === 'ALL'
        ? {}
        : { $or: [{ outletId: { $exists: false } }, { outletId: null }, { outletId: { $in: scope.map((id) => new Types.ObjectId(id)) } }] };
    const doc = await DashboardReset.findOne(filter).sort({ resetAt: -1 });
    return doc ? { at: doc.resetAt, by: doc.resetByName } : null;
  },

  async reset(params: { userId: string; password: string; scope: OutletScope; ipAddress?: string }) {
    const { userId, password, scope } = params;
    assertNotLocked(userId);

    const user = await User.findOne({ _id: userId, isDeleted: false, isActive: true }).select('+passwordHash');
    if (!user) throw ApiError.unauthorized('Account not found or inactive');

    // 403 (not 401) on purpose: the web client treats 401 as "session expired" and tries to refresh/log out.
    if (!(await verifyPassword(user.passwordHash, password))) {
      registerFailure(userId);
      throw ApiError.forbidden('Incorrect password');
    }
    attempts.delete(userId);

    const resetAt = new Date();
    let outletIds: Types.ObjectId[];
    if (scope === 'ALL') {
      outletIds = (await Outlet.find({ isDeleted: false }).select('_id')).map((o) => o._id as Types.ObjectId);
    } else {
      outletIds = scope.map((id) => new Types.ObjectId(id));
    }

    // One record per outlet keeps the audit trail attributable to a concrete outlet.
    const records = await DashboardReset.insertMany(
      outletIds.map((outletId) => ({ outletId, resetAt, resetBy: user._id, resetByName: user.name }))
    );

    for (const record of records) {
      await AuditService.record({
        ctx: { userId, ipAddress: params.ipAddress },
        action: 'DASHBOARD_RESET',
        entity: 'Dashboard',
        entityId: record._id as Types.ObjectId,
        outletId: record.outletId,
        after: { resetAt },
      });
      if (record.outletId) emitDashboardUpdated(record.outletId.toString());
    }

    return { resetAt, resetBy: user.name, outletCount: outletIds.length };
  },
};
