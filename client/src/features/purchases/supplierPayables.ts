import { withCrossTabDataLock } from "@/features/backup/crossTabDataLock.mjs";
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";
import { nanoid } from 'nanoid';
import { db, type TallybookDB } from '@/db/TallybookDB';
import { getActiveBusinessProfileId } from '@/features/business/activeCompany';
import { activeStaffShift, requirePermission } from '@/features/staff/staff';
import { reconcileSupplierPayable } from './supplierPayables.mjs';
import {makeCentralSupplierEntryEvent} from '@/features/sync/centralOperationalEvent';

/** Offline manual attestations, not verified bank/provider settlements. */
export interface SupplierPayableEntry {
  id: string;
  businessProfileId: string;
  supplierId: string;
  purchaseId: string;
  currency: string;
  kind: 'recognition' | 'payment' | 'credit';
  amountMinor: number;
  method?: 'cash' | 'bank' | 'card' | 'mobile' | 'other';
  reference?: string;
  submissionKey: string;
  createdAt: string;
  staffId?: string;
  shiftId?: string;
}

function validKey(value: string) { if (!/^[\w-]{8,100}$/.test(value)) throw new Error('Invalid supplier entry submission key.'); }
function validAmount(value: number) { if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Enter a positive supplier amount in minor units.'); }
const validCurrency = (value: unknown): value is string => typeof value === 'string' && /^[A-Z]{3}$/.test(value);

/** Only call once the owner confirms that the whole original purchase invoice is still unpaid.
 * Existing legacy receipts lacking a currency snapshot cannot be classified automatically. */
export async function recognizeUnpaidPurchase(purchaseId: string, submissionKey: string, database: TallybookDB = db) {
  // Acquire the cross-tab shared lock before opening the IndexedDB write transaction.
  return withCrossTabDataLock("shared", () => recognizeUnpaidPurchaseWhileLocked(purchaseId, submissionKey, database));
}

async function recognizeUnpaidPurchaseWhileLocked(purchaseId: string, submissionKey: string, database: TallybookDB = db) {
  validKey(submissionKey);
  const company = getActiveBusinessProfileId();
  return database.transaction('rw', [database.appMeta, database.businessProfiles, database.suppliers, database.purchases, database.supplierPayableEntries, database.centralOperationalEvents, database.staffMembers, database.staffShifts, database.staffAudits], async () => {
    await assertRun7RetailWriteReady(database.appMeta);
    const staff = await requirePermission('staff', database, company);
    const shift = await activeStaffShift(staff, database);
    const purchase = await database.purchases.get(purchaseId);
    if(getActiveBusinessProfileId()!==company)throw new Error('Company switched before recognizing supplier debt.');
    if (!purchase || purchase.businessProfileId !== company || !validCurrency(purchase.currency)) throw new Error('Purchase is missing, foreign or has no verified currency snapshot; reconcile it before recognizing debt.');
    validAmount(purchase.totalCostMinor);
    const supplier=await database.suppliers.get(purchase.supplierId);
    if(!supplier||supplier.businessProfileId!==company)
      throw new Error('Original supplier ownership requires reconciliation before recognizing debt.');
    const entries = await database.supplierPayableEntries.where('purchaseId').equals(purchaseId).toArray();
    const existingKey = await database.supplierPayableEntries.where('[businessProfileId+submissionKey]').equals([company, submissionKey]).first();
    if (existingKey) {
      reconcileSupplierPayable(purchase, entries);
      if (existingKey.purchaseId === purchaseId && existingKey.supplierId === purchase.supplierId && existingKey.currency === purchase.currency && existingKey.amountMinor === purchase.totalCostMinor && existingKey.kind === 'recognition') return existingKey;
      throw new Error('Supplier submission key was reused for another operation.');
    }
    if (entries.length) throw new Error('Supplier liability was already recognized or needs reconciliation.');
    const createdAt = new Date().toISOString();
    if(!Number.isFinite(Date.parse(purchase.createdAt))||Date.parse(createdAt)<Date.parse(purchase.createdAt))
      throw new Error('Supplier recognition cannot predate the purchase receipt.');
    if(getActiveBusinessProfileId()!==company)throw new Error('Company changed during supplier recognition.');
    const result: SupplierPayableEntry = { id: nanoid(18), businessProfileId: company, supplierId: purchase.supplierId, purchaseId, currency: purchase.currency, kind: 'recognition', amountMinor: purchase.totalCostMinor, submissionKey, createdAt, ...(staff ? { staffId: staff.id } : {}), ...(shift ? { shiftId: shift.id } : {}) };
    // Reconcile the PROPOSED recognition inside its write transaction.
    reconcileSupplierPayable(purchase,[...entries,result]);
    await database.supplierPayableEntries.add(result);
    await database.centralOperationalEvents.add(makeCentralSupplierEntryEvent(result,purchase));
    if (staff) await database.staffAudits.add({ id: nanoid(14), businessProfileId: company, staffId: staff.id, action: 'supplier.liability.recognized', createdAt, details: purchaseId });
    if(getActiveBusinessProfileId()!==company)
      throw new Error('Company switched before supplier recognition committed.');
    return result;
  });
}

export interface RecordSupplierSettlementInput {
  purchaseId: string;
  kind: 'payment' | 'credit';
  amountMinor: number;
  method?: SupplierPayableEntry['method'];
  reference?: string;
  submissionKey: string;
}

/** Recognized liability, a manual supplier payment, and a supplier credit are separate events. */
export async function recordSupplierSettlement(input: RecordSupplierSettlementInput, database: TallybookDB = db) {
  // Acquire the cross-tab shared lock before opening the IndexedDB write transaction.
  return withCrossTabDataLock("shared", () => recordSupplierSettlementWhileLocked(input, database));
}

async function recordSupplierSettlementWhileLocked(input: RecordSupplierSettlementInput, database: TallybookDB = db) {
  validKey(input.submissionKey); validAmount(input.amountMinor);
  if (input.kind !== 'payment' && input.kind !== 'credit') throw new Error('Choose a payment or supplier credit.');
  if (input.kind === 'payment' && !['cash','bank','card','mobile','other'].includes(input.method ?? '')) throw new Error('Choose a recorded payment method.');
  if (input.kind === 'credit' && input.method !== undefined) throw new Error('A supplier credit is not a cash payment.');
  if (input.reference !== undefined && (typeof input.reference !== 'string' || input.reference.length > 120)) throw new Error('Supplier reference is too long.');
  const company = getActiveBusinessProfileId();
  return database.transaction('rw', [database.appMeta, database.businessProfiles, database.suppliers, database.purchases, database.supplierPayableEntries, database.centralOperationalEvents, database.staffMembers, database.staffShifts, database.staffAudits], async () => {
    await assertRun7RetailWriteReady(database.appMeta);
    const staff = await requirePermission('staff', database, company);
    const shift = await activeStaffShift(staff, database);
    const purchase = await database.purchases.get(input.purchaseId);
    if(getActiveBusinessProfileId()!==company)throw new Error('Company switched before supplier settlement.');
    if (!purchase || purchase.businessProfileId !== company || !validCurrency(purchase.currency)) throw new Error('Purchase currency and ownership need reconciliation.');
    const supplier=await database.suppliers.get(purchase.supplierId);
    if(!supplier||supplier.businessProfileId!==company)
      throw new Error('Original supplier ownership requires reconciliation before settlement.');
    const rows = await database.supplierPayableEntries.where('purchaseId').equals(purchase.id).toArray();
    if (rows.some(row => row.currency !== purchase.currency)) throw new Error('Supplier currency snapshot mismatch.');
    const balance = reconcileSupplierPayable(purchase, rows);
    const priorKey = await database.supplierPayableEntries.where('[businessProfileId+submissionKey]').equals([company, input.submissionKey]).first();
    if (priorKey) {
      if (priorKey.purchaseId === input.purchaseId && priorKey.supplierId === purchase.supplierId && priorKey.currency === purchase.currency && priorKey.kind === input.kind && priorKey.amountMinor === input.amountMinor && priorKey.method === input.method && (priorKey.reference ?? '') === (input.reference?.trim() ?? '')) return priorKey;
      throw new Error('Supplier submission key was reused for different details.');
    }
    if (balance.outstandingMinor === null) throw new Error('Confirm an unpaid supplier liability before recording a settlement.');
    if (input.amountMinor > balance.outstandingMinor) throw new Error('Supplier settlement exceeds the remaining liability.');
    const createdAt = new Date().toISOString();
    if(!Number.isFinite(Date.parse(purchase.createdAt))||Date.parse(createdAt)<Date.parse(purchase.createdAt))
      throw new Error('Supplier settlement cannot predate its original purchase.');
    if(getActiveBusinessProfileId()!==company)throw new Error('Company changed during supplier settlement authorization.');
    const entry: SupplierPayableEntry = { id: nanoid(18), businessProfileId: company, supplierId: purchase.supplierId, purchaseId: purchase.id, currency: purchase.currency, kind: input.kind, amountMinor: input.amountMinor, ...(input.method ? {method:input.method} : {}), ...(input.reference?.trim() ? {reference:input.reference.trim()} : {}), submissionKey: input.submissionKey, createdAt, ...(staff ? { staffId: staff.id } : {}), ...(shift ? { shiftId: shift.id } : {}) };
    // Never depend only on a pre-insertion balance: verify the proposed
    // exact-currency payment/credit and remaining liability in this transaction.
    reconcileSupplierPayable(purchase,[...rows,entry]);
    if(getActiveBusinessProfileId()!==company)throw new Error('Company switched before committing supplier settlement.');
    await database.supplierPayableEntries.add(entry);
    await database.centralOperationalEvents.add(makeCentralSupplierEntryEvent(entry,purchase));
    if (staff) await database.staffAudits.add({ id: nanoid(14), businessProfileId: company, staffId: staff.id, action: input.kind === 'payment' ? 'supplier.payment.recorded' : 'supplier.credit.recorded', createdAt, details: purchase.id });
    if(getActiveBusinessProfileId()!==company)
      throw new Error('Company switched before supplier settlement committed.');
    return entry;
  });
}

export async function getSupplierPayables(database: TallybookDB = db) {
  const company = getActiveBusinessProfileId();
  return database.transaction('r', [database.suppliers, database.purchases, database.supplierPayableEntries, database.staffMembers], async () => {
    await requirePermission('reports',database,company);
    const purchases = await database.purchases.where('businessProfileId').equals(company).toArray();
    const entries = await database.supplierPayableEntries.where('businessProfileId').equals(company).toArray();
    const purchasesById=new Map(purchases.map(row=>[row.id,row]));
    for (const entry of entries) {
      const purchase = purchasesById.get(entry.purchaseId);
      if (!purchase || !validCurrency(purchase.currency) || entry.currency !== purchase.currency) throw new Error('Supplier ledger has orphaned or wrong-currency entries.');
    }
    const supplierIds=new Set((await database.suppliers.where('businessProfileId').equals(company).toArray()).map(x=>x.id));
    if(purchases.some(x=>!supplierIds.has(x.supplierId)))throw new Error('Supplier purchase has a missing or foreign supplier identity.');
    if(getActiveBusinessProfileId()!==company)throw new Error('Company switched during supplier balance review.');
    const balanced=reconcileSupplierPayables(purchases, entries);
    await requirePermission('reports',database,company);
    return balanced;
  });
}

import { reconcileSupplierPayables } from './supplierPayables.mjs';
