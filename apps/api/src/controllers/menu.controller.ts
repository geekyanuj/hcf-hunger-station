import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { MenuService } from '../services/menu.service';
import { Table } from '../models/Table';
import { cacheGet, cacheSet, cacheInvalidate } from '../utils/cache';

const MENU_CACHE_TTL_SECONDS = 30;

export const MenuController = {
  /**
   * The one concrete Redis use case in this project: the full menu is read
   * far more often than it's written (every customer landing on the menu
   * page), so a short-TTL cache meaningfully cuts MongoDB load under
   * traffic. Falls straight through to MenuService when Redis is
   * unavailable — see utils/cache.ts.
   */
  getFullMenu: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');

    const cacheKey = `menu:${outletId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return sendSuccess(res, cached);

    const menu = await MenuService.getFullMenu(outletId);
    await cacheSet(cacheKey, menu, MENU_CACHE_TTL_SECONDS);
    return sendSuccess(res, menu);
  }),

  listCategories: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
    const categories = await MenuService.listCategories(outletId);
    return sendSuccess(res, categories);
  }),

  createCategory: asyncHandler(async (req: Request, res: Response) => {
    const category = await MenuService.createCategory(req.body);
    await cacheInvalidate(`menu:${req.body.outletId}`);
    return sendSuccess(res, category, 'Category created', 201);
  }),

  listItems: asyncHandler(async (req: Request, res: Response) => {
    const { outletId, categoryId, search, featured } = req.query as Record<string, string>;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
    const items = await MenuService.listItems({ outletId, categoryId, search, featuredOnly: featured === 'true' });
    return sendSuccess(res, items);
  }),

  getItemById: asyncHandler(async (req: Request, res: Response) => {
    const item = await MenuService.getItemById(req.params.id);
    return sendSuccess(res, item);
  }),

  createItem: asyncHandler(async (req: Request, res: Response) => {
    const item = await MenuService.createItem(req.body);
    await cacheInvalidate(`menu:${req.body.outletId}`);
    return sendSuccess(res, item, 'Menu item created', 201);
  }),

  updateItem: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.auth?.type === 'STAFF' ? req.auth.sub : undefined;
    const item = await MenuService.updateItem(req.params.id, req.body, { userId, ipAddress: req.ip });
    await cacheInvalidate(`menu:${item.outletId}`);
    return sendSuccess(res, item, 'Menu item updated');
  }),

  setAvailability: asyncHandler(async (req: Request, res: Response) => {
    const item = await MenuService.setAvailability(req.params.id, req.body.isAvailable);
    await cacheInvalidate(`menu:${item.outletId}`);
    return sendSuccess(res, item, 'Availability updated');
  }),

  createModifier: asyncHandler(async (req: Request, res: Response) => {
    const modifier = await MenuService.createModifier(req.body);
    await cacheInvalidate(`menu:${req.body.outletId}`);
    return sendSuccess(res, modifier, 'Modifier created', 201);
  }),

  listModifiers: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    const modifiers = await MenuService.listModifiers(outletId);
    return sendSuccess(res, modifiers);
  }),

  /** Handles a single-image upload for a menu item (multipart/form-data, field "image") and returns its public URL. */
  uploadImage: asyncHandler(async (req: Request, res: Response) => {
    const url = `/uploads/menu/${req.file!.filename}`;
    return sendSuccess(res, { url }, 'Image uploaded', 201);
  }),

  /** Resolves a scanned table QR token to outlet + table info for the dine-in landing flow. */
  resolveTable: asyncHandler(async (req: Request, res: Response) => {
    const table = await Table.findOne({ qrToken: req.params.qrToken, isActive: true, isDeleted: false }).populate('outletId');
    if (!table) throw ApiError.notFound('Table not found or inactive');
    return sendSuccess(res, table);
  }),
};
