import { describe, it, expect } from 'vitest';
import { buildOrderMigration } from '../../scripts/migrateOrderStatuses';

const created = new Date('2026-09-01T10:00:00Z');
const t = (m: number) => new Date(created.getTime() + m * 60000);

describe('legacy order migration', () => {
  it('RECEIVED → PENDING and rewrites history (changedAt → timestamp, changedByRole added)', () => {
    const set = buildOrderMigration({
      orderStatus: 'RECEIVED', orderType: 'TAKEAWAY', createdAt: created,
      statusHistory: [{ status: 'RECEIVED', changedAt: t(0) }],
    })!;
    expect(set.orderStatus).toBe('PENDING');
    expect(set.statusHistory).toEqual([expect.objectContaining({ status: 'PENDING', timestamp: t(0), changedByRole: 'UNKNOWN' })]);
    expect(set.statusHistory[0].changedAt).toBeUndefined();
  });

  it('DELIVERED + COMPLETED collapse into one COMPLETED with deliveryStatus DELIVERED', () => {
    const set = buildOrderMigration({
      orderStatus: 'COMPLETED', orderType: 'DELIVERY', createdAt: created,
      statusHistory: [
        { status: 'RECEIVED', changedAt: t(0) }, { status: 'READY', changedAt: t(10) },
        { status: 'ASSIGNED', changedAt: t(11) }, { status: 'OUT_FOR_DELIVERY', changedAt: t(20) },
        { status: 'DELIVERED', changedAt: t(40) }, { status: 'COMPLETED', changedAt: t(41) },
      ],
    })!;
    expect(set.statusHistory.map((h: { status: string }) => h.status)).toEqual(['PENDING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED']);
    expect(set.deliveryStatus).toBe('DELIVERED');
    expect(set.deliveryHistory.map((h: { status: string }) => h.status)).toEqual(['ASSIGNED']);
  });

  it('ASSIGNED / PICKED_UP orders go back to READY with the matching deliveryStatus', () => {
    const assigned = buildOrderMigration({ orderStatus: 'ASSIGNED', orderType: 'DELIVERY', createdAt: created, statusHistory: [{ status: 'READY', changedAt: t(5) }, { status: 'ASSIGNED', changedAt: t(6) }] })!;
    expect(assigned.orderStatus).toBe('READY');
    expect(assigned.deliveryStatus).toBe('ASSIGNED');
    const picked = buildOrderMigration({ orderStatus: 'PICKED_UP', orderType: 'DELIVERY', createdAt: created, statusHistory: [{ status: 'PICKED_UP', changedAt: t(9) }] })!;
    expect(picked.orderStatus).toBe('READY');
    expect(picked.deliveryStatus).toBe('PICKED_UP');
  });

  it('adds cancellation info and dine table number', () => {
    const cancelled = buildOrderMigration({
      orderStatus: 'CANCELLED', orderType: 'TAKEAWAY', paymentStatus: 'PAID', createdAt: created,
      statusHistory: [{ status: 'RECEIVED', changedAt: t(0) }, { status: 'CONFIRMED', changedAt: t(2) }, { status: 'CANCELLED', changedAt: t(3) }],
    })!;
    expect(cancelled.cancelledAt).toEqual(t(3));
    expect(cancelled.previousOrderStatus).toBe('CONFIRMED');
    expect(cancelled.paymentStatusAtCancellation).toBe('PAID');

    const dine = buildOrderMigration({ orderStatus: 'PENDING', orderType: 'DINE_IN', tableId: 'x', createdAt: created, statusHistory: [{ status: 'PENDING', timestamp: t(0), changedByRole: 'GUEST' }] }, '12')!;
    expect(dine.tableNumber).toBe('12');
  });

  it('is idempotent: canonical documents are skipped', () => {
    expect(buildOrderMigration({ orderStatus: 'READY', orderType: 'TAKEAWAY', createdAt: created, statusHistory: [{ status: 'READY', timestamp: t(1), changedByRole: 'KITCHEN' }] })).toBeNull();
  });
});
