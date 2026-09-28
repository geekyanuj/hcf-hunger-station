import { Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { Table } from '../models/Table';

export const TableController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
    const tables = await Table.find({ outletId, isDeleted: false }).sort({ tableNumber: 1 });
    return sendSuccess(res, tables);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const { outletId, tableNumber, capacity } = req.body;
    const table = await Table.create({ outletId, tableNumber, capacity, qrToken: uuid() });
    return sendSuccess(res, table, 'Table created', 201);
  }),

  regenerateQr: asyncHandler(async (req: Request, res: Response) => {
    const table = await Table.findByIdAndUpdate(req.params.id, { qrToken: uuid() }, { new: true });
    if (!table) throw ApiError.notFound('Table not found');
    return sendSuccess(res, table, 'QR token regenerated');
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { tableNumber, capacity, status } = req.body;
    const payload: Record<string, unknown> = {};
    if (tableNumber !== undefined) payload.tableNumber = tableNumber;
    if (capacity !== undefined) payload.capacity = capacity;
    if (status !== undefined) {
      payload.status = status;
      payload.isActive = status !== 'INACTIVE';
    }
    const table = await Table.findByIdAndUpdate(req.params.id, payload, { new: true });
    if (!table) throw ApiError.notFound('Table not found');
    return sendSuccess(res, table, 'Table updated');
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const table = await Table.findByIdAndUpdate(req.params.id, { isDeleted: true, isActive: false, status: 'INACTIVE' }, { new: true });
    if (!table) throw ApiError.notFound('Table not found');
    return sendSuccess(res, null, 'Table removed');
  }),
};
