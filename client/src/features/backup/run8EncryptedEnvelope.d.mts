export const RUN8_ENCRYPTED_V1: 'tallybook-encrypted-v1';
export const RUN8_ENCRYPTED_V2: 'tallybook-encrypted-v2';
export const RUN8_KDF_ITERATIONS: 310000;
export const RUN8_AAD: string;
export function classifyRun8BackupEnvelope(text:string):
  'plaintext'|'tallybook-encrypted-v1'|'tallybook-encrypted-v2';
export function assertRun8EncryptedEnvelope(envelope:unknown,
 maxCipherChars:number,maxJsonBytes:number):'v1'|'v2';
