export interface Run8BackupFileReceipt {
 readonly companyId:string;
 readonly createdAt:string;
 readonly format:'tallybook-encrypted-v2';
 readonly sha256:string;
}
export interface Run8VerifiedFile {
 readonly companyId:string;
 readonly createdAt:string;
 readonly sha256:string;
}
export function createRun8FileReceipt(text:string,companyId:string,
 createdAt:string,subtle?:Pick<SubtleCrypto,'digest'>):Promise<Run8BackupFileReceipt>;
export function verifyRun8FileReceipt(receipt:Run8BackupFileReceipt,
 selectedText:string,companyId:string,
 subtle?:Pick<SubtleCrypto,'digest'>):Promise<Run8VerifiedFile>;
