const esc = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] as string);

/** Opens browser print preview for a plain-text test slip on the 58 mm roll. */
export function printPlainText(title: string, text: string) {
  const printWindow = window.open('', '_blank', 'width=420,height=720');
  if (!printWindow) throw new Error('Please allow pop-ups to open the browser print preview.');

  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: 58mm auto; margin: 0 }
    html, body { width: 58mm; margin: 0; padding: 0; background: #fff; color: #000 }
    pre { box-sizing: border-box; width: 58mm; margin: 0; padding: 3mm 2.5mm; font: 9pt/1.25 ui-monospace, "Courier New", monospace; white-space: pre-wrap; overflow-wrap: anywhere }
  </style></head><body><pre>${esc(text)}</pre></body></html>`);
  printWindow.document.close();
  printWindow.focus();

  let hasPrinted = false;
  const print = () => {
    if (hasPrinted || printWindow.closed) return;
    hasPrinted = true;
    printWindow.print();
  };
  printWindow.onload = print;
  window.setTimeout(print, 400);
}
