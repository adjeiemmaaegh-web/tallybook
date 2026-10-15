export const RUN8_VERIFIED_RECEIPT_KEY:'verifiedBackupReceiptV2';
export const RUN8_VERIFIED_RECEIPT_KIND:'tallybook-verified-local-file-v2';
export interface Run8VerifiedReceipt {
 readonly kind:'tallybook-verified-local-file-v2';
 readonly companyId:string;
 readonly createdAt:string;
 readonly verifiedAt:string;
 readonly sha256:string;
}
export function serializeRun8VerifiedReceipt(value:Run8VerifiedReceipt):string;
export function parseRun8VerifiedReceipt(value:string):Run8VerifiedReceipt;
