import { Types } from 'mongoose';
import { env } from '../config/env';
import { Outlet } from '../models/Outlet';
import { PrintJob, PrintJobType } from '../models/PrintJob';
import { StaffAccessTokenPayload } from '../types/auth';
import { ApiError } from '../utils/ApiError';
import { OrderService } from './order.service';
import { charsPerLine, renderText, TicketOp } from './print/escpos';
import { buildTokenTicket } from './print/tokenTicket';

export interface PrintResult {
  /** Always false while output is browser-only. */
  printed: boolean;
  /** Always BROWSER while direct ESC/POS output is paused. */
  mode: 'PRINTER' | 'BROWSER';
  driver: string;
  copies: number;
  isReprint: boolean;
  jobId: string;
  /** Plain-text rendering used by the browser print preview. */
  text: string;
  paperWidthMm: number;
  warning?: string;
}

function assertOutletAccess(auth: StaffAccessTokenPayload, outletId: string) {
  if (auth.role === 'OWNER') return;
  if (!auth.outletIds.includes(outletId)) throw ApiError.forbidden('You do not have access to this outlet');
}

function clampCopies(requested?: number): number {
  const n = requested ?? env.printer.copies;
  return Math.min(Math.max(Math.floor(n) || 1, 1), 5);
}

export const PrintService = {
  /** Browser print mode and fixed paper width for the admin/staff UI. */
  status() {
    return {
      driver: 'DISABLED' as const,
      configured: false,
      mode: 'BROWSER' as const,
      target: 'Browser print preview',
      paperWidthMm: 58 as const,
      charactersPerLine: charsPerLine(58),
      autoCut: false,
      openDrawer: false,
      defaultCopies: env.printer.copies,
      hint: 'Direct ESC/POS output is paused. Use browser print preview with 58 mm paper.',
    };
  },

  /** Builds browser-print text and records the preview request; never sends ESC/POS bytes to hardware. */
  async dispatch(params: {
    auth: StaffAccessTokenPayload;
    outletId: Types.ObjectId | string;
    type: PrintJobType;
    orderId?: Types.ObjectId | string;
    tokenNumber?: string;
    copies: number;
    isReprint: boolean;
    ticketFor: (copyTag?: string) => TicketOp[];
  }): Promise<PrintResult> {
    const width = charsPerLine(58);
    const textOf = (tag?: string) => renderText(params.ticketFor(tag), { width });

    const record = () =>
      PrintJob.create({
        outletId: params.outletId,
        orderId: params.orderId,
        tokenNumber: params.tokenNumber,
        requestedBy: params.auth.sub,
        type: params.type,
        status: 'BROWSER',
        driver: 'BROWSER',
        copies: params.copies,
        isReprint: params.isReprint,
      });

    const base = {
      driver: 'BROWSER',
      copies: params.copies,
      isReprint: params.isReprint,
      paperWidthMm: 58,
      text: textOf(params.isReprint ? 'REPRINT' : undefined),
    };

    const job = await record();
    return { ...base, printed: false, mode: 'BROWSER', jobId: job.id };
  },

  async printToken(orderId: string, auth: StaffAccessTokenPayload, opts: { copies?: number } = {}): Promise<PrintResult> {
    const order = await OrderService.getById(orderId);
    assertOutletAccess(auth, order.outletId.toString());
    const outlet = await Outlet.findById(order.outletId);
    if (!outlet) throw ApiError.notFound('Outlet not found for this order');

    // Any earlier successful print (hardware or browser) makes this one a reprint - visible on the slip.
    const isReprint = !!(await PrintJob.exists({ orderId: order._id, type: 'TOKEN', status: { $in: ['PRINTED', 'BROWSER'] } }));

    return PrintService.dispatch({
      auth,
      outletId: order.outletId,
      type: 'TOKEN',
      orderId: order._id as Types.ObjectId,
      tokenNumber: order.tokenNumber,
      copies: clampCopies(opts.copies),
      isReprint,
      ticketFor: (tag) => buildTokenTicket(order, outlet, { footer: env.printer.footer, tag }),
    });
  },

  /** Renders the token without printing or logging anything. */
  async previewToken(orderId: string, auth: StaffAccessTokenPayload) {
    const order = await OrderService.getById(orderId);
    assertOutletAccess(auth, order.outletId.toString());
    const outlet = await Outlet.findById(order.outletId);
    if (!outlet) throw ApiError.notFound('Outlet not found for this order');
    const ops = buildTokenTicket(order, outlet, { footer: env.printer.footer });
    return { text: renderText(ops, { width: charsPerLine(58) }), paperWidthMm: 58 };
  },

  /** Creates a short test slip for browser print preview. */
  async testPrint(auth: StaffAccessTokenPayload, outletId: string): Promise<PrintResult> {
    assertOutletAccess(auth, outletId);
    const outlet = await Outlet.findById(outletId);
    if (!outlet) throw ApiError.notFound('Outlet not found');
    const status = PrintService.status();
    return PrintService.dispatch({
      auth,
      outletId,
      type: 'TEST',
      copies: 1,
      isReprint: false,
      ticketFor: () => [
        { t: 'text', text: outlet.name, align: 'center', bold: true, size: 3 },
        { t: 'text', text: 'PRINTER TEST', align: 'center', bold: true },
        { t: 'rule', char: '=' },
        { t: 'text', text: 'T-000', align: 'center', bold: true, size: 3 },
        { t: 'rule', char: '=' },
        { t: 'cols', left: 'Driver', right: status.driver },
        { t: 'cols', left: 'Paper', right: `${status.paperWidthMm} mm` },
        { t: 'cols', left: 'Chars/line', right: String(status.charactersPerLine) },
        { t: 'cols', left: 'Time', right: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) },
        { t: 'rule' },
        { t: 'text', text: '58 mm browser print preview test', align: 'center' },
      ],
    });
  },

  async recentJobs(outletId: string, auth: StaffAccessTokenPayload, limit = 20) {
    assertOutletAccess(auth, outletId);
    return PrintJob.find({ outletId }).sort({ createdAt: -1 }).limit(Math.min(limit, 100)).populate('requestedBy', 'name role');
  },
};
