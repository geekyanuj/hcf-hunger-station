import { Types } from 'mongoose';
import { User } from '../models/User';
import { Customer, IAddress } from '../models/Customer';
import { Role } from '../models/Role';
import { RefreshToken } from '../models/RefreshToken';
import { ApiError } from '../utils/ApiError';
import { hashPassword, verifyPassword } from '../utils/password';
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  refreshTokenExpiryDate,
} from '../utils/tokenUtils';
import { AccessTokenPayload, StaffAccessTokenPayload, CustomerAccessTokenPayload } from '../types/auth';

interface DeviceInfo {
  userAgent?: string;
  ipAddress?: string;
}

async function issueSession(
  principalType: 'USER' | 'CUSTOMER',
  principalId: Types.ObjectId,
  accessPayload: AccessTokenPayload,
  device: DeviceInfo
) {
  const accessToken = signAccessToken(accessPayload);
  const rawRefreshToken = generateRefreshToken();
  await RefreshToken.create({
    principalType,
    principalId,
    tokenHash: hashToken(rawRefreshToken),
    userAgent: device.userAgent,
    ipAddress: device.ipAddress,
    expiresAt: refreshTokenExpiryDate(),
  });
  return { accessToken, refreshToken: rawRefreshToken };
}

export const AuthService = {
  /** Staff (admin/manager/cashier/kitchen/inventory/delivery) login via email + password. */
  async staffLogin(email: string, password: string, device: DeviceInfo) {
    const user = await User.findOne({ email: email.toLowerCase(), isDeleted: false }).select('+passwordHash');
    if (!user || !user.isActive) throw ApiError.unauthorized('Invalid email or password');

    const validPassword = await verifyPassword(user.passwordHash, password);
    if (!validPassword) throw ApiError.unauthorized('Invalid email or password');

    const role = await Role.findOne({ name: user.role });
    if (!role) throw ApiError.internal('Role configuration missing for user');

    user.lastLoginAt = new Date();
    await user.save();

    const payload: StaffAccessTokenPayload = {
      type: 'STAFF',
      sub: user.id,
      role: user.role,
      permissions: role.permissions,
      outletIds: user.outletIds.map((id) => id.toString()),
    };

    const session = await issueSession('USER', user._id as Types.ObjectId, payload, device);
    return {
      ...session,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        outletIds: payload.outletIds,
      },
    };
  },

  /**
   * Customer login/registration in one step — no OTP. The person submits
   * name, mobile, email and address; we find-or-create the Customer record
   * by mobile number, save/update those details, and log them straight in.
   * (Previously this was a two-step mobile-OTP flow; that verification step
   * has been removed per product decision — see git history if it needs to
   * come back.)
   */
  async customerLogin(
    payload: { name: string; mobile: string; email?: string; address?: Partial<IAddress> },
    device: DeviceInfo
  ) {
    let customer = await Customer.findOne({ mobile: payload.mobile });

    if (!customer) {
      customer = await Customer.create({
        name: payload.name,
        mobile: payload.mobile,
        email: payload.email,
        addresses: payload.address?.line1
          ? [{ label: payload.address.label || 'Home', ...payload.address, isDefault: true }]
          : [],
      });
    } else {
      // Existing customer: refresh their saved details on every login.
      customer.name = payload.name;
      if (payload.email) customer.email = payload.email;
      if (payload.address?.line1) {
        const hasDefault = customer.addresses.some((a) => a.isDefault);
        customer.addresses.push({
          label: payload.address.label || 'Home',
          line1: payload.address.line1,
          line2: payload.address.line2,
          city: payload.address.city as string,
          state: payload.address.state as string,
          pincode: payload.address.pincode as string,
          isDefault: !hasDefault,
        });
      }
      await customer.save();
    }

    if (!customer.isActive || customer.isDeleted) throw ApiError.unauthorized('Account no longer active');

    const tokenPayload: CustomerAccessTokenPayload = { type: 'CUSTOMER', sub: customer.id, mobile: customer.mobile };
    const session = await issueSession('CUSTOMER', customer._id as Types.ObjectId, tokenPayload, device);
    return {
      ...session,
      customer: { id: customer.id, name: customer.name, mobile: customer.mobile, email: customer.email, addresses: customer.addresses },
    };
  },

  async refresh(rawRefreshToken: string, device: DeviceInfo) {
    const tokenHash = hashToken(rawRefreshToken);
    const stored = await RefreshToken.findOne({ tokenHash });
    if (!stored || stored.isRevoked || stored.expiresAt.getTime() < Date.now()) {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    // Rotate: revoke old, issue new
    stored.isRevoked = true;
    await stored.save();

    if (stored.principalType === 'USER') {
      const user = await User.findById(stored.principalId);
      if (!user || !user.isActive || user.isDeleted) throw ApiError.unauthorized('Account no longer active');
      const role = await Role.findOne({ name: user.role });
      const payload: StaffAccessTokenPayload = {
        type: 'STAFF',
        sub: user.id,
        role: user.role,
        permissions: role?.permissions ?? [],
        outletIds: user.outletIds.map((id) => id.toString()),
      };
      return issueSession('USER', user._id as Types.ObjectId, payload, device);
    }

    const customer = await Customer.findById(stored.principalId);
    if (!customer || !customer.isActive || customer.isDeleted) throw ApiError.unauthorized('Account no longer active');
    const payload: CustomerAccessTokenPayload = { type: 'CUSTOMER', sub: customer.id, mobile: customer.mobile };
    return issueSession('CUSTOMER', customer._id as Types.ObjectId, payload, device);
  },

  async logout(rawRefreshToken: string) {
    const tokenHash = hashToken(rawRefreshToken);
    await RefreshToken.updateOne({ tokenHash }, { isRevoked: true });
  },

  /**
   * Forgot-password architecture: issues a single-use, short-lived, hashed
   * reset token. Part 1 logs the raw token to the server console in place of
   * an email provider (see README "Known Limitations").
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await User.findOne({ email: email.toLowerCase(), isDeleted: false });
    if (!user) return; // do not leak account existence
    const rawToken = generateRefreshToken();
    user.passwordResetTokenHash = hashToken(rawToken);
    user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();
    // eslint-disable-next-line no-console
    console.log(`[DEV PASSWORD RESET] email=${email} token=${rawToken} (expires in 30 min)`);
  },

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const user = await User.findOne({ passwordResetTokenHash: tokenHash }).select(
      '+passwordResetTokenHash +passwordResetExpiresAt'
    );
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() < Date.now()) {
      throw ApiError.unauthorized('Invalid or expired reset token');
    }
    user.passwordHash = await hashPassword(newPassword);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    await user.save();
  },

  async changeStaffPassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await User.findById(userId).select('+passwordHash');
    if (!user) throw ApiError.notFound('User not found');
    const valid = await verifyPassword(user.passwordHash, currentPassword);
    if (!valid) throw ApiError.unauthorized('Current password is incorrect');
    user.passwordHash = await hashPassword(newPassword);
    await user.save();
  },
};
