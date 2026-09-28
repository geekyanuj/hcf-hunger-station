import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { User } from '../models/User';
import { hashPassword } from '../utils/password';
import { AuditService } from '../services/audit.service';

export const UserController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const filter: Record<string, unknown> = { isDeleted: false };
    if (req.query.outletId) filter.outletIds = req.query.outletId;
    const users = await User.find(filter).sort({ name: 1 });
    return sendSuccess(res, users);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password, role, outletIds } = req.body;
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) throw ApiError.conflict('A user with this email already exists');
    const passwordHash = await hashPassword(password);
    const user = await User.create({ name, email, passwordHash, role, outletIds });
    return sendSuccess(res, { id: user.id, name: user.name, email: user.email, role: user.role }, 'Staff user created', 201);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { name, role, outletIds, isActive } = req.body;
    const before = await User.findOne({ _id: req.params.id, isDeleted: false }).lean();
    if (!before) throw ApiError.notFound('User not found');
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { name, role, outletIds, isActive },
      { new: true }
    );
    if (!user) throw ApiError.notFound('User not found');

    if (role !== before.role || JSON.stringify(outletIds) !== JSON.stringify(before.outletIds)) {
      const actingUserId = req.auth?.type === 'STAFF' ? req.auth.sub : undefined;
      await AuditService.record({
        ctx: { userId: actingUserId, ipAddress: req.ip },
        action: 'USER_PERMISSION_CHANGE',
        entity: 'User',
        entityId: user.id,
        before: { role: before.role, outletIds: before.outletIds },
        after: { role: user.role, outletIds: user.outletIds },
      });
    }

    return sendSuccess(res, user, 'User updated');
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const user = await User.findOneAndUpdate({ _id: req.params.id }, { isDeleted: true, isActive: false }, { new: true });
    if (!user) throw ApiError.notFound('User not found');
    return sendSuccess(res, null, 'User deactivated');
  }),

  /** Admin-forced password reset — distinct from the self-service forgot-password flow in auth.service.ts. Always audit-logged. */
  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) throw ApiError.badRequest('New password must be at least 8 characters');
    const user = await User.findOne({ _id: req.params.id, isDeleted: false });
    if (!user) throw ApiError.notFound('User not found');
    user.passwordHash = await hashPassword(newPassword);
    await user.save();

    const actingUserId = req.auth?.type === 'STAFF' ? req.auth.sub : undefined;
    await AuditService.record({
      ctx: { userId: actingUserId, ipAddress: req.ip },
      action: 'USER_PERMISSION_CHANGE',
      entity: 'User',
      entityId: user.id,
      after: { passwordReset: true },
    });

    return sendSuccess(res, null, 'Password reset');
  }),
};
