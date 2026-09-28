import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { AccessTokenPayload } from '../types/auth';

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: jwt.SignOptions = { expiresIn: env.jwt.accessExpiresIn as jwt.SignOptions['expiresIn'] };
  return jwt.sign(payload as object, env.jwt.accessSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwt.accessSecret) as unknown as AccessTokenPayload;
}

/**
 * Refresh tokens are opaque random strings (not JWTs). We store only a SHA-256
 * hash of the token server-side (see RefreshToken model), so a leaked database
 * dump cannot be used to mint new sessions. Refresh token rotation: each
 * refresh call revokes the old token and issues a new one.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function refreshTokenExpiryDate(): Date {
  const days = parseDurationToMs(env.jwt.refreshExpiresIn);
  return new Date(Date.now() + days);
}

function parseDurationToMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7 days
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return value * multipliers[unit];
}
