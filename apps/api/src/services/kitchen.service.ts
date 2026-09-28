import { Order, OrderStatus } from '../models/Order';
import { Outlet } from '../models/Outlet';
import { ApiError } from '../utils/ApiError';
import { SchedulingService } from './scheduling.service';

export type KitchenLoadState = 'normal' | 'busy' | 'critical';

/** Orders the kitchen is still responsible for (not yet READY). */
const KITCHEN_ACTIVE_STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING'];

export const KitchenService = {
  /**
   * Orders grouped for the KDS board: NEW (pending/confirmed), PREPARING,
   * READY, COMPLETED (recent). A scheduled order only appears in NEW once
   * it's within the outlet's release window (Outlet.settings.
   * scheduledOrderReleaseWindowMinutes) — it does not go to the kitchen the
   * instant it's placed, per the spec. Orders still waiting are returned
   * separately as `scheduled` so the KDS can show "5 upcoming" without
   * treating them as actionable yet.
   */
  async board(outletId: string) {
    const outlet = await Outlet.findById(outletId).select('settings');
    const releaseWindow = outlet?.settings.scheduledOrderReleaseWindowMinutes ?? 45;

    const [candidateNew, preparingOrders, readyOrders, recentlyCompleted] = await Promise.all([
      Order.find({ outletId, orderStatus: { $in: ['PENDING', 'CONFIRMED'] }, isDeleted: false }).sort({ createdAt: 1 }),
      Order.find({ outletId, orderStatus: 'PREPARING', isDeleted: false }).sort({ createdAt: 1 }),
      Order.find({ outletId, orderStatus: 'READY', isDeleted: false }).sort({ createdAt: 1 }),
      Order.find({ outletId, orderStatus: 'COMPLETED', isDeleted: false })
        .sort({ updatedAt: -1 })
        .limit(10),
    ]);

    const newOrders = candidateNew.filter((o) => SchedulingService.isReleasedToKitchen(o.scheduledAt, releaseWindow));
    const scheduled = candidateNew.filter((o) => !SchedulingService.isReleasedToKitchen(o.scheduledAt, releaseWindow));

    return { new: newOrders, preparing: preparingOrders, ready: readyOrders, completed: recentlyCompleted, scheduled };
  },

  /**
   * Active/pending/delayed order counts, average prep time, and a
   * normal/busy/critical state derived entirely from
   * outlet.settings.kitchenLoadThresholds — never hard-coded here.
   */
  async workload(outletId: string) {
    const outlet = await Outlet.findById(outletId).select('settings');
    if (!outlet) throw ApiError.notFound('Outlet not found');

    const thresholds = outlet.settings.kitchenLoadThresholds;
    const activeOrders = await Order.find({ outletId, orderStatus: { $in: KITCHEN_ACTIVE_STATUSES }, isDeleted: false });

    const now = Date.now();
    const delayedOrders = activeOrders.filter((o) => {
      const ageMinutes = (now - o.createdAt.getTime()) / 60000;
      return ageMinutes > thresholds.delayedOrderMinutes;
    });

    const pendingOrders = activeOrders.filter((o) => o.orderStatus === 'PENDING' || o.orderStatus === 'CONFIRMED');

    const avgPrepMinutes =
      activeOrders.length > 0
        ? activeOrders.reduce((sum, o) => sum + (o.estimatedPreparationMinutesMin + o.estimatedPreparationMinutesMax) / 2, 0) /
          activeOrders.length
        : 0;

    let state: KitchenLoadState = 'normal';
    if (activeOrders.length >= thresholds.criticalActiveOrders) state = 'critical';
    else if (activeOrders.length >= thresholds.busyActiveOrders) state = 'busy';

    return {
      activeOrders: activeOrders.length,
      pendingOrders: pendingOrders.length,
      delayedOrders: delayedOrders.length,
      averagePreparationMinutes: Math.round(avgPrepMinutes),
      state,
      thresholds,
    };
  },
};
