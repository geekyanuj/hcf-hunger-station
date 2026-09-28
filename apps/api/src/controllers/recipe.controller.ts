import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { RecipeService } from '../services/recipe.service';

export const RecipeController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
    const recipes = await RecipeService.list(outletId);
    return sendSuccess(res, recipes);
  }),

  getForMenuItem: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
    const recipe = await RecipeService.getForMenuItem(outletId, req.params.menuItemId);
    return sendSuccess(res, recipe);
  }),

  upsert: asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth || req.auth.type !== 'STAFF') throw ApiError.forbidden('Staff access required');
    const { outletId, menuItemId, ingredients, yieldServings } = req.body;
    const recipe = await RecipeService.upsert(outletId, menuItemId, ingredients, yieldServings, {
      userId: req.auth.sub,
      ipAddress: req.ip,
    });
    return sendSuccess(res, recipe, 'Recipe saved', 201);
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    await RecipeService.remove(outletId, req.params.menuItemId);
    return sendSuccess(res, null, 'Recipe removed');
  }),

  cost: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
    const breakdown = await RecipeService.calculateCost(outletId, req.params.menuItemId);
    return sendSuccess(res, breakdown);
  }),
};
