export type CsvCell = string | number | boolean | null | undefined | Date;

export interface CsvOptions {
  delimiter?: string;
  bom?: boolean;
}

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

function cellToString(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString();
  if (typeof cell === "string") {
    const first = cell[0] ?? "";
    // Guard against spreadsheet formula injection for text cells only.
    return FORMULA_PREFIXES.includes(first) ? `'${cell}` : cell;
  }
  return String(cell);
}

function quoteCell(value: string, delimiter: string): string {
  const needsQuotes =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\r") ||
    value.includes("\n");
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serializes a table to RFC 4180 CSV with CRLF line endings (including the last line). */
export function toCsv(headers: string[], rows: CsvCell[][], opts: CsvOptions = {}): string {
  const delimiter = opts.delimiter ?? ";";
  const lines: string[] = [
    headers.map((header) => quoteCell(cellToString(header), delimiter)).join(delimiter),
  ];
  for (const row of rows) {
    lines.push(row.map((cell) => quoteCell(cellToString(cell), delimiter)).join(delimiter));
  }
  const body = lines.map((line) => `${line}\r\n`).join("");
  return (opts.bom ?? true) ? `\uFEFF${body}` : body;
}
