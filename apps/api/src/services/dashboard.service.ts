import { Types } from 'mongoose';
import { Order } from '../models/Order';
import { AnalyticsService } from './analytics.service';
import { KitchenService } from './kitchen.service';
import { InventoryDashboardService } from './inventoryDashboard.service';
import { DashboardResetService } from './dashboardReset.service';

function todayRange() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function outletMatch(outletIds: string[] | 'ALL') {
  if (outletIds === 'ALL') return {};
  return { outletId: { $in: outletIds.map((id) => new Types.ObjectId(id)) } };
}

export const DashboardService = {
  /**
   * Consolidates Today's Overview + Kitchen + Inventory + Sales for the
   * admin dashboard. `outletIds` is either a single-outlet array (a
   * manager's assigned outlets) or the literal 'ALL' (owner viewing every
   * outlet at once) — access control for which is allowed happens in
   * dashboard.controller.ts, not here.
   */
  async overview(outletIds: string[] | 'ALL') {
    const today = todayRange();
    const to = today.to;

    // "Reset dashboard": once the owner has reset it, the dashboard only counts orders created after that moment.
    // Nothing is deleted - orders/analytics/exports are unaffected (see models/DashboardReset.ts).
    const lastReset = await DashboardResetService.latest(outletIds);
    const notBefore = (d: Date) => (lastReset && lastReset.at > d ? lastReset.at : d);
    const from = notBefore(today.from);
    const trendFrom = notBefore(new Date(Date.now() - 6 * 86400000));

    const match = { ...outletMatch(outletIds), isDeleted: false, orderStatus: { $ne: 'CANCELLED' as const }, createdAt: { $gte: from, $lte: to } };

    const [todayAgg, typeBreakdown, topProducts, categoryPerformance, revenueTrend] = await Promise.all([
      Order.aggregate([
        { $match: match },
        { $group: { _id: null, sales: { $sum: '$total' }, orders: { $sum: 1 } } },
      ]),
      AnalyticsService.orderTypeDistribution(outletIds, { from, to }),
      AnalyticsService.topProducts(outletIds, { from, to }, 1),
      AnalyticsService.categoryPerformance(outletIds, { from, to }),
      AnalyticsService.revenueOverTime(outletIds, { from: trendFrom, to }),
    ]);

    const sales = todayAgg[0]?.sales ?? 0;
    const orders = todayAgg[0]?.orders ?? 0;
    const averageOrderValue = orders > 0 ? Math.round((sales / orders) * 100) / 100 : 0;

    const countByType = (type: string) => typeBreakdown.find((t: { orderType: string }) => t.orderType === type)?.count ?? 0;

    // Kitchen/inventory summaries only make sense for a single outlet (they're operational, live-floor views).
    let kitchen = null;
    let inventory = null;
    if (outletIds !== 'ALL' && outletIds.length === 1) {
      [kitchen, inventory] = await Promise.all([
        KitchenService.workload(outletIds[0]),
        InventoryDashboardService.summary(outletIds[0]),
      ]);
    }

    return {
      /** Present only if the dashboard has been reset; the figures below then count from this moment. */
      lastReset: lastReset ? { at: lastReset.at.toISOString(), by: lastReset.by } : null,
      todaysOverview: {
        sales,
        orders,
        averageOrderValue,
        dineInOrders: countByType('DINE_IN'),
        takeawayOrders: countByType('TAKEAWAY'),
        deliveryOrders: countByType('DELIVERY'),
        posOrders: countByType('POS'),
        cateringOrders: countByType('CATERING'),
      },
      kitchen,
      inventory: inventory
        ? {
            lowStockCount: inventory.lowStockCount,
            outOfStockCount: inventory.outOfStockCount,
            totalInventoryValue: inventory.totalInventoryValue,
          }
        : null,
      sales: {
        bestSellingItem: topProducts[0] ?? null,
        bestCategory: categoryPerformance[0] ?? null,
        revenueTrend,
      },
    };
  },
};
