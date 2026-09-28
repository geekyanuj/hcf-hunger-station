/**
 * Minimal, dependency-free CSV serializer. Handles the escaping rules that
 * actually matter for this project's data (commas, quotes, newlines inside
 * text fields like customer notes or wastage reasons) without pulling in a
 * full CSV library for what's fundamentally a simple, well-understood format.
 */
export function toCsv(rows: Record<string, unknown>[], columns: { key: string; header: string }[]): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const str = value instanceof Date ? value.toISOString() : String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const headerLine = columns.map((c) => escape(c.header)).join(',');
  const lines = rows.map((row) => columns.map((c) => escape(row[c.key])).join(','));
  return [headerLine, ...lines].join('\n');
}
