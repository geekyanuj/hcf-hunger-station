# Token printing (thermal printer)

Order **tokens** can be printed by **Owner, Manager and Cashier** (permission `tokens.print`):

* **Current Orders** - every order has a *Print Token* button.
* **POS** - a *Print token* button for the last order, plus an *Auto-print token* switch
  (remembered per browser) that prints as soon as an order is charged.
* **Admin -> Printer** - connection status, *Print test slip*, and the recent print log.

A token slip shows: outlet name and address, a large **token number**, order number, type
(Dine in / Take away / Parcel), table, date/time, payment status, items with options and notes.
**No prices** (that is the receipt's job). Repeat prints are marked `REPRINT`.

Kitchen, Inventory and Delivery roles do not see the button, and the API refuses them (`403`).

## How printing works

The **API** does the printing, so it does not matter which computer or phone the cashier uses.

| `PRINTER_DRIVER` | What happens |
|---|---|
| `DISABLED` (default) | No printer connected. The slip opens in the browser print dialog, sized for 58/80 mm paper. Works today with any printer installed on that computer. |
| `NETWORK` | The API sends ESC/POS bytes over TCP to an Ethernet / Wi-Fi thermal printer (`PRINTER_HOST`, `PRINTER_PORT`, usually `9100`). |
| `FILE` | The API writes ESC/POS bytes to a device or queue path (`PRINTER_DEVICE_PATH`, e.g. `/dev/usb/lp0` for USB on Linux). |
| `CONSOLE` | Development only. Prints the slip text in the API log. |

If a printer is connected but unreachable (off, unplugged, wrong IP) the API answers with a
clear error and the app **falls back to browser print** so the customer still gets a token. Every
attempt (printed / browser / failed, by whom, when) is stored and shown under *Admin -> Printer*.

## Connecting the printer

1. Put the printer's details in the root `.env` (see `.env.example`), for example:

   ```env
   PRINTER_DRIVER=NETWORK
   PRINTER_HOST=192.168.1.50
   PRINTER_PORT=9100
   PRINTER_PAPER_WIDTH=80      # 80 or 58
   PRINTER_CUT=true            # cut after each token
   PRINTER_COPIES=1
   ```

2. Restart the API (`docker compose up -d api`, or restart `npm run dev`).
3. Open **Admin -> Printer**. It should say *Printer connected*. Press **Print test slip**.
4. Print a real token from *Current Orders*.

| Printer type | Use |
|---|---|
| Ethernet or Wi-Fi thermal printer | `NETWORK` with its IP address. Give the printer a fixed IP (DHCP reservation) so the address never changes. |
| USB thermal printer on the same Linux machine as the API | `FILE` with the device path. With Docker, map it in: add `devices: ['/dev/usb/lp0:/dev/usb/lp0']` to the `api` service. |
| USB printer on a Windows PC (API elsewhere) | Leave `DISABLED` (browser print). Choose the printer in the browser dialog, set paper to *80 mm*, margins *None*; tick *Remember*/use kiosk printing for one-click prints. |

Any ESC/POS-compatible printer works (Epson TM series, TVS, Rongta, Xprinter, Everycom, ...).

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `PRINTER_DRIVER` | `DISABLED` | `DISABLED`, `NETWORK`, `FILE`, `CONSOLE` |
| `PRINTER_HOST` / `PRINTER_PORT` | - / `9100` | Network printer address |
| `PRINTER_DEVICE_PATH` | - | Device / queue path for `FILE` |
| `PRINTER_PAPER_WIDTH` | `80` | `80` mm = 48 characters per line, `58` mm = 32 |
| `PRINTER_TIMEOUT_MS` | `5000` | How long to wait for the printer |
| `PRINTER_CUT` | `true` | Partial cut after each token |
| `PRINTER_OPEN_DRAWER` | `false` | Kick the cash drawer with each token |
| `PRINTER_COPIES` | `1` | Copies per print (1-5); the POS/order button can override |
| `PRINTER_FOOTER` | `Thank you! Visit again` | Last line of the token |

## Troubleshooting

* **"refused the connection"** - printer off, wrong IP, or wrong port. Ping the IP from the API machine.
* **"cannot be reached"** - API and printer are on different networks / Wi-Fi isolation is on.
* **Garbage or `?` characters** - the slip is ASCII only (`₹` prints as `Rs`); Hindi/Devanagari needs a printer-specific code page.
* **Not cutting** - printer has no cutter: set `PRINTER_CUT=false`.
* **Slip too wide/narrow** - set `PRINTER_PAPER_WIDTH` to `58` or `80` to match the roll.

## API (for developers)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/v1/print/status` | Driver, mode (`PRINTER` / `BROWSER`), paper, hints |
| `POST` | `/api/v1/print/orders/:orderId/token` | Body `{ "copies": 1-5 }` optional. Returns `printed`, `mode`, `text` |
| `GET` | `/api/v1/print/orders/:orderId/token/preview` | Rendered slip text, nothing printed or logged |
| `POST` | `/api/v1/print/test` | Body `{ "outletId" }` - test slip |
| `GET` | `/api/v1/print/jobs?outletId=` | Recent prints (Owner / Manager) |

To support another connection type (Windows print queue, serial) add a transport in
`apps/api/src/services/print/transport.ts`; nothing else changes.
