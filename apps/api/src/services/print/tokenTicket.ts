import { IOrder } from '../../models/Order';
import { IOutlet } from '../../models/Outlet';
import { TicketOp } from './escpos';

const ORDER_TYPE_LABEL: Record<string, string> = {
  DELIVERY: 'PARCEL / DELIVERY',
  TAKEAWAY: 'TAKE AWAY',
  DINE_IN: 'DINE IN',
  POS: 'COUNTER',
  CATERING: 'CATERING',
};

const TIME_ZONE = 'Asia/Kolkata';

function formatDateTime(date: Date): string {
  return date.toLocaleString('en-IN', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export interface TokenTicketOptions {
  footer?: string;
  /** e.g. "COPY 2/3" when several copies are requested, "REPRINT" for repeat prints. */
  tag?: string;
}

/**
 * Lays out the customer TOKEN slip: outlet, a large token number, order
 * details and the items. Prices are deliberately left off (that is the
 * receipt's job) - the token is what the customer collects their food with and
 * what the kitchen can work from.
 */
export function buildTokenTicket(order: IOrder, outlet: Pick<IOutlet, 'name' | 'address' | 'phone'>, opts: TokenTicketOptions = {}): TicketOp[] {
  const ops: TicketOp[] = [
    { t: 'text', text: outlet.name, align: 'center', bold: true, size: 2 },
    { t: 'text', text: outlet.address, align: 'center' },
    { t: 'text', text: outlet.phone, align: 'center' },
    { t: 'rule', char: '=' },
    { t: 'text', text: 'TOKEN', align: 'center', bold: true },
    { t: 'text', text: order.tokenNumber, align: 'center', bold: true, size: 3 },
  ];

  if (opts.tag) ops.push({ t: 'text', text: `** ${opts.tag} **`, align: 'center', bold: true });

  ops.push(
    { t: 'rule', char: '=' },
    { t: 'cols', left: 'Order', right: order.orderNumber },
    { t: 'cols', left: 'Type', right: ORDER_TYPE_LABEL[order.orderType] ?? order.orderType },
  );
  if (order.tableNumber) ops.push({ t: 'cols', left: 'Table', right: order.tableNumber });
  ops.push({ t: 'cols', left: 'Date', right: formatDateTime(order.createdAt) });
  if (order.scheduledAt) ops.push({ t: 'cols', left: 'Scheduled', right: formatDateTime(order.scheduledAt) });
  ops.push({ t: 'cols', left: 'Payment', right: order.paymentStatus === 'PAID' ? 'PAID' : `${order.paymentStatus}${order.paymentMethod ? ` (${order.paymentMethod.replace(/_/g, ' ')})` : ''}` });

  ops.push({ t: 'rule' }, { t: 'cols', left: 'ITEM', right: 'QTY', bold: true }, { t: 'rule' });
  for (const item of order.items) {
    ops.push({ t: 'cols', left: item.name, right: String(item.quantity), bold: true });
    if (item.selectedModifiers.length > 0) {
      ops.push({ t: 'text', text: `  + ${item.selectedModifiers.map((m) => m.optionName).join(', ')}` });
    }
    if (item.notes) ops.push({ t: 'text', text: `  Note: ${item.notes}` });
  }

  if (order.customerNotes) {
    ops.push({ t: 'rule' }, { t: 'text', text: 'Notes:', bold: true }, { t: 'text', text: order.customerNotes });
  }

  ops.push({ t: 'rule', char: '=' }, { t: 'text', text: opts.footer ?? 'Thank you!', align: 'center' });
  return ops;
}
