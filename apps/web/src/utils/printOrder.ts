import { Order } from '@/types/domain';
import { StaffOrderApi } from '@/services/staffApi';
import { ORDER_TYPE_LABEL } from './orderStatus';

type Receipt = {
  outletName: string;
  outletAddress: string;
  outletPhone: string;
  orderNumber: string;
  tokenNumber: string;
  orderType: Order['orderType'];
  tableNumber?: string;
  paymentStatus: string;
  paymentMethod?: string;
  createdAt: string;
  items: { name: string; quantity: number; unitPrice: number; lineTotal: number; modifiers: string[] }[];
  subtotal: number;
  discount: number;
  tax: number;
  packagingCharge: number;
  deliveryCharge: number;
  total: number;
  payments: { method: string; amount: number; status: string }[];
  amountPaid: number;
  balanceDue: number;
};

const esc = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] as string);

const STYLE = `
  @page { size: 58mm auto; margin: 0 }
  * { box-sizing: border-box }
  html, body { width: 58mm; margin: 0; padding: 0; background: #fff; color: #000 }
  body { padding: 3mm 2.5mm; font: 10pt/1.25 ui-monospace, "Courier New", monospace }
  h1 { margin: 0 0 2mm; font-size: 12pt; text-align: center; text-transform: uppercase }
  h2 { margin: 2mm 0; font-size: 11pt; text-align: center }
  p { margin: 1mm 0 }
  .center { text-align: center }
  .muted { font-size: 8pt }
  .token { margin: 2mm 0; font-size: 19pt; font-weight: 900; text-align: center }
  .rule { margin: 2mm 0; border-top: 1px dashed #000 }
  .line { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2mm; padding: 1mm 0 }
  .item-name { overflow-wrap: anywhere; font-weight: 700 }
  .item-options, .note { padding-left: 2mm; font-size: 8pt; overflow-wrap: anywhere }
  .columns { display: grid; grid-template-columns: minmax(0, 1fr) 6mm 13mm 15mm; gap: 1mm; font-size: 8pt; text-align: right }
  .columns > :first-child { text-align: left }
  .total { font-size: 12pt; font-weight: 900 }
  .no-print { display: none }
`;

