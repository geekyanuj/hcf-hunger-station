import { Types } from 'mongoose';
import { InventoryItem } from '../models/InventoryItem';
import { InventoryLedger } from '../models/InventoryLedger';
import { Purchase } from '../models/Purchase';
import { Wastage } from '../models/Wastage';
import { InventoryService } from './inventory.service';
import { WastageService } from './wastage.service';

export const InventoryDashboardService = {
  async summary(outletId: string) {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalValue,
      lowStockItems,
      outOfStockItems,
      criticalStockCount,
      recentPurchases,
      recentWastage,
      wastageValue30d,
      topConsumed,
    ] = await Promise.all([
      InventoryService.totalInventoryValue(outletId),
      InventoryItem.find({ outletId, isDeleted: false, $expr: { $lt: ['$currentStock', '$minimumStock'] } })
        .sort({ currentStock: 1 })
        .limit(20),
      InventoryItem.find({ outletId, isDeleted: false, currentStock: { $lte: 0 } }),
      InventoryService.criticalStockCount(outletId),
      Purchase.find({ outletId }).sort({ createdAt: -1 }).limit(5).populate('supplierId', 'name'),
      Wastage.find({ outletId }).sort({ createdAt: -1 }).limit(5).populate('inventoryItemId', 'name unit'),
      WastageService.totalValueForPeriod(outletId, since30d),
      InventoryLedger.aggregate([
        { $match: { outletId: new Types.ObjectId(outletId), type: 'SALE_CONSUMPTION', createdAt: { $gte: since30d } } },
        { $group: { _id: '$inventoryItemId', totalConsumed: { $sum: { $abs: '$quantity' } } } },
        { $sort: { totalConsumed: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'inventoryitems', localField: '_id', foreignField: '_id', as: 'item' } },
        { $unwind: '$item' },
        { $project: { _id: 0, name: '$item.name', unit: '$item.unit', totalConsumed: 1 } },
      ]).catch(() => []),
    ]);

    return {
      totalInventoryValue: totalValue,
      lowStockCount: lowStockItems.length,
      lowStockItems,
      outOfStockCount: outOfStockItems.length,
      outOfStockItems,
      criticalStockCount,
      recentPurchases,
      recentWastage,
      wastageValueLast30Days: wastageValue30d,
      topConsumedIngredients: topConsumed,
    };
  },
};
