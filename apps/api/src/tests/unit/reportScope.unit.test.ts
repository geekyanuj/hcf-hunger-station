import { Request } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExportController } from '../../controllers/export.controller';
import { ApiError } from '../../utils/ApiError';
import { parseDateRange, resolveOutletScope } from '../../controllers/reportScope.util';
import { AnalyticsService } from '../../services/analytics.service';
import { Purchase } from '../../models/Purchase';
import { Order } from '../../models/Order';

const request = (query: Record<string, unknown>, auth?: unknown) =>
  ({ query, auth } as unknown as Request);

describe('analytics report filters', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses inclusive Asia/Kolkata calendar days for custom ranges', () => {
    const range = parseDateRange(request({ from: '2026-01-05', to: '2026-01-07' }));

    expect(range.from.toISOString()).toBe('2026-01-04T18:30:00.000Z');
    expect(range.to.toISOString()).toBe('2026-01-07T18:29:59.999Z');
  });

  it.each([
    { from: '2026-02-30', to: '2026-03-01' },
    { from: '2026-03-02', to: '2026-03-01' },
    { from: 'not-a-date', to: '2026-03-01' },
    { from: '2026-03-01' },
    { range: 'last90days' },
  ])('rejects invalid date filter %#', (query) => {
    expect(() => parseDateRange(request(query))).toThrow(ApiError);
  });

  it('builds full-day bounds for supported presets', () => {
    const today = parseDateRange(request({ range: 'today' }));
    const yesterday = parseDateRange(request({ range: 'yesterday' }));
    const lastSevenDays = parseDateRange(request({ range: 'last7days' }));
    const lastThirtyDays = parseDateRange(request({ range: 'last30days' }));
    const thisWeek = parseDateRange(request({ range: 'thisWeek' }));
    const thisMonth = parseDateRange(request({ range: 'thisMonth' }));
    const businessDateAt = (instant: Date) => new Date(instant.getTime() + 5.5 * 60 * 60 * 1000);

    expect(today.to.getTime() - today.from.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
    expect(today.from.getTime() - yesterday.from.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(yesterday.to.getTime()).toBe(today.from.getTime() - 1);
    expect(today.from.getTime() - lastSevenDays.from.getTime()).toBe(6 * 24 * 60 * 60 * 1000);
    expect(today.from.getTime() - lastThirtyDays.from.getTime()).toBe(29 * 24 * 60 * 60 * 1000);
    expect(businessDateAt(thisWeek.from).getUTCDay()).toBe(1);
    expect(businessDateAt(thisMonth.from).getUTCDate()).toBe(1);
    expect(thisWeek.to).toEqual(today.to);
    expect(thisMonth.to).toEqual(today.to);
  });

  it('restricts outlet filters to the staff member scope and allows owner all-outlet reports', () => {
    const outletId = '65f000000000000000000001';
    const otherOutletId = '65f000000000000000000002';
    const manager = { type: 'STAFF', role: 'MANAGER', outletIds: [outletId] };
    const owner = { type: 'STAFF', role: 'OWNER', outletIds: [] };

    expect(resolveOutletScope(request({ outletId }, manager))).toEqual([outletId]);
    expect(resolveOutletScope(request({ outletId: 'ALL' }, owner))).toBe('ALL');
    expect(() => resolveOutletScope(request({ outletId: otherOutletId }, manager))).toThrow(
      expect.objectContaining({ statusCode: 403 })
    );
    expect(() => resolveOutletScope(request({ outletId: 'invalid' }, owner))).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it('filters completed purchase trends by purchase date and outlet', async () => {
    const aggregate = vi.spyOn(Purchase, 'aggregate').mockResolvedValue([] as never);
    const range = { from: new Date('2026-01-01T00:00:00.000Z'), to: new Date('2026-01-02T00:00:00.000Z') };
    const outletId = '65f000000000000000000001';

    await AnalyticsService.purchaseTrend([outletId], range);

    expect(aggregate.mock.calls[0][0][0]).toMatchObject({
      $match: {
        status: 'COMPLETED',
        purchaseDate: { $gte: range.from, $lte: range.to },
        outletId: { $in: [expect.anything()] },
      },
    });
    expect(aggregate.mock.calls[0][0][1]).toMatchObject({
      $group: { _id: { $dateToString: { date: '$purchaseDate', timezone: 'Asia/Kolkata' } } },
    });
  });

  it('downloads a readable CSV report using the same outlet and date filters', async () => {
    const itemSalesReport = vi.spyOn(AnalyticsService, 'itemSalesReport').mockResolvedValue([
      { date: '2026-01-05', item: 'Classic Chicken Burger', quantity: 2, unitPrice: 150, totalRevenue: 300, reference: 'HCF101' },
      { date: '2026-01-05', item: 'Classic Chicken Burger', quantity: 1, unitPrice: 150, totalRevenue: 150, reference: 'HCF102' },
    ] as never);

    const auth = { type: 'STAFF', role: 'OWNER', outletIds: [] };
    const outputPromise = new Promise<string>((resolve, reject) => {
      const response = {
        setHeader: vi.fn(),
        status: vi.fn(),
        send: vi.fn(),
      };
      response.status.mockReturnValue(response);
      response.send.mockImplementation((body: string) => {
        resolve(body);
        return response;
      });
      ExportController.analyticsReport(
        request({ outletId: 'ALL', from: '2026-01-05', to: '2026-01-05' }, auth),
        response as never,
        reject
      );
    });

    const csv = await outputPromise;

    expect(csv).toContain('Date,Item,Quantity,Unit Price,Total Revenue,Reference (Order No.)');
    expect(csv).toContain('2026-01-05,Classic Chicken Burger,2,150,300,HCF101');
    expect(csv).toContain('2026-01-05,Classic Chicken Burger,1,150,150,HCF102');
    expect(csv).toContain(',TOTAL,3,,450,');
    expect(csv).not.toContain('Summary');
    expect(csv).not.toContain('undefined');
    expect(itemSalesReport).toHaveBeenCalledWith('ALL', {
      from: new Date('2026-01-04T18:30:00.000Z'),
      to: new Date('2026-01-05T18:29:59.999Z'),
    });
  });

  it('builds item sales rows with a daily date and per-order reference', async () => {
    const aggregate = vi.spyOn(Order, 'aggregate').mockResolvedValue([] as never);
    const range = { from: new Date('2026-01-04T18:30:00.000Z'), to: new Date('2026-01-05T18:29:59.999Z') };

    await AnalyticsService.itemSalesReport('ALL', range);

    expect(aggregate.mock.calls[0][0][0]).toMatchObject({
      $match: { isDeleted: false, createdAt: { $gte: range.from, $lte: range.to } },
    });
    expect(aggregate.mock.calls[0][0][1]).toEqual({ $unwind: '$items' });
    expect(aggregate.mock.calls[0][0][2]).toMatchObject({
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } },
          orderId: '$_id',
          menuItemId: '$items.menuItemId',
          unitPrice: '$items.unitPrice',
        },
        item: { $first: '$items.name' },
        quantity: { $sum: '$items.quantity' },
        totalRevenue: { $sum: '$items.lineTotal' },
        reference: { $first: '$orderNumber' },
      },
    });
  });
});
