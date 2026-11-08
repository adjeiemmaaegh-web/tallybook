// Persist only an opaque digest and request ID. Supplier and order details
// remain in the server ledger. The calling tab retains the ID until receipt.
export async function purchaseRetry(userId: string, companyId: string, kind: string, payload: unknown, storage: Storage) {
  const bytes = new TextEncoder().encode(JSON.stringify([userId, companyId, kind, payload]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const key = "tallybook.purchase.retry." + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const saved = storage.getItem(key);
  const id = saved ?? crypto.randomUUID();
  if (!saved) storage.setItem(key, id);
  return { id, confirm() { if (storage.getItem(key) === id) storage.removeItem(key); } };
}

type StockSelection = {storeId: string; productId: string};

export async function openStockCount(
  userId: string,
  companyId: string,
  selection: StockSelection,
  storage: Storage,
  start: (companyId: string, input: StockSelection & {countId: string}) => Promise<unknown>,
) {
  const {storeId, productId} = selection;
  const retry = await purchaseRetry(userId, companyId, "stock-count-start", {storeId, productId}, storage);
  await start(companyId, {storeId, productId, countId: retry.id});
  retry.confirm();
}