function openPrintWindow(title: string): Window {
  const printWindow = window.open('', '_blank', 'width=420,height=720');
  if (!printWindow) throw new Error('Please allow pop-ups to open the browser print preview.');
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head><body></body></html>`);
  printWindow.document.close();
  return printWindow;
}

function printDocument(printWindow: Window, title: string, body: string) {
  printWindow.document.title = title;
  printWindow.document.body.innerHTML = body;
  printWindow.focus();

  let hasPrinted = false;
  const print = () => {
    if (hasPrinted || printWindow.closed) return;
    hasPrinted = true;
    printWindow.print();
  };
  printWindow.onload = print;
  window.setTimeout(print, 400);
}

function orderHeading(order: Pick<Order, 'tokenNumber' | 'orderNumber' | 'orderType' | 'tableNumber' | 'createdAt'>) {
  return `<div class="token">${esc(order.tokenNumber)}</div>
    <p class="center">Order ${esc(order.orderNumber)} · ${esc(ORDER_TYPE_LABEL[order.orderType])}${order.tableNumber ? ` · Table ${esc(order.tableNumber)}` : ''}</p>
    <p class="center muted">${esc(new Date(order.createdAt).toLocaleString('en-IN'))}</p>`;
}

/** Kitchen token with item quantities, prices, modifiers, and optional kitchen comments. */
export function printKitchenToken(order: Order) {
  const printWindow = openPrintWindow(`Kitchen token ${order.tokenNumber}`);
  const items = order.items
    .map((item) => {
      const rate = item.quantity > 0 ? item.lineTotal / item.quantity : item.unitPrice;
      return `<section class="item">
        <p class="item-name">${esc(item.name)}</p>
        ${item.selectedModifiers.length ? `<p class="item-options">${esc(item.selectedModifiers.map((modifier) => modifier.optionName).join(', '))}</p>` : ''}
        ${item.notes ? `<p class="note">Note: ${esc(item.notes)}</p>` : ''}
        <div class="columns"><span></span><span>${esc(item.quantity)}</span><span>${esc(rate.toFixed(2))}</span><span>${esc(item.lineTotal.toFixed(2))}</span></div>
      </section>`;
    })
    .join('');

  printDocument(
    printWindow,
    `Kitchen token ${order.tokenNumber}`,
    `<h1>Kitchen Token</h1>${orderHeading(order)}
      <div class="rule"></div>
      <div class="columns"><b>Product</b><b>Qty</b><b>Rate</b><b>Amount</b></div>
      <div class="rule"></div>${items}
      ${order.customerNotes ? `<div class="rule"></div><p><b>Comment</b></p><p class="note">${esc(order.customerNotes)}</p>` : ''}
      <div class="rule"></div><div class="line total"><span>Total</span><span>${esc(order.total.toFixed(2))}</span></div>`
  );
}

function receiptBody(receipt: Receipt) {
  const itemRows = receipt.items
    .map((item) => {
      const rate = item.quantity > 0 ? item.lineTotal / item.quantity : item.unitPrice;
      return `<section>
        <p class="item-name">${esc(item.name)}</p>
        ${item.modifiers.length ? `<p class="item-options">${esc(item.modifiers.join(', '))}</p>` : ''}
        <div class="columns"><span></span><span>${esc(item.quantity)}</span><span>${esc(rate.toFixed(2))}</span><span>${esc(item.lineTotal.toFixed(2))}</span></div>
      </section>`;
    })
    .join('');
  const row = (label: string, value: number) =>
    value ? `<div class="line"><span>${esc(label)}</span><span>${esc(value.toFixed(2))}</span></div>` : '';
  const totalQuantity = receipt.items.reduce((quantity, item) => quantity + item.quantity, 0);
  const paymentLabel = receipt.paymentMethod ? String(receipt.paymentMethod).replace(/_/g, ' ') : receipt.paymentStatus;
  const successfulPayments = receipt.payments.filter((payment) => payment.status === 'SUCCESS');
  const paymentRows = successfulPayments.length
    ? successfulPayments.map((payment) => `<div class="line"><span>Pay Mode: ${esc(payment.method)}</span><span>${esc(payment.amount.toFixed(2))}</span></div>`).join('')
    : `<p>Pay Mode: ${esc(paymentLabel)} · ${esc(receipt.amountPaid.toFixed(2))}</p>`;

  return `<h1>${esc(receipt.outletName)}</h1>
    <p class="center">${esc(receipt.outletAddress)}<br>${esc(receipt.outletPhone)}</p>
    <h2>Tax Invoice</h2>
    <div class="rule"></div>
    <p>${esc(new Date(receipt.createdAt).toLocaleString('en-IN'))}</p>
    <p>Order: <b>${esc(receipt.orderNumber)}</b> · Token: ${esc(receipt.tokenNumber)}</p>
    <p>${esc(ORDER_TYPE_LABEL[receipt.orderType])}${receipt.tableNumber ? ` · Table ${esc(receipt.tableNumber)}` : ''}</p>
    <div class="rule"></div>
    <div class="columns"><b>Product</b><b>Qty</b><b>Rate</b><b>Amount</b></div>
    <div class="rule"></div>
    ${itemRows}
    <div class="rule"></div>
    ${row('Sub Total', receipt.subtotal)}
    ${row('Discount', -receipt.discount)}
    ${row('Tax', receipt.tax)}
    ${row('Packaging', receipt.packagingCharge)}
    ${row('Delivery', receipt.deliveryCharge)}
    <div class="line"><b>Total Qty: ${esc(totalQuantity)}</b><b>Amt: ${esc(receipt.total.toFixed(2))}</b></div>
    <div class="rule"></div>
    ${paymentRows}
    ${receipt.balanceDue > 0 ? `<p>Balance Due: ${esc(receipt.balanceDue.toFixed(2))}</p>` : ''}
    <div class="line"><span>Item Value</span><span>${esc(receipt.subtotal.toFixed(2))}</span></div>
    ${receipt.tax === 0 ? '<div class="line"><span>GST Exempt</span><span>0.00</span></div>' : ''}
    <div class="rule"></div>
    <p class="center">THANKS FOR VISIT<br>HAVE A NICE DAY :-)</p>`;
}

/** Uses server-computed receipt totals and opens the browser's 58 mm print preview. */
export async function printCustomerBill(order: Order) {
  const printWindow = openPrintWindow(`Bill ${order.orderNumber}`);
  try {
    const receipt: Receipt = await StaffOrderApi.receipt(order._id);
    printDocument(printWindow, `Bill ${receipt.orderNumber}`, receiptBody(receipt));
  } catch (error) {
    printWindow.close();
    throw error;
  }
}
