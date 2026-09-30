import net from 'net';
import fs from 'fs/promises';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { ApiError } from '../../utils/ApiError';

/**
 * How raw ESC/POS bytes physically reach the printer. Add a new driver here
 * (e.g. a Windows print queue or a serial port) and select it with
 * PRINTER_DRIVER - nothing else in the app needs to change.
 */
export type PrinterDriverName = 'DISABLED' | 'NETWORK' | 'FILE' | 'CONSOLE';

export interface PrintTransport {
  readonly driver: PrinterDriverName;
  /** False when the driver is selected but its settings (host / device path) are missing. */
  isConfigured(): boolean;
  /** Human-readable target for the admin UI / logs, e.g. "192.168.1.50:9100". Never includes secrets. */
  target(): string;
  send(data: Buffer, textPreview: string): Promise<void>;
}

const KNOWN_DRIVERS: PrinterDriverName[] = ['DISABLED', 'NETWORK', 'FILE', 'CONSOLE'];

function friendlyNetworkError(err: NodeJS.ErrnoException, host: string, port: number): string {
  switch (err.code) {
    case 'ECONNREFUSED':
      return `Printer at ${host}:${port} refused the connection. Check it is powered on and that the port is correct (usually 9100).`;
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
    case 'ENOTFOUND':
      return `Printer at ${host}:${port} cannot be reached. Check the IP address and that this server is on the same network.`;
    case 'ETIMEDOUT':
      return `Timed out connecting to the printer at ${host}:${port}.`;
    default:
      return `Printer error (${err.code ?? 'unknown'}): ${err.message}`;
  }
}

const networkTransport: PrintTransport = {
  driver: 'NETWORK',
  isConfigured: () => !!env.printer.host && Number.isFinite(env.printer.port),
  target: () => `${env.printer.host}:${env.printer.port}`,
  send: (data) =>
    new Promise<void>((resolve, reject) => {
      const { host, port, timeoutMs } = env.printer;
      const socket = net.createConnection({ host, port });
      let settled = false;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (err) reject(ApiError.badRequest(err.message));
        else resolve();
      };
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => {
        socket.write(data, (err) => {
          if (err) return finish(new Error(friendlyNetworkError(err as NodeJS.ErrnoException, host, port)));
          // Give the printer a moment to take the data before closing the socket.
          socket.end();
        });
      });
      socket.once('close', () => finish());
      socket.once('timeout', () => finish(new Error(`Timed out talking to the printer at ${host}:${port}.`)));
      socket.once('error', (err) => finish(new Error(friendlyNetworkError(err as NodeJS.ErrnoException, host, port))));
    }),
};

const fileTransport: PrintTransport = {
  driver: 'FILE',
  isConfigured: () => !!env.printer.devicePath,
  target: () => env.printer.devicePath,
  send: async (data) => {
    try {
      await fs.writeFile(env.printer.devicePath, data, { flag: 'a' });
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      const hint =
        e.code === 'ENOENT'
          ? 'The device path does not exist - is the printer plugged in / mapped into the container?'
          : e.code === 'EACCES'
            ? 'Permission denied - the API user needs write access to the printer device.'
            : e.message;
      throw ApiError.badRequest(`Could not write to printer device "${env.printer.devicePath}": ${hint}`);
    }
  },
};

const consoleTransport: PrintTransport = {
  driver: 'CONSOLE',
  isConfigured: () => true,
  target: () => 'API log',
  send: async (_data, textPreview) => {
    logger.info(`[PRINTER:CONSOLE]\n${textPreview}`);
  },
};

const disabledTransport: PrintTransport = {
  driver: 'DISABLED',
  isConfigured: () => false,
  target: () => 'browser print',
  send: async () => {
    throw ApiError.badRequest('No printer driver is configured (PRINTER_DRIVER=DISABLED).');
  },
};

export function getTransport(): PrintTransport {
  const name = (KNOWN_DRIVERS.includes(env.printer.driver as PrinterDriverName) ? env.printer.driver : 'DISABLED') as PrinterDriverName;
  switch (name) {
    case 'NETWORK':
      return networkTransport;
    case 'FILE':
      return fileTransport;
    case 'CONSOLE':
      return consoleTransport;
    default:
      return disabledTransport;
  }
}
