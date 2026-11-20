import type {LedgerKeyringV1,UnlockedLedgerHandle} from './st24LedgerKeyring.mjs';
export interface St24DisposableMoneySummary {
  tables:Record<string,number>;
  rows:number;
  minorTotals:Record<string,string>;
}
export function stageSt24PopulatedDisposableLedger(args:{
  sourceDbName:string;
  companyId:string;
  keyring:LedgerKeyringV1;
  handle:UnlockedLedgerHandle;
  ownerPassphrase:string;
  idb?:IDBFactory;
  locks?:LockManager|null;
}):Promise<Readonly<St24DisposableMoneySummary & {snapshotId:string;sourceSha256:string;sourceVersion:number;tables:number}>>;
export function restoreSt24ShadowToDisposableLedger(args:{
  snapshotId:string;targetDbName:string;companyId:string;handle:UnlockedLedgerHandle;
  expectedSourceSha256:string;idb?:IDBFactory;
}):Promise<Readonly<St24DisposableMoneySummary & {restoredDatabase:string;sha256:string;tables:number}>>;
export function compareSt24DisposableLedgers(args:{
  sourceDbName:string;restoredDbName:string;companyId:string;idb?:IDBFactory;
}):Promise<St24DisposableMoneySummary & {exact:true;sha256:string;tables:number}>;
