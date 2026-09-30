/**
 * Minimal, dependency-free ESC/POS toolkit for 58 mm / 80 mm thermal printers.
 *
 * A ticket is described once as a list of neutral operations (`TicketOp[]`)
 * and can then be rendered to:
 *   - raw ESC/POS bytes for the printer            -> renderEscPos()
 *   - a plain-text preview (logs, tests, browser)  -> renderText()
 *
 * Keeping the layout separate from the bytes means the token looks the same
 * whichever route it takes to paper, and the layout is unit-testable without
 * any hardware.
 */

export type Align = 'left' | 'center' | 'right';

export type TicketOp =
  | { t: 'text'; text: string; align?: Align; bold?: boolean; /** 1 = normal, 2 = double, 3 = triple width & height */ size?: 1 | 2 | 3 }
  | { t: 'cols'; left: string; right: string; bold?: boolean }
  | { t: 'rule'; char?: string }
  | { t: 'feed'; lines: number };

export interface RenderOptions {
  /** Characters per line at normal size: 48 for 80 mm paper, 32 for 58 mm. */
  width: number;
  cut?: boolean;
  openDrawer?: boolean;
}

export function charsPerLine(paperWidthMm: number): number {
  return paperWidthMm === 58 ? 32 : 48;
}

// ---------------------------------------------------------------------------
// Text handling
// ---------------------------------------------------------------------------

const REPLACEMENTS: Record<string, string> = {
  '×': 'x', '✕': 'x', '₹': 'Rs ', '–': '-', '—': '-', '·': '-', '•': '*', '…': '...',
  '‘': "'", '’': "'", '“': '"', '”': '"', '\u00a0': ' ',
};

/**
 * Most thermal printers ship with a Latin code page, so anything outside
 * printable ASCII would print as garbage. Common symbols are transliterated;
 * everything else becomes '?'. (Devanagari etc. needs a printer-side code page,
 * which is model specific - see docs/PRINTING.md.)
 */
export function toPrinterText(input: string): string {
  let out = '';
  for (const ch of String(input ?? '')) {
    if (REPLACEMENTS[ch] !== undefined) out += REPLACEMENTS[ch];
    else if (ch === '\n' || ch === '\t') out += ' ';
    else if (ch >= ' ' && ch <= '~') out += ch;
    else out += '?';
  }
  return out;
}

export function wrapText(text: string, width: number): string[] {
  const clean = toPrinterText(text).trim();
  if (!clean) return [''];
  const lines: string[] = [];
  let line = '';
  for (const word of clean.split(/\s+/)) {
    if (word.length > width) {
      // A single over-long word: hard split.
      if (line) {
        lines.push(line);
        line = '';
      }
      for (let i = 0; i < word.length; i += width) lines.push(word.slice(i, i + width));
      continue;
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function alignLine(line: string, width: number, align: Align): string {
  if (align === 'center') return ' '.repeat(Math.max(0, Math.floor((width - line.length) / 2))) + line;
  if (align === 'right') return ' '.repeat(Math.max(0, width - line.length)) + line;
  return line;
}

/** Left text + right text on one line; the left side wraps if it does not fit. */
function colsLines(left: string, right: string, width: number): string[] {
  const r = toPrinterText(right).trim();
  const leftWidth = Math.max(8, width - r.length - 1);
  const leftLines = wrapText(left, leftWidth);
  const last = leftLines.length - 1;
  return leftLines.map((l, i) => (i === last ? l + ' '.repeat(Math.max(1, width - l.length - r.length)) + r : l));
}

// ---------------------------------------------------------------------------
// Plain-text renderer
// ---------------------------------------------------------------------------

export function renderText(ops: TicketOp[], opts: Pick<RenderOptions, 'width'>): string {
  const out: string[] = [];
  for (const op of ops) {
    switch (op.t) {
      case 'text': {
        const size = op.size ?? 1;
        const width = Math.floor(opts.width / size);
        for (const l of wrapText(op.text, width)) out.push(alignLine(l, width, op.align ?? 'left').trimEnd());
        break;
      }
      case 'cols':
        out.push(...colsLines(op.left, op.right, opts.width));
        break;
      case 'rule':
        out.push((op.char ?? '-').repeat(opts.width));
        break;
      case 'feed':
        for (let i = 0; i < op.lines; i += 1) out.push('');
        break;
    }
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// ESC/POS renderer
// ---------------------------------------------------------------------------

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const CMD = {
  init: [ESC, 0x40],
  align: (a: Align) => [ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0],
  bold: (on: boolean) => [ESC, 0x45, on ? 1 : 0],
  size: (s: 1 | 2 | 3) => [GS, 0x21, ((s - 1) << 4) | (s - 1)],
  cut: [GS, 0x56, 0x42, 0x00], // partial cut after feeding the paper to the cutter
  drawer: [ESC, 0x70, 0x00, 0x19, 0xfa],
};

export function renderEscPos(ops: TicketOp[], opts: RenderOptions): Buffer {
  const bytes: number[] = [...CMD.init];
  const pushText = (s: string) => {
    for (const ch of s) bytes.push(ch.charCodeAt(0));
    bytes.push(LF);
  };

  if (opts.openDrawer) bytes.push(...CMD.drawer);

  for (const op of ops) {
    switch (op.t) {
      case 'text': {
        const size = op.size ?? 1;
        const width = Math.floor(opts.width / size);
        bytes.push(...CMD.align(op.align ?? 'left'), ...CMD.bold(!!op.bold), ...CMD.size(size));
        for (const l of wrapText(op.text, width)) pushText(l);
        bytes.push(...CMD.size(1), ...CMD.bold(false), ...CMD.align('left'));
        break;
      }
      case 'cols': {
        bytes.push(...CMD.align('left'), ...CMD.bold(!!op.bold));
        for (const l of colsLines(op.left, op.right, opts.width)) pushText(l);
        bytes.push(...CMD.bold(false));
        break;
      }
      case 'rule':
        bytes.push(...CMD.align('left'));
        pushText((op.char ?? '-').repeat(opts.width));
        break;
      case 'feed':
        for (let i = 0; i < op.lines; i += 1) bytes.push(LF);
        break;
    }
  }

  if (opts.cut !== false) {
    bytes.push(LF, LF, LF, ...CMD.cut);
  } else {
    bytes.push(LF, LF, LF, LF);
  }
  return Buffer.from(bytes);
}
