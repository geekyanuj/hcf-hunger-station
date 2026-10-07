# Browser printing (58 mm thermal paper)

Order printing currently uses the browser's print preview only. The API does
not send ESC/POS bytes to network, USB, file, or console printers; the previous
direct-print transport is paused while the browser layout is being checked.

## Order workflow

1. Create an order in POS and add an optional **Kitchen comment**.
2. Use **Print kitchen token** in POS or **Print Kitchen Token** on an order.
   The token includes its number, order details, item names, modifiers,
   quantities, rates, amounts, and any optional comment.
3. Kitchen staff update the order status to **Ready**.
4. Use **Print Bill** from the order to open the customer tax invoice. Bills
   are available only once an order is Ready, out for delivery, or completed.

Both print layouts use `@page` sizing for a 58 mm roll. In the browser print
dialog, choose the thermal printer, select a 58 mm paper size, and use narrow
or no margins if the driver offers that option. The browser may show its native
preview or the operating system's print dialog, depending on browser settings.

## Admin -> Browser Printing

The page's test slip opens the same browser preview and 58 mm width. Recent
preview requests are logged for staff with audit access. The API's
`GET /api/v1/print/status` endpoint reports browser mode and the fixed 58 mm
paper width.

Legacy `PRINTER_*` connection settings do not enable direct printer output.
Direct ESC/POS output should remain disabled until it is intentionally
reintroduced and tested with the actual printer.
