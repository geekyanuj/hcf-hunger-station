import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { PartyOrderService } from '../services/partyOrder.service';

export const PartyOrderController = {
  submit: asyncHandler(async (req: Request, res: Response) => {
    const customerId = req.auth?.type === 'CUSTOMER' ? req.auth.sub : undefined;
    const partyOrder = await PartyOrderService.submit({
      ...req.body,
      eventDate: new Date(req.body.eventDate),
      customerId,
    });
    return sendSuccess(res, partyOrder, 'Party/catering request submitted', 201);
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
    const list = await PartyOrderService.list(outletId, req.query.status as string | undefined);
    return sendSuccess(res, list);
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const partyOrder = await PartyOrderService.getById(req.params.id);
    return sendSuccess(res, partyOrder);
  }),

  markContacted: asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth || req.auth.type !== 'STAFF') throw ApiError.forbidden('Staff access required');
    const partyOrder = await PartyOrderService.markContacted(req.params.id, req.auth.sub);
    return sendSuccess(res, partyOrder, 'Marked as contacted');
  }),

  addQuotation: asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth || req.auth.type !== 'STAFF') throw ApiError.forbidden('Staff access required');
    const { description, amount, validUntil, notes } = req.body;
    const partyOrder = await PartyOrderService.addQuotation(req.params.id, description, amount, validUntil, notes, req.auth.sub);
    return sendSuccess(res, partyOrder, 'Quotation added');
  }),

  approve: asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth || req.auth.type !== 'STAFF') throw ApiError.forbidden('Staff access required');
    const partyOrder = await PartyOrderService.approve(req.params.id, req.auth.sub);
    return sendSuccess(res, partyOrder, 'Quotation approved');
  }),

  reject: asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth || req.auth.type !== 'STAFF') throw ApiError.forbidden('Staff access required');
    const partyOrder = await PartyOrderService.reject(req.params.id, req.body.reason ?? '', req.auth.sub);
    return sendSuccess(res, partyOrder, 'Request rejected');
  }),

  convert: asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth || req.auth.type !== 'STAFF') throw ApiError.forbidden('Staff access required');
    const result = await PartyOrderService.convertToOrder(req.params.id, req.body, req.auth.sub);
    return sendSuccess(res, result, 'Converted to order', 201);
  }),
};
