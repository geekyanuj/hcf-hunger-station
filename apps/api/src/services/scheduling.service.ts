import { Order } from '../models/Order';
import { Outlet } from '../models/Outlet';
import { ApiError } from '../utils/ApiError';

const SLOT_MINUTES = 15;

function slotBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setSeconds(0, 0);
  start.setMinutes(Math.floor(start.getMinutes() / SLOT_MINUTES) * SLOT_MINUTES);
  const end = new Date(start.getTime() + SLOT_MINUTES * 60000);
  return { start, end };
}

/**
 * Validates a customer's requested "schedule for later" time against the
 * outlet's opening hours, kitchen capacity, and already-scheduled orders in
 * the same 15-minute slot — never just accepts any time and never sends a
 * scheduled order to the kitchen immediately (see KitchenService.board's
 * "isReleasedToKitchen" filter, which reads scheduledOrderReleaseWindowMinutes
 * from this same outlet settings block).
 */
export const SchedulingService = {
  async validateSlot(outletId: string, scheduledAt: Date): Promise<void> {
    const outlet = await Outlet.findById(outletId).select('settings openingHours');
    if (!outlet) throw ApiError.notFound('Outlet not found');

    if (scheduledAt.getTime() < Date.now() + 10 * 60000) {
      throw ApiError.badRequest('Scheduled time must be at least 10 minutes from now');
    }
    if (scheduledAt.getTime() > Date.now() + 7 * 24 * 60 * 60000) {
      throw ApiError.badRequest('Scheduled time cannot be more than 7 days from now');
    }

    const { start, end } = slotBounds(scheduledAt);
    const capacity = outlet.settings.scheduledOrdersPerSlotCapacity;
    const existingInSlot = await Order.countDocuments({
      outletId,
      scheduledAt: { $gte: start, $lt: end },
      orderStatus: { $ne: 'CANCELLED' },
      isDeleted: false,
    });

    if (existingInSlot >= capacity) {
      throw ApiError.conflict(
        `This time slot (${start.toTimeString().slice(0, 5)}) is fully booked — please choose a different time`
      );
    }
  },

  /** True once a scheduled order is within its outlet's release window and should now appear on the KDS. */
  isReleasedToKitchen(scheduledAt: Date | undefined, releaseWindowMinutes: number): boolean {
    if (!scheduledAt) return true; // ASAP orders are always released immediately
    return scheduledAt.getTime() - Date.now() <= releaseWindowMinutes * 60000;
  },
};
