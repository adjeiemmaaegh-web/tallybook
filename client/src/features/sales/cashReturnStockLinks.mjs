import { assertPartialCostRestoration } from '../inventory/partialCostRestoration.mjs';

/**
 * Read-only cross-check of a cash return against saved physical stock movement
 * and original FIFO allocation. The financial return journal alone does not
 * establish that its referenced stock/cost postings were actually committed.
 *
 * Inputs must come from one consistent IndexedDB transaction. This guard makes
 * no stock or cash change and is NOT a substitute for global ledger auditing.
 */
export function assertCashReturnStockLinks(sale, saleLines, returns, movements, costEvents) {
  if (!sale || !Array.isArray(saleLines) || !Array.isArray(returns) ||
      !Array.isArray(movements) || !Array.isArray(costEvents)) {
    throw new Error('Cash return stock and FIFO evidence is unavailable.');
  }
  const unique = (items, label) => {
    const map = new Map();
    for (const item of items) {
      if (!item || typeof item.id !== 'string' || !item.id || map.has(item.id))
        throw new Error(`Cash return ${label} has missing or duplicate identities.`);
      map.set(item.id, item);
    }
    return map;
  };
  const originalLines = unique(saleLines, 'sale lines');
  const stock = unique(movements, 'stock movements');
  const costs = unique(costEvents, 'FIFO events');
  const usedMovements = new Set();
  const usedCosts = new Set();
  const restoredByIssue = new Map();
  let previousTime = -Infinity;
  for (const ret of [...returns].sort((a, b) => a.returnSequence - b.returnSequence)) {
    const createdTime = Date.parse(ret?.createdAt);
    if (ret?.businessProfileId !== sale.businessProfileId || ret.originalSaleId !== sale.id ||
        !Number.isFinite(createdTime) || createdTime < previousTime || !Array.isArray(ret.lines)) {
      throw new Error('Cash return stock history belongs to another sale or is out of order.');
    }
    previousTime = createdTime;
    for (const row of ret.lines) {
      const original = originalLines.get(row?.saleLineId);
      const movement = stock.get(row?.movementId);
      const event = costs.get(row?.costEventId);
      const issue = original && costs.get(original.costEventId);
      if (!original || original.saleId !== sale.id || original.businessProfileId !== sale.businessProfileId ||
          original.productId !== row.productId || !Number.isSafeInteger(original.quantity) || original.quantity <= 0 ||
          !issue || issue.kind !== 'issue' || issue.saleId !== sale.id || issue.saleLineId !== original.id ||
          issue.businessProfileId !== sale.businessProfileId || issue.productId !== original.productId ||
          issue.quantityDelta !== -original.quantity ||
          !Number.isSafeInteger(row.quantity) || row.quantity <= 0 ||
          !movement || usedMovements.has(movement.id) || movement.businessProfileId !== sale.businessProfileId ||
          movement.productId !== row.productId || movement.movementType !== 'reversal' ||
          movement.quantityDelta !== row.quantity || movement.createdAt !== ret.createdAt ||
          !Number.isSafeInteger(movement.previousQuantity) || !Number.isSafeInteger(movement.resultingQuantity) ||
          BigInt(movement.resultingQuantity) - BigInt(movement.previousQuantity) !== BigInt(row.quantity) ||
          !event || usedCosts.has(event.id) || event.businessProfileId !== sale.businessProfileId ||
          event.kind !== 'reversal' || event.saleId !== sale.id || event.saleLineId !== original.id ||
          event.productId !== row.productId || event.reversesEventId !== issue.id ||
          event.sourceId !== movement.id || event.quantityDelta !== row.quantity ||
          event.createdAt !== ret.createdAt) {
        throw new Error('Cash return stock movement and FIFO event do not match the saved return.');
      }
      const prior = restoredByIssue.get(issue.id) ?? [];
      assertPartialCostRestoration(issue, prior, event);
      restoredByIssue.set(issue.id, [...prior, event]);
      usedMovements.add(movement.id);
      usedCosts.add(event.id);
    }
  }
  return { checkedReturns: returns.length, checkedLines: usedCosts.size };
}

/**
 * Verify every saved cash return in a complete company/backup snapshot. Unlike
 * per-sale review, this catches corruption without opening individual sales and
 * rejects the reuse of a physical movement or cost restoration by two sales.
 * All inputs must be captured from one consistent snapshot; this is read-only.
 */
export function assertCashReturnLedgerLinks(sales, saleLines, returns, movements, costEvents) {
  if (![sales, saleLines, returns, movements, costEvents].every(Array.isArray))
    throw new Error('Cash return stock and FIFO ledger snapshot is unavailable.');
  if (!returns.length) return {checkedReturns:0, checkedLines:0, checkedSales:0};
  const index = (items, label) => {
    const byId = new Map();
    for (const item of items) {
      if (!item || typeof item.id !== 'string' || !item.id || byId.has(item.id))
        throw new Error(`Cash return ${label} contains invalid or duplicate identities.`);
      byId.set(item.id, item);
    }
    return byId;
  };
  const saleById = index(sales, 'sale snapshot');
  const movementById = index(movements, 'stock snapshot');
  const costById = index(costEvents, 'FIFO snapshot');
  const linesBySale = new Map();
  for (const line of saleLines) {
    if (!line || typeof line.saleId !== 'string')
      throw new Error('Cash return has an invalid saved sale line.');
    const rows = linesBySale.get(line.saleId) ?? [];
    rows.push(line);
    linesBySale.set(line.saleId, rows);
  }
  const returnsBySale = new Map();
  const allMovements = new Set(), allCosts = new Set();
  for (const ret of returns) {
    if (!ret || typeof ret.originalSaleId !== 'string' || !Array.isArray(ret.lines))
      throw new Error('Cash return ledger has a malformed saved return.');
    const rows = returnsBySale.get(ret.originalSaleId) ?? [];
    rows.push(ret);
    returnsBySale.set(ret.originalSaleId, rows);
    for (const row of ret.lines) {
      if (!row || typeof row.movementId !== 'string' || !row.movementId ||
          typeof row.costEventId !== 'string' || !row.costEventId ||
          allMovements.has(row.movementId) || allCosts.has(row.costEventId))
        throw new Error('Cash return has a duplicated or absent stock/FIFO reference across sales.');
      allMovements.add(row.movementId);
      allCosts.add(row.costEventId);
    }
  }
  let checkedLines = 0;
  for (const [saleId, prior] of returnsBySale) {
    const sale = saleById.get(saleId);
    if (!sale) throw new Error('Cash return references an absent original sale.');
    const lines = linesBySale.get(saleId) ?? [];
    const selectedCosts = [];
    const selectedMovements = [];
    for (const line of lines) {
      if (line.costEventId) {
        const event = costById.get(line.costEventId);
        if (event) selectedCosts.push(event);
      }
    }
    for (const ret of prior) for (const row of ret.lines) {
      const event = costById.get(row.costEventId);
      const movement = movementById.get(row.movementId);
      if (event) selectedCosts.push(event);
      if (movement) selectedMovements.push(movement);
    }
    const result = assertCashReturnStockLinks(sale, lines, prior, selectedMovements, selectedCosts);
    checkedLines += result.checkedLines;
  }
  return {checkedReturns:returns.length, checkedLines, checkedSales:returnsBySale.size};
}
