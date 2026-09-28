import { PartyOrder } from '../models/PartyOrder';
import { ApiError } from '../utils/ApiError';
import { OrderService, CreateOrderInput } from './order.service';
import { NotificationService } from './notification.service';
import { User } from '../models/User';

export const PartyOrderService = {
  async submit(payload: Record<string, unknown>) {
    const partyOrder = await PartyOrder.create({ ...payload, status: 'REQUESTED' });

    // Admin notification: notify every OWNER/MANAGER assigned to this outlet.
    const staff = await User.find({
      outletIds: partyOrder.outletId,
      role: { $in: ['OWNER', 'MANAGER'] },
      isActive: true,
      isDeleted: false,
    });
    await Promise.all(
      staff.map((s) =>
        NotificationService.send({
          principalType: 'USER',
          principalId: s.id,
          outletId: partyOrder.outletId,
          type: 'PARTY_REQUEST',
          title: 'New party/catering request',
          message: `${partyOrder.contactName} requested catering for ${partyOrder.expectedGuests} guests on ${partyOrder.eventDate.toDateString()}`,
          data: { partyOrderId: partyOrder.id },
        })
      )
    );

    return partyOrder;
  },

  async list(outletId: string, status?: string) {
    const query: Record<string, unknown> = { outletId };
    if (status) query.status = status;
    return PartyOrder.find(query).sort({ eventDate: 1 });
  },

  async getById(id: string) {
    const partyOrder = await PartyOrder.findById(id);
    if (!partyOrder) throw ApiError.notFound('Party order not found');
    return partyOrder;
  },

  async markContacted(id: string, userId: string) {
    const partyOrder = await this.getById(id);
    partyOrder.status = 'CONTACTED';
    partyOrder.reviewedByUserId = userId as never;
    await partyOrder.save();
    return partyOrder;
  },

  async addQuotation(id: string, description: string, amount: number, validUntil: string | undefined, notes: string | undefined, userId: string) {
    const partyOrder = await this.getById(id);
    if (partyOrder.status === 'CONVERTED') throw ApiError.badRequest('This request has already been converted to an order');
    partyOrder.quotations.push({
      description,
      amount,
      validUntil: validUntil ? new Date(validUntil) : undefined,
      notes,
      preparedByUserId: userId as never,
      preparedAt: new Date(),
    });
    partyOrder.status = 'QUOTED';
    await partyOrder.save();
    return partyOrder;
  },

  async approve(id: string, userId: string) {
    const partyOrder = await this.getById(id);
    if (partyOrder.status !== 'QUOTED') throw ApiError.badRequest('A quotation must exist before approving');
    partyOrder.status = 'APPROVED';
    partyOrder.reviewedByUserId = userId as never;
    await partyOrder.save();
    return partyOrder;
  },

  async reject(id: string, reason: string, userId: string) {
    const partyOrder = await this.getById(id);
    partyOrder.status = 'REJECTED';
    partyOrder.rejectionReason = reason;
    partyOrder.reviewedByUserId = userId as never;
    await partyOrder.save();
    return partyOrder;
  },

  /**
   * Converts an approved quotation into a real Order. Catering quotations
   * are bespoke (custom menu, bulk pricing) rather than a priced shopping
   * cart, so the staff member supplies the actual order lines to charge
   * (typically bulk/combo items already in the menu, quantities chosen to
   * match the quoted amount) — OrderService.create still recomputes and
   * enforces real pricing/stock rules on whatever lines are given, so a
   * quotation can never bypass server-side price integrity.
   */
  async convertToOrder(id: string, orderInput: Omit<CreateOrderInput, 'outletId' | 'orderType'>, userId: string) {
    const partyOrder = await this.getById(id);
    if (partyOrder.status !== 'APPROVED') throw ApiError.badRequest('Only an approved quotation can be converted to an order');

    const order = await OrderService.create({
      ...orderInput,
      outletId: partyOrder.outletId.toString(),
      orderType: 'CATERING',
      customerId: partyOrder.customerId?.toString(),
      createdByUserId: userId,
      customerNotes: `Catering for ${partyOrder.contactName} — ${partyOrder.eventType}, ${partyOrder.expectedGuests} guests`,
    });

    partyOrder.status = 'CONVERTED';
    partyOrder.convertedOrderId = order._id as never;
    await partyOrder.save();

    return { partyOrder, order };
  },
};
