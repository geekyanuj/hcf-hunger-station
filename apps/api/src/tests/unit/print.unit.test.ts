import { describe, it, expect } from 'vitest';
import { charsPerLine, renderEscPos, renderText, toPrinterText, wrapText, TicketOp } from '../../services/print/escpos';
import { buildTokenTicket } from '../../services/print/tokenTicket';
import type { IOrder } from '../../models/Order';

const outlet = { name: 'HCF Azadnagar', address: 'Azadnagar, Dhanbad, Jharkhand', phone: '+919000000001' };

function fakeOrder(overrides: Record<string, unknown> = {}): IOrder {
  return {
    tokenNumber: 'T-104',
    orderNumber: 'HCF284',
    orderType: 'DINE_IN',
    tableNumber: '7',
    paymentStatus: 'PENDING',
    paymentMethod: 'PAY_AFTER_DINE_IN',
    total: 280,
    createdAt: new Date('2026-09-30T06:30:00.000Z'),
    customerNotes: 'Less spicy please',
    items: [
      {
        name: 'Classic Chicken Burger',
        unitPrice: 100,
        quantity: 2,
        lineTotal: 230,
        selectedModifiers: [{ optionName: 'Large', priceDelta: 5 }, { optionName: 'Extra Cheese', priceDelta: 10 }],
      },
      { name: 'French Fries', unitPrice: 50, quantity: 1, lineTotal: 50, selectedModifiers: [], notes: 'No salt' },
    ],
    ...overrides,
  } as unknown as IOrder;
}

describe('toPrinterText', () => {
  it('transliterates common symbols and masks anything a Latin code page cannot print', () => {
    expect(toPrinterText('2 × Burger – ₹150')).toBe('2 x Burger - Rs 150');
    expect(toPrinterText('चिकन')).toBe('????');
  });
});

describe('wrapText', () => {
  it('wraps on word boundaries and hard-splits over-long words', () => {
    expect(wrapText('aaa bbb ccc', 7)).toEqual(['aaa bbb', 'ccc']);
    expect(wrapText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });
});

describe('renderText', () => {
  const width = 20;
  it('aligns, pads columns to the full width and draws rules', () => {
    const ops: TicketOp[] = [
      { t: 'text', text: 'HI', align: 'center' },
      { t: 'cols', left: 'Order', right: 'HCF1' },
      { t: 'rule', char: '=' },
    ];
    const lines = renderText(ops, { width }).split('\n');
    expect(lines[0]).toBe(' '.repeat(9) + 'HI');
    expect(lines[1]).toHaveLength(width);
    expect(lines[1].startsWith('Order')).toBe(true);
    expect(lines[1].endsWith('HCF1')).toBe(true);
    expect(lines[2]).toBe('='.repeat(width));
  });
  it('halves the usable width for double-size text', () => {
    expect(renderText([{ t: 'text', text: 'abcdefghijklmnopqrst', size: 2 }], { width }).split('\n')).toEqual(['abcdefghij', 'klmnopqrst']);
  });
});

describe('renderEscPos', () => {
  const ops: TicketOp[] = [{ t: 'text', text: 'TOKEN', align: 'center', bold: true, size: 3 }];

  it('starts with ESC @ (init) and ends with a partial cut when cutting is on', () => {
    const buf = renderEscPos(ops, { width: 48, cut: true });
    expect([...buf.subarray(0, 2)]).toEqual([0x1b, 0x40]);
    expect([...buf.subarray(buf.length - 4)]).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });
  it('emits centre-align, bold and triple-size commands around the text', () => {
    const hex = renderEscPos(ops, { width: 48 }).toString('hex');
    expect(hex).toContain('1b6101'); // centre
    expect(hex).toContain('1b4501'); // bold on
    expect(hex).toContain('1d2122'); // GS ! 0x22 -> 3x width, 3x height
    expect(hex).toContain(Buffer.from('TOKEN').toString('hex'));
  });
  it('omits the cut command when cut is disabled and adds the drawer kick when asked', () => {
    const noCut = renderEscPos(ops, { width: 48, cut: false });
    expect(noCut.toString('hex')).not.toContain('1d564200');
    expect(renderEscPos(ops, { width: 48, openDrawer: true }).toString('hex')).toContain('1b700019fa');
  });
  it('never emits a byte above 0x7f in text (no garbage on Latin code pages)', () => {
    const buf = renderEscPos([{ t: 'text', text: 'Burger × 2 ₹' }], { width: 48 });
    expect(buf.includes(0xc3)).toBe(false);
    expect(buf.toString('latin1')).toContain('Burger x 2 Rs');
  });
});

describe('charsPerLine', () => {
  it('maps paper width to characters per line', () => {
    expect(charsPerLine(80)).toBe(48);
    expect(charsPerLine(58)).toBe(32);
  });
});

describe('buildTokenTicket', () => {
  const text = (order: IOrder, opts = {}) => renderText(buildTokenTicket(order, outlet, opts), { width: 32 });

  it('prints outlet, token, order details, items, quantities, prices, modifiers and comments', () => {
    const out = text(fakeOrder());
    expect(out).toContain('HCF Azadnagar');
    expect(out).toContain('T-104');
    expect(out).toContain('HCF284');
    expect(out).toContain('DINE IN');
    expect(out).toMatch(/Table\s+7/);
    expect(out).toContain('Classic Chicken Burger');
    expect(out).toContain('+ Large, Extra Cheese');
    expect(out).toContain('Note: No salt');
    expect(out).toContain('Less spicy please');
    expect(out).toContain('2 x 115.00');
    expect(out).toContain('230.00');
    expect(out).toContain('280.00');
  });
  it('shows IST time, not UTC', () => {
    expect(text(fakeOrder())).toMatch(/12:00\s?pm/i); // 06:30Z = 12:00 IST
  });
  it('marks reprints and copies via the tag', () => {
    expect(text(fakeOrder(), { tag: 'REPRINT - COPY 2/2' })).toContain('** REPRINT - COPY 2/2 **');
  });
  it('omits the table row for non-dine-in orders', () => {
    expect(text(fakeOrder({ orderType: 'TAKEAWAY', tableNumber: undefined }))).not.toMatch(/Table/);
  });
});
