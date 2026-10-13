/** Offline catalogue CSV parsing and validation. Parsing never writes to the ledger. */
export const CATALOG_CSV_HEADERS = ["name", "sku", "barcode", "categoryId", "sellingPriceMinor", "costPriceMinor", "stockQuantity", "lowStockThreshold"] as const;
export type CatalogCsvRow = Record<(typeof CATALOG_CSV_HEADERS)[number], string>;
const normalizeCode = (value: string) => value.trim().toLocaleUpperCase();
const maxRows = 10000;

/** RFC-style quoted fields, including embedded commas, escaped quotes, and line breaks. */
export function parseCsvRecords(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let record: string[] = [], field = "", quoted = false, afterQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; afterQuote = true; }
      else field += c;
    } else if (afterQuote) {
      if (c === ',') { record.push(field); field = ""; afterQuote = false; }
      else if (c === '\n' || c === '\r') {
        record.push(field); records.push(record); record = []; field = ""; afterQuote = false;
        if (c === '\r' && text[i + 1] === '\n') i++;
      } else if (c !== ' ' && c !== '\t') throw new Error(`Unexpected character after quoted CSV field at position ${i + 1}.`);
    } else if (c === '"') {
      if (field.length) throw new Error(`Unexpected quote in CSV field at position ${i + 1}.`);
      quoted = true;
    } else if (c === ',') { record.push(field); field = ""; }
    else if (c === '\n' || c === '\r') {
      record.push(field); records.push(record); record = []; field = "";
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else field += c;
    if (records.length > maxRows + 1) throw new Error("CSV import exceeds the 10,000 product limit.");
  }
  if (quoted) throw new Error("Unterminated quoted CSV field.");
  if (field !== "" || record.length || afterQuote) { record.push(field); records.push(record); }
  return records;
}

export function previewCatalogImport(csv: string): CatalogCsvRow[] {
  const records = parseCsvRecords(csv);
  const headers = records.shift();
  if (!headers || headers.length !== CATALOG_CSV_HEADERS.length ||
    headers.some((header, index) => header.trim() !== CATALOG_CSV_HEADERS[index])) {
    throw new Error(`CSV columns must be: ${CATALOG_CSV_HEADERS.join(", ")}.`);
  }
  if (!records.length) throw new Error("CSV file has no product rows.");
  const seen = new Set<string>();
  return records.map((values, index) => {
    const rowNumber = index + 2;
    if (values.length !== headers.length) throw new Error(`CSV row ${rowNumber} has ${values.length} columns; expected ${headers.length}.`);
    const row = Object.fromEntries(headers.map((key, i) => [key, values[i].trim()])) as CatalogCsvRow;
    if (row.name.length < 2 || row.name.length > 80) throw new Error(`CSV row ${rowNumber}: product name must be 2–80 characters.`);
    if (row.sku.length > 48 || row.barcode.length > 64) throw new Error(`CSV row ${rowNumber}: SKU or barcode is too long.`);
    for (const code of [row.sku, row.barcode].map(normalizeCode).filter(Boolean)) {
      if (seen.has(code)) throw new Error(`CSV row ${rowNumber}: duplicate SKU/barcode ${code}.`);
      seen.add(code);
    }
    for (const key of ["sellingPriceMinor", "stockQuantity", "lowStockThreshold"] as const) {
      if (!/^\d+$/.test(row[key]) || !Number.isSafeInteger(Number(row[key])) || Number(row[key]) > 999999999) throw new Error(`CSV row ${rowNumber}: invalid ${key}.`);
    }
    if (row.costPriceMinor && (!/^\d+$/.test(row.costPriceMinor) || !Number.isSafeInteger(Number(row.costPriceMinor)) || Number(row.costPriceMinor) > 999999999)) throw new Error(`CSV row ${rowNumber}: invalid costPriceMinor.`);
    if (Number(row.stockQuantity) > 9999999 || Number(row.lowStockThreshold) > 9999999) throw new Error(`CSV row ${rowNumber}: stock quantity exceeds the supported limit.`);
    return row;
  });
}

/** Escape spreadsheet-formula prefixes when a CSV is opened in Excel or Sheets. */
export function escapeCsvSpreadsheetFormula(value: string): string {
  return /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? `'${value}` : value;
}
