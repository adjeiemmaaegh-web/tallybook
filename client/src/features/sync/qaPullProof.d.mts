import type {QaSaleReadScope} from './qaSalePageBoundary.mjs';
export type QaPullChallenge={challengeId:string;nonce:string;expiresAtEpochMs:number};
export function validateQaPullChallenge(value:unknown,scope:QaSaleReadScope,now?:number):Readonly<QaPullChallenge>;
export function qaPullSigningBytes(scope:QaSaleReadScope,userId:string,challenge:QaPullChallenge):Uint8Array;
export function signQaPullChallenge(scope:QaSaleReadScope,userId:string,challenge:QaPullChallenge,
  privateKey:CryptoKey,subtle?:SubtleCrypto):Promise<string>;
