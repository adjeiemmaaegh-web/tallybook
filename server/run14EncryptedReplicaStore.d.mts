export interface Run14EncryptedEnvelope {
 version:1; organizationId:string;deviceId:string;eventId:string;operationId:string;
 sequence:number;previousDigest:string;createdAt:string;
 ciphertext:string;nonce:string;salt:string;ciphertextSha256:string
}
export type Run14EncryptedReceipt = Readonly<{status:"stored"|"duplicate"|"conflict";
 reason:null|"same-event"|"event-id-reuse"|"operation-id-reuse";
 organizationId:string;eventId:string;ciphertextSha256:string;cursor:number;
 financialReplicationEnabled:false}>;
export interface Run14EncryptedPage {
 organizationId:string;after:number;nextCursor:number;hasMore:boolean;
 events:ReadonlyArray<Run14EncryptedEnvelope>;financialReplicationEnabled:false
}
export function validateRun14Envelope(e:unknown):Readonly<Run14EncryptedEnvelope>;
export function createRun14EncryptedReplicaStore(filename:string):Readonly<{
 append(e:Run14EncryptedEnvelope):Promise<Run14EncryptedReceipt>;
 page(company:string,after?:number,limit?:number):Promise<Readonly<Run14EncryptedPage>>;
}>;
