/**
 * Office Open XML (xlsx) adapter (STANDARDS.md): the only place that knows the spreadsheet library, so it can
 * be replaced. Every cell is read as text; numbers and dates are converted once, here (ADR-0053: no floats
 * travel further). Limits protect the server from oversized uploads.
 */
import ExcelJS from "exceljs";

export interface SheetColumn {
  header: string;
  note?: string;
  /** Text columns are formatted as text so Excel keeps leading zeros (HSN 0401, PIN codes). */
  text?: boolean;
  /** Drop-down values (only when the list fits Excel's 255-character limit). */
  values?: readonly string[];
  width?: number;
}

export interface SheetSpec {
  name: string;
  columns: readonly SheetColumn[];
  rows?: readonly (readonly string[])[];
}

export interface ReadLimits {
  maxBytes?: number; // default 2 MB
  maxRows?: number; // default 5000
}

export interface ReadSheet {
  name: string;
  headers: string[];
  rows: { row: number; cells: string[] }[];
}

export class SpreadsheetError extends Error {
  override name = "SpreadsheetError";
}

export async function writeWorkbook(sheets: readonly SheetSpec[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MASTER-ERP";
  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = spec.columns.map((c) => ({ header: c.header, width: c.width ?? Math.min(Math.max(c.header.length + 4, 12), 40), ...(c.text ? { style: { numFmt: "@" } } : {}) }));
    const head = ws.getRow(1);
    head.font = { bold: true };
    spec.columns.forEach((c, i) => {
      const cell = head.getCell(i + 1);
      if (c.note) cell.note = c.note;
      const list = c.values?.join(",");
      if (list && list.length <= 255) {
        for (let r = 2; r <= 1001; r++) ws.getCell(r, i + 1).dataValidation = { type: "list", allowBlank: true, formulae: [`"${list}"`] };
      }
    });
    for (const row of spec.rows ?? []) ws.addRow([...row]);
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value); // shortest round-trip form, e.g. 0.1 → "0.1"
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString().slice(0, 10); // Excel dates carry no zone: read as UTC date
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("text" in value && typeof value.text === "string") return value.text; // hyperlink
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue); // formula: its last computed value
    if ("error" in value) return "";
  }
  return "";
}

/** Read one sheet (by name, or the first) as text. Blank rows are skipped. */
export async function readWorkbook(data: Uint8Array, sheetName?: string, limits: ReadLimits = {}): Promise<ReadSheet> {
  const maxBytes = limits.maxBytes ?? 2 * 1024 * 1024;
  const maxRows = limits.maxRows ?? 5000;
  if (data.byteLength > maxBytes) throw new SpreadsheetError(`The file is larger than ${Math.round(maxBytes / 1024)} KB`);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(data.buffer, data.byteOffset, data.byteLength) as unknown as ExcelJS.Buffer);
  } catch {
    throw new SpreadsheetError("The file is not a readable Excel (.xlsx) workbook");
  }
  const ws = sheetName ? (wb.getWorksheet(sheetName) ?? wb.worksheets[0]) : wb.worksheets[0];
  if (!ws) throw new SpreadsheetError("The workbook has no sheets");
  const width = ws.getRow(1).cellCount;
  const headers = Array.from({ length: width }, (_, i) => cellText(ws.getRow(1).getCell(i + 1).value).trim());
  const rows: ReadSheet["rows"] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells = Array.from({ length: width }, (_, i) => cellText(row.getCell(i + 1).value).trim());
    if (cells.every((c) => c === "")) continue;
    if (rows.length >= maxRows) throw new SpreadsheetError(`The sheet has more than ${maxRows} rows; split it into several files`);
    rows.push({ row: r, cells });
  }
  return { name: ws.name, headers, rows };
}
