// A cell starting with one of these is a formula in Excel/Sheets; prefixing "'" makes it plain text.
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Array<Record<string, string | number | null>>, columns: string[]): string {
  return [columns.join(","), ...rows.map((row) => columns.map((column) => cell(row[column])).join(","))].map((line) => `${line}\r\n`).join("");
}
