import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { toCsv } from '../utils/csv';
import { Order } from '../models/Order';
import { InventoryItem } from '../models/InventoryItem';
import { Purchase } from '../models/Purchase';
import { Wastage } from '../models/Wastage';
import { Customer } from '../models/Customer';

function sendCsv(res: Response, filename: string, csv: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(csv);
}

function requireOutletId(req: Request): string {
  const outletId = req.query.outletId as string;
  if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
  return outletId;
}

export const ExportController = {
  orders: asyncHandler(async (req: Request, res: Response) => {
    const outletId = requireOutletId(req);
    const orders = await Order.find({ outletId, isDeleted: false }).sort({ createdAt: -1 }).limit(5000).lean();
    const csv = toCsv(orders as unknown as Record<string, unknown>[], [
      { key: 'orderNumber', header: 'Order Number' },
      { key: 'tokenNumber', header: 'Token' },
      { key: 'orderType', header: 'Type' },
      { key: 'orderStatus', header: 'Status' },
      { key: 'paymentStatus', header: 'Payment Status' },
      { key: 'subtotal', header: 'Subtotal' },
      { key: 'discount', header: 'Discount' },
      { key: 'tax', header: 'Tax' },
      { key: 'total', header: 'Total' },
      { key: 'createdAt', header: 'Created At' },
    ]);
    sendCsv(res, 'orders.csv', csv);
  }),

  inventory: asyncHandler(async (req: Request, res: Response) => {
    const outletId = requireOutletId(req);
    const items = await InventoryItem.find({ outletId, isDeleted: false }).lean();
    const csv = toCsv(items as unknown as Record<string, unknown>[], [
      { key: 'name', header: 'Name' },
      { key: 'sku', header: 'SKU' },
      { key: 'category', header: 'Category' },
      { key: 'unit', header: 'Unit' },
      { key: 'currentStock', header: 'Current Stock' },
      { key: 'minimumStock', header: 'Minimum Stock' },
      { key: 'costPerUnit', header: 'Cost Per Unit' },
    ]);
    sendCsv(res, 'inventory.csv', csv);
  }),

  purchases: asyncHandler(async (req: Request, res: Response) => {
    const outletId = requireOutletId(req);
    const purchases = await Purchase.find({ outletId }).populate('supplierId', 'name').sort({ createdAt: -1 }).limit(5000).lean();
    const rows = purchases.map((p) => ({ ...p, supplierName: (p.supplierId as unknown as { name?: string })?.name }));
    const csv = toCsv(rows as unknown as Record<string, unknown>[], [
      { key: 'purchaseNumber', header: 'PO Number' },
      { key: 'supplierName', header: 'Supplier' },
      { key: 'subtotal', header: 'Subtotal' },
      { key: 'tax', header: 'Tax' },
      { key: 'total', header: 'Total' },
      { key: 'status', header: 'Status' },
      { key: 'paymentStatus', header: 'Payment Status' },
      { key: 'purchaseDate', header: 'Purchase Date' },
    ]);
    sendCsv(res, 'purchases.csv', csv);
  }),

  wastage: asyncHandler(async (req: Request, res: Response) => {
    const outletId = requireOutletId(req);
    const records = await Wastage.find({ outletId }).populate('inventoryItemId', 'name unit').sort({ createdAt: -1 }).limit(5000).lean();
    const rows = records.map((w) => ({ ...w, itemName: (w.inventoryItemId as unknown as { name?: string })?.name }));
    const csv = toCsv(rows as unknown as Record<string, unknown>[], [
      { key: 'itemName', header: 'Item' },
      { key: 'quantity', header: 'Quantity' },
      { key: 'reason', header: 'Reason' },
      { key: 'estimatedValue', header: 'Estimated Value' },
      { key: 'createdAt', header: 'Date' },
    ]);
    sendCsv(res, 'wastage.csv', csv);
  }),

  /** Customers are outlet-agnostic in this schema; access is gated by customers.manage rather than outlet scope. */
  customers: asyncHandler(async (_req: Request, res: Response) => {
    const customers = await Customer.find({ isDeleted: false }).limit(5000).lean();
    const csv = toCsv(customers as unknown as Record<string, unknown>[], [
      { key: 'name', header: 'Name' },
      { key: 'mobile', header: 'Mobile' },
      { key: 'email', header: 'Email' },
      { key: 'loyaltyPoints', header: 'Loyalty Points' },
      { key: 'createdAt', header: 'Joined' },
    ]);
    sendCsv(res, 'customers.csv', csv);
  }),
};
