export interface EncryptedBackupEnvelope {organizationId:string; deviceId:string; ciphertext:string; sha256:string}
export declare function validateEncryptedBackupEnvelope(envelope:EncryptedBackupEnvelope): Readonly<{organizationId:string;deviceId:string;bytes:Uint8Array}>;
export declare function createEncryptedBackupVault(root:string): Readonly<{
 store(envelope:EncryptedBackupEnvelope):Promise<Readonly<{backupId:string;sha256:string}>>;
 read(organizationId:string,backupId:string):Promise<Readonly<{backupId:string;organizationId:string;deviceId:string;sha256:string;ciphertext:string;createdAt:string}>>;
}>;
