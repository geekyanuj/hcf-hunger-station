import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { AuthService } from '../services/auth.service';
import { ApiError } from '../utils/ApiError';

function device(req: Request) {
  return { userAgent: req.headers['user-agent'], ipAddress: req.ip };
}

export const AuthController = {
  staffLogin: asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const result = await AuthService.staffLogin(email, password, device(req));
    return sendSuccess(res, result, 'Login successful');
  }),

  customerLogin: asyncHandler(async (req: Request, res: Response) => {
    const { name, mobile, email, address } = req.body;
    const result = await AuthService.customerLogin({ name, mobile, email, address }, device(req));
    return sendSuccess(res, result, 'Login successful');
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    const result = await AuthService.refresh(refreshToken, device(req));
    return sendSuccess(res, result, 'Token refreshed');
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    if (refreshToken) await AuthService.logout(refreshToken);
    return sendSuccess(res, null, 'Logged out');
  }),

  forgotPassword: asyncHandler(async (req: Request, res: Response) => {
    await AuthService.requestPasswordReset(req.body.email);
    return sendSuccess(res, null, 'If that email exists, a reset link has been sent');
  }),

  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    await AuthService.resetPassword(req.body.token, req.body.newPassword);
    return sendSuccess(res, null, 'Password reset successful');
  }),

  changePassword: asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth || req.auth.type !== 'STAFF') throw ApiError.forbidden('Staff access required');
    await AuthService.changeStaffPassword(req.auth.sub, req.body.currentPassword, req.body.newPassword);
    return sendSuccess(res, null, 'Password changed');
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    return sendSuccess(res, req.auth, 'Current session');
  }),
};
