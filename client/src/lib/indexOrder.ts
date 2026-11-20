/**
 * Reproduces IndexedDB's index ordering in memory: string keys compare by UTF-16 code units and ties fall
 * back to the primary key. Used instead of `orderBy(field)` for fields whose index is blinded at rest
 * (ST24-05), so results are identical whether or not the ledger is encrypted.
 */
const cmp = (a: unknown, b: unknown) => (a! < b! ? -1 : a! > b! ? 1 : 0);
export function sortAsIndexed<T extends { id?: string }>(rows: readonly T[], field: keyof T & string): T[] {
  // Rows missing the indexed field are not part of an IndexedDB index, so they are not returned.
  return rows.filter(r => r[field] !== undefined && r[field] !== null)
    .sort((x, y) => cmp(x[field], y[field]) || cmp(x.id, y.id));
}
