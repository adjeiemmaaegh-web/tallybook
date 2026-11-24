import type {LedgerKeyringV1,UnlockedLedgerHandle} from './st24LedgerKeyring.mjs';
export const ST24_SHADOW_DB_NAME:string;
export function stageSt24ShadowSnapshot(args:{
 keyring:LedgerKeyringV1;
 handle:UnlockedLedgerHandle;
 ownerPassphrase:string;
 verifiedBackupJson:string;
 idb?:IDBFactory;
 locks?:LockManager|null;
}):Promise<Readonly<{snapshotId:string;state:'verified';bytes:number;chunks:number;note:string}>>;
export function readSt24ShadowSnapshot(args:{
 snapshotId:string;handle:UnlockedLedgerHandle;idb?:IDBFactory;
}):Promise<{state:'prepared'|'verified';text:string}>;
export function verifyPreparedSt24ShadowSnapshot(args:{
 snapshotId:string;handle:UnlockedLedgerHandle;expectedBackupJson:string;
 idb?:IDBFactory;locks?:LockManager|null;
}):Promise<{snapshotId:string;state:'verified'}>;
