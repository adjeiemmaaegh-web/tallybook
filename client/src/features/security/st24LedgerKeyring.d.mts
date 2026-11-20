/** ST24-05 source development only. A handle is ephemeral and cannot be serialized. */
export interface LedgerKeyringV1 {
  kind: 'tallybook-ledger-keyring';
  version: 1;
  workspaceId: string;
  companyId: string;
  iterations: 310000;
  passphrase: {salt: string; iv: string; ciphertext: string};
  recovery: {salt: string; iv: string; ciphertext: string};
}
export interface SealedLedgerRecordV1 {
  kind: 'tallybook-ledger-record';
  version: 1;
  workspaceId: string;
  companyId: string;
  table: string;
  primaryKey: string;
  iv: string;
  ciphertext: string;
}
export interface UnlockedLedgerHandle {readonly kind: 'unlocked-tallybook-ledger'}
export function createLedgerKeyring(args:{
  workspaceId:string;companyId:string;ownerPassphrase:string
}):Promise<{keyring:LedgerKeyringV1;recoveryCode:string;handle:UnlockedLedgerHandle}>;
export function unlockLedgerWithPassphrase(
  keyring:LedgerKeyringV1,passphrase:string
):Promise<UnlockedLedgerHandle>;
export function unlockLedgerWithRecoveryCode(
  keyring:LedgerKeyringV1,recoveryCode:string
):Promise<UnlockedLedgerHandle>;
export function changeLedgerPassphrase(
  keyring:LedgerKeyringV1,currentPassphrase:string,newPassphrase:string
):Promise<LedgerKeyringV1>;
export function resetLedgerPassphraseWithRecovery(
  keyring:LedgerKeyringV1,recoveryCode:string,newPassphrase:string
):Promise<LedgerKeyringV1>;
export function replaceLedgerRecoveryCode(
  keyring:LedgerKeyringV1,currentPassphrase:string
):Promise<{keyring:LedgerKeyringV1;recoveryCode:string}>;
export function lockLedgerHandle(handle:UnlockedLedgerHandle):void;
export function sealLedgerRecord(
  handle:UnlockedLedgerHandle,table:string,primaryKey:string,record:Record<string,unknown>
):Promise<SealedLedgerRecordV1>;
export function openLedgerRecord(
  handle:UnlockedLedgerHandle,table:string,primaryKey:string,envelope:SealedLedgerRecordV1
):Promise<unknown>;
