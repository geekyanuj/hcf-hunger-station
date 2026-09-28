import { Types } from 'mongoose';
import { LoyaltyConfig, LoyaltyTransaction, ILoyaltyConfig } from '../models/Loyalty';
import { Customer } from '../models/Customer';
import { ApiError } from '../utils/ApiError';
import { round2 } from '../utils/format';

async function resolveConfig(outletId?: string): Promise<ILoyaltyConfig> {
  if (outletId) {
    const outletConfig = await LoyaltyConfig.findOne({ outletId });
    if (outletConfig) return outletConfig;
  }
  const globalConfig = await LoyaltyConfig.findOne({ outletId: { $exists: false } });
  if (globalConfig) return globalConfig;
  // No config has been created yet anywhere - fall back to schema defaults
  // without persisting, so the feature works out of the box before an admin
  // ever visits the loyalty settings page.
  return new LoyaltyConfig();
}

export const LoyaltyService = {
  async getConfig(outletId?: string) {
    return resolveConfig(outletId);
  },

  async upsertConfig(outletId: string | undefined, payload: Record<string, unknown>) {
    return LoyaltyConfig.findOneAndUpdate(
      outletId ? { outletId } : { outletId: { $exists: false } },
      { ...payload, outletId },
      { upsert: true, new: true }
    );
  },

  async getBalance(customerId: string) {
    const customer = await Customer.findById(customerId).select('loyaltyPoints');
    return customer?.loyaltyPoints ?? 0;
  },

  async history(customerId: string, page: number, limit: number) {
    const query = { customerId };
    const [items, total] = await Promise.all([
      LoyaltyTransaction.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      LoyaltyTransaction.countDocuments(query),
    ]);
    return { items, total };
  },

  /**
   * Computes how many points a customer may redeem toward an order's total,
   * capped by minPointsToRedeem, the customer's balance, and
   * maxRedemptionPercentOfOrder — never hard-coded.
   */
  async previewRedemption(customerId: string, outletId: string, orderTotal: number, pointsRequested: number) {
    const config = await resolveConfig(outletId);
    if (!config.isActive) return { pointsToRedeem: 0, discountAmount: 0 };

    const balance = await this.getBalance(customerId);
    const maxByBalance = balance;
    const maxByOrderCap = Math.floor((orderTotal * (config.maxRedemptionPercentOfOrder / 100)) / config.redemptionValuePerPoint);
    const pointsToRedeem = Math.max(0, Math.min(pointsRequested, maxByBalance, maxByOrderCap));

    if (pointsToRedeem < config.minPointsToRedeem) return { pointsToRedeem: 0, discountAmount: 0 };

    return { pointsToRedeem, discountAmount: round2(pointsToRedeem * config.redemptionValuePerPoint) };
  },

  /** Deducts points from a customer's balance for an order, ledgered. Called at order-creation time, alongside pricing. */
  async redeemForOrder(customerId: string, points: number, orderId: Types.ObjectId) {
    if (points <= 0) return;
    const customer = await Customer.findById(customerId);
    if (!customer) throw ApiError.notFound('Customer not found');
    if (customer.loyaltyPoints < points) throw ApiError.badRequest('Insufficient loyalty points');

    const newBalance = customer.loyaltyPoints - points;
    await LoyaltyTransaction.create({
      customerId,
      type: 'REDEEM',
      points: -points,
      balanceAfter: newBalance,
      orderId,
      notes: 'Redeemed at checkout',
    });
    customer.loyaltyPoints = newBalance;
    await customer.save();
  },

  /**
   * Credits points earned on a completed order. Idempotent via the ledger's
   * unique (orderId, type) index — same pattern as InventoryLedger/Part 2's
   * stock deduction, so a retried "order completed" event can't double-credit.
   */
  async earnForOrder(customerId: string, orderId: Types.ObjectId, orderTotal: number, outletId: string): Promise<number> {
    const config = await resolveConfig(outletId);
    if (!config.isActive) return 0;

    const pointsEarned = Math.floor(orderTotal * config.pointsPerRupeeSpent);
    if (pointsEarned <= 0) return 0;

    const customer = await Customer.findById(customerId);
    if (!customer) return 0;

    const newBalance = customer.loyaltyPoints + pointsEarned;
    try {
      await LoyaltyTransaction.create({
        customerId,
        type: 'EARN',
        points: pointsEarned,
        balanceAfter: newBalance,
        orderId,
        notes: 'Earned from completed order',
      });
    } catch (err: unknown) {
      const mongoErr = err as { code?: number };
      if (mongoErr.code === 11000) return 0; // already credited for this order - idempotent no-op
      throw err;
    }

    customer.loyaltyPoints = newBalance;
    await customer.save();
    return pointsEarned;
  },

  async adjust(customerId: string, points: number, notes: string) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw ApiError.notFound('Customer not found');
    const newBalance = Math.max(0, customer.loyaltyPoints + points);
    await LoyaltyTransaction.create({ customerId, type: 'ADJUST', points, balanceAfter: newBalance, notes });
    customer.loyaltyPoints = newBalance;
    await customer.save();
    return customer;
  },
};
