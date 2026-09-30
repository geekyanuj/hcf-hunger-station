import { Types } from 'mongoose';
import { getNextSequence } from '../models/Counter';
import { Token, seriesForOrderType, TOKEN_PREFIX } from '../models/Token';
import { Outlet } from '../models/Outlet';
import { OrderType } from '../models/Order';
import { businessDateToday } from '../utils/format';

export const TokenService = {
  /** Generates a globally-unique, human-friendly order number, e.g. "HCF284". */
  async nextOrderNumber(outletId: Types.ObjectId | string): Promise<string> {
    const outlet = await Outlet.findById(outletId).select('code');
    const seq = await getNextSequence(`ORDER:${outletId}`);
    const prefix = outlet?.code ? outlet.code.slice(0, 3) : 'HCF';
    return `${prefix}${seq}`;
  },

  /**
   * Generates a queue token such as T-104 / D-057 / O-286.
   * Sequences reset per outlet, per series, per business day (configurable via
   * outlet.settings.tokenResetPolicy) so they stay short and readable.
   */
  async nextToken(outletId: Types.ObjectId | string, orderType: OrderType, orderId: Types.ObjectId) {
    const outlet = await Outlet.findById(outletId).select('settings');
    const series = seriesForOrderType(orderType);
    const prefix = TOKEN_PREFIX[series];
    const businessDate = outlet?.settings.tokenResetPolicy === 'NEVER' ? 'ALL_TIME' : businessDateToday();
    const counterKey = `TOKEN:${series}:${outletId}:${businessDate}`;
    const sequence = await getNextSequence(counterKey);
    const displayValue = `${prefix}-${String(sequence).padStart(3, '0')}`;

    await Token.create({
      outletId,
      orderId,
      series,
      prefix,
      sequence,
      displayValue,
      businessDate,
    });

    return displayValue;
  },
};
