import { Types } from 'mongoose';
import { Order } from '../models/Order';
import { Purchase } from '../models/Purchase';
import { Wastage } from '../models/Wastage';
import { Payment } from '../models/Payment';
import { InventoryLedger } from '../models/InventoryLedger';

export interface DateRange {
  from: Date;
  to: Date;
}

/** Builds the outlet portion of a match stage: a single outlet, or every outlet ('ALL' — caller must already have verified this is permitted, see analytics.controller.ts). */
function outletMatch(outletIds: string[] | 'ALL'): Record<string, unknown> {
  if (outletIds === 'ALL') return {};
  return { outletId: { $in: outletIds.map((id) => new Types.ObjectId(id)) } };
}

const SUCCESSFUL_ORDER_MATCH = { isDeleted: false, orderStatus: { $ne: 'CANCELLED' } };

export const AnalyticsService = {
  /** Revenue + order count bucketed by day across the date range - the backbone of the "revenue over time" chart. */
  async revenueOverTime(outletIds: string[] | 'ALL', range: DateRange) {
    return Order.aggregate([
      { $match: { ...outletMatch(outletIds), ...SUCCESSFUL_ORDER_MATCH, createdAt: { $gte: range.from, $lte: range.to } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', revenue: 1, orders: 1 } },
    ]);
  },

  async orderTypeDistribution(outletIds: string[] | 'ALL', range: DateRange) {
    return Order.aggregate([
      { $match: { ...outletMatch(outletIds), ...SUCCESSFUL_ORDER_MATCH, createdAt: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: '$orderType', count: { $sum: 1 }, revenue: { $sum: '$total' } } },
      { $project: { _id: 0, orderType: '$_id', count: 1, revenue: 1 } },
      { $sort: { count: -1 } },
    ]);
  },

  async topProducts(outletIds: string[] | 'ALL', range: DateRange, limit = 10) {
    return Order.aggregate([
      { $match: { ...outletMatch(outletIds), ...SUCCESSFUL_ORDER_MATCH, createdAt: { $gte: range.from, $lte: range.to } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.menuItemId',
          name: { $first: '$items.name' },
          quantitySold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.lineTotal' },
        },
      },
      { $sort: { quantitySold: -1 } },
      { $limit: limit },
      { $project: { _id: 0, menuItemId: '$_id', name: 1, quantitySold: 1, revenue: 1 } },
    ]);
  },

  async categoryPerformance(outletIds: string[] | 'ALL', range: DateRange) {
    return Order.aggregate([
      { $match: { ...outletMatch(outletIds), ...SUCCESSFUL_ORDER_MATCH, createdAt: { $gte: range.from, $lte: range.to } } },
      { $unwind: '$items' },
      { $lookup: { from: 'menuitems', localField: 'items.menuItemId', foreignField: '_id', as: 'menuItem' } },
      { $unwind: { path: '$menuItem', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'menucategories', localField: 'menuItem.categoryId', foreignField: '_id', as: 'category' } },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$category._id',
          categoryName: { $first: { $ifNull: ['$category.name', 'Uncategorized'] } },
          quantitySold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.lineTotal' },
        },
      },
      { $sort: { revenue: -1 } },
      { $project: { _id: 0, categoryId: '$_id', categoryName: 1, quantitySold: 1, revenue: 1 } },
    ]);
  },

  async paymentMethodBreakdown(outletIds: string[] | 'ALL', range: DateRange) {
    return Payment.aggregate([
      {
        $match: {
          ...outletMatch(outletIds),
          status: 'SUCCESS',
          createdAt: { $gte: range.from, $lte: range.to },
        },
      },
      { $group: { _id: '$method', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $project: { _id: 0, method: '$_id', total: 1, count: 1 } },
      { $sort: { total: -1 } },
    ]);
  },

  async purchaseTrend(outletIds: string[] | 'ALL', range: DateRange) {
    return Purchase.aggregate([
      { $match: { ...outletMatch(outletIds), status: 'COMPLETED', createdAt: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$total' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', total: 1, count: 1 } },
    ]);
  },

  async wastageTrend(outletIds: string[] | 'ALL', range: DateRange) {
    return Wastage.aggregate([
      { $match: { ...outletMatch(outletIds), createdAt: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, value: { $sum: '$estimatedValue' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', value: 1, count: 1 } },
    ]);
  },

  /** Total ingredient cost consumed (from the ledger's SALE_CONSUMPTION entries valued at each item's costPerUnit at write time is not stored, so this approximates using current costPerUnit via a $lookup — documented in docs/PART3.md as an approximation, not an exact historical cost). */
  async foodCostSummary(outletIds: string[] | 'ALL', range: DateRange) {
    const [consumption, revenue] = await Promise.all([
      InventoryLedger.aggregate([
        { $match: { ...outletMatch(outletIds), type: 'SALE_CONSUMPTION', createdAt: { $gte: range.from, $lte: range.to } } },
        { $lookup: { from: 'inventoryitems', localField: 'inventoryItemId', foreignField: '_id', as: 'item' } },
        { $unwind: '$item' },
        { $project: { cost: { $multiply: [{ $abs: '$quantity' }, '$item.costPerUnit'] } } },
        { $group: { _id: null, totalFoodCost: { $sum: '$cost' } } },
      ]),
      Order.aggregate([
        { $match: { ...outletMatch(outletIds), ...SUCCESSFUL_ORDER_MATCH, createdAt: { $gte: range.from, $lte: range.to } } },
        { $group: { _id: null, totalRevenue: { $sum: '$total' } } },
      ]),
    ]);

    const totalFoodCost = consumption[0]?.totalFoodCost ?? 0;
    const totalRevenue = revenue[0]?.totalRevenue ?? 0;
    const foodCostPercent = totalRevenue > 0 ? Math.round((totalFoodCost / totalRevenue) * 1000) / 10 : 0;

    return { totalFoodCost: Math.round(totalFoodCost * 100) / 100, totalRevenue, foodCostPercent };
  },

  async outletPerformance(outletIds: string[] | 'ALL', range: DateRange) {
    return Order.aggregate([
      { $match: { ...outletMatch(outletIds), ...SUCCESSFUL_ORDER_MATCH, createdAt: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: '$outletId', revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
      { $lookup: { from: 'outlets', localField: '_id', foreignField: '_id', as: 'outlet' } },
      { $unwind: '$outlet' },
      { $project: { _id: 0, outletId: '$_id', outletName: '$outlet.name', revenue: 1, orders: 1, averageOrderValue: { $divide: ['$revenue', '$orders'] } } },
      { $sort: { revenue: -1 } },
    ]);
  },

  /** Orders processed per staff member (POS orders they created, or delivery orders they fulfilled) - the closest available proxy for "staff performance" without a dedicated shift/attendance system. */
  async staffPerformance(outletIds: string[] | 'ALL', range: DateRange) {
    return Order.aggregate([
      {
        $match: {
          ...outletMatch(outletIds),
          ...SUCCESSFUL_ORDER_MATCH,
          createdAt: { $gte: range.from, $lte: range.to },
          $or: [{ createdByUserId: { $exists: true } }, { deliveryStaffId: { $exists: true } }],
        },
      },
      {
        $group: {
          _id: { $ifNull: ['$createdByUserId', '$deliveryStaffId'] },
          ordersHandled: { $sum: 1 },
          revenue: { $sum: '$total' },
        },
      },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { _id: 0, userId: '$_id', name: '$user.name', role: '$user.role', ordersHandled: 1, revenue: 1 } },
      { $sort: { ordersHandled: -1 } },
    ]);
  },
};
