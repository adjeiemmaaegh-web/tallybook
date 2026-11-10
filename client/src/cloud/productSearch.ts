/**
 * Matching for the till's search box and barcode scanning. Pure, so it is easy
 * to test and shared by camera scans, USB/Bluetooth scanners (which type the
 * code and press Enter) and hand-typed codes.
 */
export interface SearchableProduct {
  id: string; name: string; barcode?: string | null; category?: string | null;
}

/** Scanners may add prefixes, suffixes or line breaks; keep only the printable code. */
export function normalizeCode(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 64);
}

const digitsOnly = (value: string) => /^\d+$/.test(value);

/**
 * Two codes name the same product when they are equal (ignoring case), or when
 * one is the 13-digit EAN form of the other's 12-digit UPC-A (an extra leading
 * zero). Cameras and scanners differ on which form they report.
 */
export function sameCode(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a.toLowerCase() === b.toLowerCase()) return true;
  if (digitsOnly(a) && digitsOnly(b)) {
    if (a.length === 13 && b.length === 12) return a === "0" + b;
    if (a.length === 12 && b.length === 13) return b === "0" + a;
  }
  return false;
}

export function findByBarcode<T extends SearchableProduct>(products: readonly T[], raw: string): T | null {
  const code = normalizeCode(raw);
  if (!code) return null;
  return products.find(p => p.barcode != null && sameCode(normalizeCode(p.barcode), code)) ?? null;
}

/** Case-insensitive match on name, category or barcode. An empty query keeps everything. */
export function filterProducts<T extends SearchableProduct>(products: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...products];
  return products.filter(p => p.name.toLowerCase().includes(q)
    || (p.category ?? "").toLowerCase().includes(q)
    || (p.barcode ?? "").toLowerCase().includes(q));
}
