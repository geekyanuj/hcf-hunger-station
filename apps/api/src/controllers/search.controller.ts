import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { SearchService } from '../services/search.service';
import { resolveOutletScope } from './reportScope.util';

export const SearchController = {
  search: asyncHandler(async (req: Request, res: Response) => {
    const query = (req.query.q as string) ?? '';
    if (query.trim().length < 2) throw ApiError.badRequest('Search query must be at least 2 characters');
    if (!req.auth || req.auth.type !== 'STAFF') throw ApiError.forbidden('Staff access required');

    const outletIds = resolveOutletScope(req);
    const results = await SearchService.search(query.trim(), { outletIds, permissions: req.auth.permissions });
    return sendSuccess(res, results);
  }),
};
