import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { verifyAccessToken } from '../utils/tokenUtils';

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/** Requires a valid access token of any principal type (staff or customer). */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) return next(ApiError.unauthorized('Missing access token'));
  try {
    req.auth = verifyAccessToken(token);
    return next();
  } catch {
    return next(ApiError.unauthorized('Invalid or expired access token'));
  }
}

/** Like authenticate, but does not fail the request when a token is absent/invalid. */
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) return next();
  try {
    req.auth = verifyAccessToken(token);
  } catch {
    // ignore invalid token in optional mode
  }
  return next();
}

export function requireStaff(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth || req.auth.type !== 'STAFF') return next(ApiError.forbidden('Staff access required'));
  return next();
}

export function requireCustomer(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth || req.auth.type !== 'CUSTOMER') return next(ApiError.forbidden('Customer access required'));
  return next();
}
