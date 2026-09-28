import rateLimit from 'express-rate-limit';
import { NextFunction, Request, Response } from 'express';
import sanitize from 'mongo-sanitize';
import { env } from '../config/env';

export const globalRateLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.', errors: [] },
});

export const authRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many auth attempts, please slow down.', errors: [] },
});

/** Strips Mongo operator injection (`$`, `.`) from user-controlled input. */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
  req.body = sanitize(req.body);
  req.params = sanitize(req.params);
  // req.query is read-only in Express 5 / some setups; guard defensively.
  // mongo-sanitize mutates in place and returns the SAME object, so sanitise a copy — otherwise the
  // "delete every key, then re-assign" below would wipe the whole query string (every ?outletId=… request failed).
  const sanitizedQuery = sanitize({ ...(req.query as Record<string, unknown>) });
  Object.keys(req.query).forEach((k) => delete (req.query as Record<string, unknown>)[k]);
  Object.assign(req.query, sanitizedQuery);
  next();
}
