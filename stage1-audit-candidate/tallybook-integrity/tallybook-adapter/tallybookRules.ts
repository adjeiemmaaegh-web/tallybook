import type { Options, DatabaseLike, Report } from '../src/integrity';
import { assessIntegrity } from '../src/integrity';

/** Read-only, explicitly incomplete Stage-1 cross-table checks. No app writes. */
export const tallybookStage1Rules: Options = {
  tables: [
    {name:'businessProfiles',key:'id'},
    {name:'customers',key:'id',references:[{path:'businessProfileId',targetTable:'businessProfiles',targetPath:'id'}]},
    {name:'products',key:'id',references:[{path:'businessProfileId',targetTable:'businessProfiles',targetPath:'id'}]},
    {name:'sales',key:'id',references:[{path:'businessProfileId',targetTable:'businessProfiles',targetPath:'id'},{path:'customerId',targetTable:'customers',targetPath:'id',optional:true}],financial:[{path:'totalMinor',integer:true},{path:'amountPaidMinor',integer:true},{path:'outstandingMinor',integer:true}],validate: (sale) => {
      const total = sale.totalMinor;
      const paid = sale.amountPaidMinor;
      const due = sale.outstandingMinor;
      if (![total, paid, due].every(value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0))
        return 'Sale monetary fields must be nonnegative safe integers';
      if (!Number.isSafeInteger(paid + due) || paid + due !== total)
        return 'Sale payment plus outstanding debt must equal original total';
      return undefined;
    }},
    {name:'saleLines',key:'id',references:[{path:'saleId',targetTable:'sales',targetPath:'id'},{path:'productId',targetTable:'products',targetPath:'id'}],financial:[{path:'unitPriceMinor',integer:true},{path:'lineTotalMinor',integer:true}]},
    {name:'payments',key:'id',references:[{path:'saleId',targetTable:'sales',targetPath:'id'}],financial:[{path:'amountMinor',integer:true}]},
    {name:'receipts',key:'id',references:[{path:'saleId',targetTable:'sales',targetPath:'id'}]},
    {name:'saleReversals',key:'id',references:[{path:'originalSaleId',targetTable:'sales',targetPath:'id'}],financial:[{path:'reversedSaleTotalMinor',allowNegative:true,integer:true},{path:'reversedReceivedMinor',allowNegative:true,integer:true},{path:'reversedOutstandingMinor',allowNegative:true,integer:true}]},
    {name:'cashPartialReturns',key:'id',references:[{path:'originalSaleId',targetTable:'sales',targetPath:'id'}],financial:[{path:'refundedMinor',integer:true}]},
    {name:'repayments',key:'id',references:[{path:'customerId',targetTable:'customers',targetPath:'id'}]},
    {name:'walletTransfers',key:'id',references:[{path:'customerId',targetTable:'customers',targetPath:'id'}],financial:[{path:'amountMinor',integer:true}]},
    {name:'staffMembers',key:'id',references:[{path:'businessProfileId',targetTable:'businessProfiles',targetPath:'id'}]},
    {name:'staffShifts',key:'id',references:[{path:'staffId',targetTable:'staffMembers',targetPath:'id'}]},
  ],
};
/** Run only from trusted diagnostics against a quiescent or snapshotted database. */
export const auditTallybookStage1 = (db: DatabaseLike): Promise<Report> => assessIntegrity(db, tallybookStage1Rules);

/** A trusted caller must request an explicit audit; no startup/background reads. */
export async function auditTallybookStage1Consistent(db: DatabaseLike): Promise<Report> {
  if (typeof db.transaction !== 'function') throw new Error('Dexie read transaction required for a consistent Stage 1 audit');
  // Every read is made in one Dexie readonly transaction, preventing a mixed-time scan.
  const tables = tallybookStage1Rules.tables.map(rule => db.table(rule.name));
  return db.transaction('r', ...tables, () => assessIntegrity(db, tallybookStage1Rules)) as Promise<Report>;
}
