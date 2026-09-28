/**
 * Browser-print helpers for the "Print Customer" and "Print Kitchen" actions.
 * They render a compact receipt/ticket into a small print window, so no
 * printer driver or extra dependency is needed (same approach as the POS
 * receipt architecture: structured data in, any renderer out).
 */
import { Order } from '@/types/domain';
import { StaffOrderApi } from '@/services/staffApi';
import { ORDER_TYPE_LABEL, DASHBOARD_STATUS_LABEL } from './orderStatus';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const STYLE = `
  body{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;width:280px;margin:0 auto;padding:8px;color:#000}
  h1{font-size:16px;text-align:center;margin:0 0 4px} h2{font-size:14px;margin:6px 0 2px}
  .c{text-align:center} .r{text-align:right} hr{border:0;border-top:1px dashed #000;margin:6px 0}
  table{width:100%;border-collapse:collapse} td{padding:1px 0;vertical-align:top}
  .big{font-size:22px;font-weight:700;text-align:center}
`;

function openPrintWindow(title: string, body: string) {
  const w = window.open('', '_blank', 'width=380,height=640');
  if (!w) {
    window.alert('Please allow pop-ups to print.');
    return;
  }
  w.document.write(`<!doctype html><html><head><title>${esc(title)}</title><style>${STYLE}</style></head><body>${body}</body></html>`);
  w.document.close();
  w.focus();
  w.onload = () => {
    w.print();
    w.close();
  };
  // Some browsers don't fire onload for document.write documents.
  setTimeout(() => {
    try {
      w.print();
    } catch {
      /* window already closed */
    }
  }, 400);
}

const header = (order: Order) =>
  `<div class="big">${esc(order.tokenNumber)}</div>
   <div class="c">Order ${esc(order.orderNumber)} · ${esc(ORDER_TYPE_LABEL[order.orderType])}${order.tableNumber ? ` · Table ${esc(order.tableNumber)}` : ''}</div>
   <div class="c">${esc(new Date(order.createdAt).toLocaleString())}</div><hr>`;

/** Kitchen ticket: items + modifiers + notes only, no prices. */
export function printKitchenTicket(order: Order) {
  const items = order.items
    .map(
      (i) =>
        `<tr><td><b>${esc(i.quantity)} ×</b> ${esc(i.name)}${
          i.selectedModifiers.length ? `<br><small>&nbsp;&nbsp;${esc(i.selectedModifiers.map((m) => m.optionName).join(', '))}</small>` : ''
        }</td></tr>`
    )
    .join('');
  openPrintWindow(
    `Kitchen ${order.tokenNumber}`,
    `<h1>KITCHEN</h1>${header(order)}<table>${items}</table>${order.customerNotes ? `<hr><b>Notes:</b> ${esc(order.customerNotes)}` : ''}`
  );
}

/** Customer receipt: fetches the server-computed receipt so totals are never re-derived on the client. */
export async function printCustomerReceipt(order: Order) {
  const r = await StaffOrderApi.receipt(order._id);
  const lines = (r.items as { name: string; quantity: number; lineTotal: number; modifiers: string[] }[])
    .map(
      (i) =>
        `<tr><td>${esc(i.quantity)} × ${esc(i.name)}${i.modifiers.length ? `<br><small>&nbsp;&nbsp;${esc(i.modifiers.join(', '))}</small>` : ''}</td><td class="r">${esc(i.lineTotal.toFixed(2))}</td></tr>`
    )
    .join('');
  const row = (label: string, value: number) => (value ? `<tr><td>${label}</td><td class="r">${esc(value.toFixed(2))}</td></tr>` : '');
  openPrintWindow(
    `Receipt ${r.orderNumber}`,
    `<h1>${esc(r.outletName)}</h1><div class="c">${esc(r.outletAddress)}<br>${esc(r.outletPhone)}</div><hr>
     ${header(order)}
     <table>${lines}</table><hr>
     <table>${row('Subtotal', r.subtotal)}${row('Discount', -r.discount)}${row('Tax', r.tax)}${row('Packaging', r.packagingCharge)}${row('Delivery', r.deliveryCharge)}
     <tr><td><b>TOTAL</b></td><td class="r"><b>${esc(r.total.toFixed(2))}</b></td></tr></table><hr>
     <div>Status: ${esc(DASHBOARD_STATUS_LABEL[order.orderStatus])}<br>Payment: ${esc(r.paymentStatus)}${r.paymentMethod ? ` (${esc(String(r.paymentMethod).replace(/_/g, ' '))})` : ''}<br>Paid: ${esc(r.amountPaid.toFixed(2))} · Due: ${esc(r.balanceDue.toFixed(2))}</div>
     <hr><div class="c">Thank you!</div>`
  );
}
