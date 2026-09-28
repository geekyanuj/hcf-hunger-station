import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import { env } from '../config/env';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}`, errors: [] });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ApiError) {
    if (err.statusCode >= 500) logger.error(err.stack ?? err.message);
    return res.status(err.statusCode).json({ success: false, message: err.message, errors: err.errors });
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  logger.error(err instanceof Error ? err.stack ?? message : String(err));

  return res.status(500).json({
    success: false,
    message: env.isProduction ? 'Internal server error' : message,
    errors: [],
  });
}
