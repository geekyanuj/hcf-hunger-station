/**
 * Token printing (thermal printer).
 *
 * The API decides HOW a token is printed:
 *   - printer connected (PRINTER_DRIVER=NETWORK/FILE) -> the API sends ESC/POS bytes straight to the thermal printer.
 *   - no printer connected yet                        -> the API returns the rendered slip and this file prints it
 *                                                        through the browser's print dialog (sized for 58/80 mm paper).
 * If the printer is connected but unreachable, the API answers with an error and we fall back to the browser so
 * the customer still gets a token.
 */
import axios from 'axios';
import { PrintApi, PrintResult } from '@/services/staffApi';
import { extractErrorMessage } from '@/services/apiClient';

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** Prints plain monospaced text through the browser, sized for thermal paper. */
export function printPlainText(title: string, text: string, paperWidthMm: number = 80) {
  const widthMm = paperWidthMm === 58 ? 58 : 80;
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) {
    window.alert('Please allow pop-ups to print.');
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: ${widthMm}mm auto; margin: 0 }
    html, body { margin: 0; padding: 0; background: #fff }
    pre { font: 12px/1.25 ui-monospace, Menlo, Consolas, monospace; color: #000; margin: 0; padding: 3mm 2mm; width: ${widthMm - 4}mm; white-space: pre-wrap; word-break: break-all }
  </style></head><body><pre>${esc(text)}</pre></body></html>`);
  w.document.close();
  w.focus();
  let printed = false;
  const go = () => {
    if (printed) return;
    printed = true;
    try {
      w.print();
    } finally {
      w.close();
    }
  };
  w.onload = go;
  setTimeout(go, 400); // some browsers never fire onload for document.write documents
}

export interface TokenPrintOutcome {
  /** How the slip left the system. */
  via: 'PRINTER' | 'BROWSER' | 'BROWSER_FALLBACK';
  message: string;
  result?: PrintResult;
}

/**
 * Prints the token for an order. Never throws for "printer problems" - it falls back to the browser and says so in
 * `message`. It only throws if even the fallback cannot be prepared (e.g. no permission / order not found).
 */
export async function printTokenForOrder(orderId: string, tokenNumber: string, opts: { copies?: number } = {}): Promise<TokenPrintOutcome> {
  try {
    const result = await PrintApi.printToken(orderId, opts.copies);
    if (result.printed) {
      return { via: 'PRINTER', message: `Token ${tokenNumber} sent to the printer${result.isReprint ? ' (reprint)' : ''}`, result };
    }
    printPlainText(`Token ${tokenNumber}`, result.text, result.paperWidthMm);
    return { via: 'BROWSER', message: `Token ${tokenNumber} ready to print`, result };
  } catch (err) {
    // 502 = printer is configured but the API could not reach it -> still give the customer a token via the browser.
    if (axios.isAxiosError(err) && err.response?.status === 502) {
      const reason = extractErrorMessage(err);
      const preview = await PrintApi.previewToken(orderId);
      printPlainText(`Token ${tokenNumber}`, preview.text, preview.paperWidthMm);
      return { via: 'BROWSER_FALLBACK', message: `Printer unavailable (${reason}) - opened browser print instead` };
    }
    throw err;
  }
}
