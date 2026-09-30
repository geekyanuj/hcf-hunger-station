import { describe, it, expect, afterEach } from 'vitest';
import net from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { env } from '../../config/env';
import { getTransport } from '../../services/print/transport';

const original = { ...env.printer };
afterEach(() => {
  Object.assign(env.printer, original);
});

function listen(): Promise<{ server: net.Server; port: number; received: Promise<Buffer> }> {
  return new Promise((resolve) => {
    let onData: (b: Buffer) => void;
    const received = new Promise<Buffer>((r) => (onData = r));
    const server = net.createServer((socket) => {
      const chunks: Buffer[] = [];
      socket.on('data', (c) => chunks.push(c));
      socket.on('end', () => onData(Buffer.concat(chunks)));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as net.AddressInfo).port, received }));
  });
}

describe('printer transports', () => {
  it('defaults to DISABLED (browser print) and treats unknown drivers the same way', () => {
    env.printer.driver = 'DISABLED';
    expect(getTransport().driver).toBe('DISABLED');
    expect(getTransport().isConfigured()).toBe(false);
    env.printer.driver = 'SOMETHING_ELSE';
    expect(getTransport().driver).toBe('DISABLED');
  });

  it('NETWORK: delivers the exact bytes to a raw TCP (port 9100 style) printer', async () => {
    const { server, port, received } = await listen();
    Object.assign(env.printer, { driver: 'NETWORK', host: '127.0.0.1', port, timeoutMs: 2000 });
    const transport = getTransport();
    expect(transport.isConfigured()).toBe(true);
    await transport.send(Buffer.from([0x1b, 0x40, 0x41, 0x0a]), 'A');
    expect([...(await received)]).toEqual([0x1b, 0x40, 0x41, 0x0a]);
    server.close();
  });

  it('NETWORK: reports an unreachable printer with a readable message', async () => {
    const { server, port } = await listen();
    await new Promise((r) => server.close(r)); // port is now closed
    Object.assign(env.printer, { driver: 'NETWORK', host: '127.0.0.1', port, timeoutMs: 1000 });
    await expect(getTransport().send(Buffer.from('x'), 'x')).rejects.toThrow(/refused the connection/);
  });

  it('NETWORK: is "not configured" without a host', () => {
    Object.assign(env.printer, { driver: 'NETWORK', host: '' });
    expect(getTransport().isConfigured()).toBe(false);
  });

  it('FILE: appends raw bytes to the device/queue path', async () => {
    const file = path.join(os.tmpdir(), `printer-${process.pid}.bin`);
    fs.rmSync(file, { force: true });
    Object.assign(env.printer, { driver: 'FILE', devicePath: file });
    await getTransport().send(Buffer.from([1, 2, 3]), '');
    await getTransport().send(Buffer.from([4]), '');
    expect([...fs.readFileSync(file)]).toEqual([1, 2, 3, 4]);
    fs.rmSync(file, { force: true });
  });

  it('FILE: explains a missing device', async () => {
    Object.assign(env.printer, { driver: 'FILE', devicePath: '/nonexistent-dir/lp0' });
    await expect(getTransport().send(Buffer.from('x'), 'x')).rejects.toThrow(/does not exist/);
  });
});
