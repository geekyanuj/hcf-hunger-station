import { Types } from 'mongoose';
import { Order } from '../models/Order';
import { Outlet, IOutletSettings } from '../models/Outlet';

export interface PrepTimeInput {
  outletId: Types.ObjectId | string;
  items: { preparationTimeMinutes: number; quantity: number }[];
  orderType: 'DELIVERY' | 'TAKEAWAY' | 'DINE_IN' | 'POS' | 'CATERING';
  scheduledAt?: Date | null;
}

export interface PrepTimeEstimate {
  minMinutes: number;
  maxMinutes: number;
  factors: {
    baseMinutes: number;
    kitchenLoadMinutes: number;
    rushApplied: boolean;
    activeOrders: number;
    kitchenCapacityPerSlot: number;
  };
}

const RUSH_WINDOWS: { startHour: number; endHour: number }[] = [
  { startHour: 12, endHour: 15 }, // lunch rush
  { startHour: 19, endHour: 22 }, // dinner rush
];

function isRushHour(date: Date): boolean {
  const hour = date.getHours();
  return RUSH_WINDOWS.some((w) => hour >= w.startHour && hour < w.endHour);
}

/**
 * Modular preparation-time estimator.
 *
 * Step 1 - Base time: the slowest item in the cart dominates (kitchen stations
 * work in parallel on different items of the same order), plus a small
 * per-extra-item allowance for items beyond the first, since a busy line still
 * has to plate everything before the order is "ready".
 *
 * Step 2 - Kitchen load: count currently active (PENDING/CONFIRMED/PREPARING)
 * orders at this outlet. Each "slot" of kitchenCapacityPerSlot concurrent
 * orders beyond the first adds queueing delay.
 *
 * Step 3 - Rush multiplier: if the current time (or scheduled time, for
 * scheduled orders) falls in a configured rush window, load impact is
 * amplified by outlet.settings.rushMultiplier.
 *
 * The function returns a range (min-max) rather than a single number, and is
 * intentionally isolated behind this module so the algorithm can be swapped
 * out (e.g. for a trained model) without touching order-creation code.
 */
export const PrepTimeEstimationService = {
  async estimate(input: PrepTimeInput): Promise<PrepTimeEstimate> {
    const outlet = await Outlet.findById(input.outletId).select('settings');
    const settings: IOutletSettings = outlet?.settings ?? ({
      kitchenCapacityPerSlot: 6,
      rushMultiplier: 1.4,
    } as IOutletSettings);

    const sortedByTime = [...input.items].sort((a, b) => b.preparationTimeMinutes - a.preparationTimeMinutes);
    const slowestItem = sortedByTime[0]?.preparationTimeMinutes ?? 10;
    const totalExtraItems = Math.max(
      0,
      input.items.reduce((sum, i) => sum + i.quantity, 0) - 1
    );
    const baseMinutes = slowestItem + Math.min(totalExtraItems * 1.5, 15); // cap extra-item overhead

    const referenceTime = input.scheduledAt ?? new Date();
    const activeOrders = await Order.countDocuments({
      outletId: input.outletId,
      orderStatus: { $in: ['PENDING', 'CONFIRMED', 'PREPARING'] },
      isDeleted: false,
    });

    const capacity = settings.kitchenCapacityPerSlot || 6;
    const excessLoad = Math.max(0, activeOrders - capacity);
    let kitchenLoadMinutes = excessLoad * 1.2; // ~1.2 min added per order beyond kitchen capacity

    const rushApplied = isRushHour(referenceTime);
    if (rushApplied) {
      kitchenLoadMinutes *= settings.rushMultiplier || 1.4;
    }

    // Dine-in tends to run slightly faster to the table since there's no
    // packaging/handoff step; delivery gets a small buffer for handoff to rider.
    const orderTypeAdjustment = input.orderType === 'DINE_IN' ? -1 : input.orderType === 'DELIVERY' ? 2 : 0;

    const rawMin = baseMinutes + kitchenLoadMinutes * 0.6 + orderTypeAdjustment;
    const rawMax = baseMinutes + kitchenLoadMinutes * 1.2 + orderTypeAdjustment + 5;

    const minMinutes = Math.max(3, Math.round(rawMin));
    const maxMinutes = Math.max(minMinutes + 3, Math.round(rawMax));

    return {
      minMinutes,
      maxMinutes,
      factors: {
        baseMinutes: Math.round(baseMinutes),
        kitchenLoadMinutes: Math.round(kitchenLoadMinutes),
        rushApplied,
        activeOrders,
        kitchenCapacityPerSlot: capacity,
      },
    };
  },
};
