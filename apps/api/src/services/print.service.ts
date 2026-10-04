import { Types } from 'mongoose';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { Outlet } from '../models/Outlet';
import { PrintJob, PrintJobType } from '../models/PrintJob';
import { StaffAccessTokenPayload } from '../types/auth';
import { ApiError } from '../utils/ApiError';
import { OrderService } from './order.service';
import { charsPerLine, renderEscPos, renderText, TicketOp } from './print/escpos';
import { buildTokenTicket } from './print/tokenTicket';
import { getTransport } from './print/transport';

export interface PrintResult {
  /** True only when bytes were delivered to the thermal printer. */
  printed: boolean;
  /** PRINTER = sent to hardware. BROWSER = no printer connected, the web app should print `text` itself. */
  mode: 'PRINTER' | 'BROWSER';
  driver: string;
  copies: number;
  isReprint: boolean;
  jobId: string;
  /** Plain-text rendering of the slip (also what the browser fallback prints). */
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
  /** Non-sensitive summary of the printer setup, for the admin/staff UI. */
  status() {
    const transport = getTransport();
    const configured = transport.isConfigured();
    return {
      driver: transport.driver,
      configured,
      /** PRINTER once hardware is connected & configured, otherwise BROWSER (print dialog fallback). */
      mode: transport.driver !== 'DISABLED' && configured ? ('PRINTER' as const) : ('BROWSER' as const),
      target: transport.target(),
      paperWidthMm: env.printer.paperWidthMm,
      charactersPerLine: charsPerLine(env.printer.paperWidthMm),
      autoCut: env.printer.cut,
      openDrawer: env.printer.openDrawer,
      defaultCopies: env.printer.copies,
      hint:
        transport.driver === 'DISABLED'
          ? 'No printer connected yet. Set PRINTER_DRIVER (NETWORK or FILE) in the API environment - see docs/PRINTING.md.'
          : !configured
            ? `PRINTER_DRIVER=${transport.driver} is selected but its address/device is missing.`
            : undefined,
    };
  },

  /** Shared delivery path for tokens and test slips: render, send (or fall back), and record a PrintJob. */
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
    const transport = getTransport();
    const width = charsPerLine(env.printer.paperWidthMm);
    const hardware = transport.driver !== 'DISABLED' && transport.isConfigured();
    const textOf = (tag?: string) => renderText(params.ticketFor(tag), { width });

    const record = (status: 'PRINTED' | 'BROWSER' | 'FAILED', error?: string) =>
      PrintJob.create({
        outletId: params.outletId,
        orderId: params.orderId,
        tokenNumber: params.tokenNumber,
        requestedBy: params.auth.sub,
        type: params.type,
        status,
        driver: transport.driver,
        copies: params.copies,
        isReprint: params.isReprint,
        error,
      });

    const base = {
      driver: transport.driver,
      copies: params.copies,
      isReprint: params.isReprint,
      paperWidthMm: env.printer.paperWidthMm,
      text: textOf(params.isReprint ? 'REPRINT' : undefined),
    };

    if (!hardware) {
      const job = await record('BROWSER');
      return {
        ...base,
        printed: false,
        mode: 'BROWSER',
        jobId: job.id,
        warning: transport.driver === 'DISABLED' ? undefined : `PRINTER_DRIVER=${transport.driver} is not fully configured; using browser print.`,
      };
    }

    try {
      for (let copy = 1; copy <= params.copies; copy += 1) {
        const tags = [params.isReprint ? 'REPRINT' : '', params.copies > 1 ? `COPY ${copy}/${params.copies}` : ''].filter(Boolean);
        const ops = params.ticketFor(tags.join(' - ') || undefined);
        const data = renderEscPos(ops, { width, cut: env.printer.cut, openDrawer: env.printer.openDrawer && copy === 1 });
        await transport.send(data, renderText(ops, { width }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Printing failed';
      await record('FAILED', message);
      logger.warn(`[print] ${params.type} failed via ${transport.driver}: ${message}`);
      throw new ApiError(502, message);
    }

    const job = await record('PRINTED');
    return { ...base, printed: true, mode: 'PRINTER', jobId: job.id };
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

  /** Renders the token without printing or logging anything (used for the on-screen preview). */
  async previewToken(orderId: string, auth: StaffAccessTokenPayload) {
    const order = await OrderService.getById(orderId);
    assertOutletAccess(auth, order.outletId.toString());
    const outlet = await Outlet.findById(order.outletId);
    if (!outlet) throw ApiError.notFound('Outlet not found for this order');
    const ops = buildTokenTicket(order, outlet, { footer: env.printer.footer });
    return { text: renderText(ops, { width: charsPerLine(env.printer.paperWidthMm) }), paperWidthMm: env.printer.paperWidthMm };
  },

  /** Prints a short alignment/size test slip so the printer can be verified right after connecting it. */
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
        { t: 'text', text: 'If you can read this clearly, the printer is connected correctly.', align: 'center' },
      ],
    });
  },

  async recentJobs(outletId: string, auth: StaffAccessTokenPayload, limit = 20) {
    assertOutletAccess(auth, outletId);
    return PrintJob.find({ outletId }).sort({ createdAt: -1 }).limit(Math.min(limit, 100)).populate('requestedBy', 'name role');
  },
};
