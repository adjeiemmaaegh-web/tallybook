/**
 * Run 13: read-only, deterministic reconciliation of prospective store stock.
 * IMPORTANT: This module does not enable postings, transfer execution, or
 * multi-device checkout. Those require atomic Dexie integration and deferred QA.
 * All quantities are integer units. Company-level stock remains authoritative
 * until opening allocations have been explicitly confirmed and posted.
 */
const validQty = value => Number.isSafeInteger(value) && value >= 0 && value <= 9_999_999;
const key = (storeId, productId) => JSON.stringify([storeId, productId]);
const fail = message => { throw new Error(message); };
export function reconcileStoreStockPlan({ companyId, products, stores, allocations, transfers }) {
  if (typeof companyId !== "string" || !companyId.trim()) fail("Company identity required.");
  if (![products, stores, allocations, transfers].every(Array.isArray)) fail("Invalid store reconciliation input.");
  const storeById = new Map(), productById = new Map(), balances = new Map();
  for (const store of stores) {
    if (!store || store.businessProfileId !== companyId || typeof store.id !== "string" || !store.id ||
        storeById.has(store.id)) fail("Duplicate or cross-company store.");
    storeById.set(store.id, store);
  }
  for (const product of products) {
    if (!product || product.businessProfileId !== companyId || typeof product.id !== "string" || !product.id ||
        productById.has(product.id) || !validQty(product.stockQuantity)) fail("Invalid company stock product.");
    productById.set(product.id, product);
  }
  const allocated = new Map();
  for (const allocation of allocations) {
    if (!allocation || allocation.businessProfileId !== companyId || !storeById.has(allocation.storeId) ||
        !productById.has(allocation.productId) || !validQty(allocation.quantity))
      fail("Invalid opening store allocation.");
    if (storeById.get(allocation.storeId).status !== "active") fail("Cannot allocate to a closed store.");
    const slot = key(allocation.storeId, allocation.productId);
    if (balances.has(slot)) fail("Duplicate opening store allocation.");
    balances.set(slot, allocation.quantity);
    const total = (allocated.get(allocation.productId) ?? 0) + allocation.quantity;
    if (!Number.isSafeInteger(total) || total > productById.get(allocation.productId).stockQuantity)
      fail("Store allocations exceed company stock.");
    allocated.set(allocation.productId, total);
  }
  const seenTransfers = new Set();
  for (const transfer of transfers) {
    if (!transfer || transfer.businessProfileId !== companyId || typeof transfer.id !== "string" || !transfer.id ||
        seenTransfers.has(transfer.id)) fail("Invalid or duplicated store transfer.");
    seenTransfers.add(transfer.id);
    const source = storeById.get(transfer.sourceStoreId);
    const destination = storeById.get(transfer.destinationStoreId);
    if (!source || !destination || source.id === destination.id || source.status !== "active" || destination.status !== "active" ||
        !productById.has(transfer.productId) || !validQty(transfer.quantity) || transfer.quantity === 0)
      fail("Invalid store transfer references.");
    const from = key(source.id, transfer.productId), to = key(destination.id, transfer.productId);
    const available = balances.get(from) ?? 0, currentDestination = balances.get(to) ?? 0;
    if (available < transfer.quantity) fail("Insufficient source-store quantity.");
    if (!Number.isSafeInteger(currentDestination + transfer.quantity) || currentDestination + transfer.quantity > 9_999_999)
      fail("Destination-store stock exceeds quantity limits.");
    balances.set(from, available - transfer.quantity);
    balances.set(to, currentDestination + transfer.quantity);
  }
  const unallocated = products.map(product => ({
    productId: product.id,
    quantity: product.stockQuantity - (allocated.get(product.id) ?? 0)
  }));
  return {
    balances: [...balances].map(([pair, quantity]) => {
      const [storeId, productId] = JSON.parse(pair);
      return { storeId, productId, quantity };
    }).sort((a, b) => a.productId.localeCompare(b.productId) || a.storeId.localeCompare(b.storeId)),
    unallocated,
    transferCount: seenTransfers.size,
    authoritative: false
  };
}
