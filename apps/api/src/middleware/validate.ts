import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';

export function validate(schema: AnyZodObject) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({ body: req.body, query: req.query, params: req.params });
      if (parsed.body) req.body = parsed.body;
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(ApiError.badRequest('Validation failed', err.errors));
      }
      return next(err);
    }
  };
}
