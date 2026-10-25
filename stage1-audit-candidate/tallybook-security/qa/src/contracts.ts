/** Contract-first QA: bind these to actual Tallybook services; no assumed Dexie schema. */
export type Id = string;
export type Money = { minor: bigint; currency: string };
export type Actor = { id: Id; companyId: Id; sessionId: Id };
export type Operation = 'sale'|'refund'|'inventory'|'backup'|'restore';
export type Snapshot = { companyId: Id; salesTotal: bigint; refundsTotal: bigint; inventory: Readonly<Record<string,number>>; recordIds: readonly Id[]; brokenReferences: readonly string[]; invalidFinancialValues: readonly string[] };
export type Decision = { allowed: boolean; reason?: string };
export interface QaAdapter {
  snapshot(companyId: Id): Promise<Snapshot>;
  authorize(actor: Actor, operation: Operation, companyId: Id): Promise<Decision>;
  sale(actor: Actor, lines: readonly { sku: Id; quantity: number; unitPriceMinor: bigint }[], requestId: Id): Promise<{ id: Id; totalMinor: bigint }>;
  refund(actor: Actor, saleId: Id, amountMinor: bigint, requestId: Id): Promise<{ id: Id; amountMinor: bigint }>;
  adjustInventory(actor: Actor, sku: Id, delta: number, requestId: Id): Promise<void>;
  exportBackup(actor: Actor): Promise<Uint8Array>;
  /** MUST be a sandbox/test database; never run against production data. */
  restoreBackup(actor: Actor, bytes: Uint8Array): Promise<void>;
  /** Isolated sandbox reset; NEVER attach to live data. */
  resetSandbox(): Promise<void>;
}
export interface QaFixture { adapter: QaAdapter; companyA: Id; companyB: Id; managerA: Actor; cashierA: Actor; outsiderB: Actor; sku: Id; }
/** Must create a fresh, isolated, seeded disposable sandbox for every scenario. */
export type FixtureFactory = () => Promise<QaFixture>;
export function assertSnapshotHealthy(s: Snapshot): string[] {
  const issues: string[] = [];
  if (s.salesTotal < 0n || s.refundsTotal < 0n || s.refundsTotal > s.salesTotal) issues.push('FINANCIAL_TOTALS');
  if (new Set(s.recordIds).size !== s.recordIds.length) issues.push('DUPLICATE_IDS');
  if (s.brokenReferences.length) issues.push('BROKEN_REFERENCES');
  if (s.invalidFinancialValues.length) issues.push('INVALID_FINANCIAL_VALUES');
  for (const [sku, qty] of Object.entries(s.inventory)) if (!Number.isSafeInteger(qty) || qty < 0) issues.push(`INVALID_STOCK:${sku}`);
  return issues;
}
export function saleTotal(lines: readonly {quantity:number;unitPriceMinor:bigint}[]): bigint {
  return lines.reduce((sum,l)=> { if (!Number.isSafeInteger(l.quantity)||l.quantity<=0||l.unitPriceMinor<0n) throw new Error('INVALID_LINE'); return sum+BigInt(l.quantity)*l.unitPriceMinor; },0n);
}
