export type SyncClaims = {v:1;aud:'tallybook-sync';orgId:string;deviceId:string;scope:'sync:inspect'|'sync:stage'|'backup:write'|'sync:replicate:read'|'sync:replicate:write';iat:number;exp:number};
export function validateSyncClaims(claims: unknown, now?: number): Readonly<{orgId:string;deviceId:string;scope:'sync:inspect'|'sync:stage'|'backup:write'|'sync:replicate:read'|'sync:replicate:write'}>;
export function verifySyncCapability(header: string | undefined, secret: string, now?: number): Readonly<{orgId:string;deviceId:string;scope:'sync:inspect'|'sync:stage'|'backup:write'|'sync:replicate:read'|'sync:replicate:write'}>;
export function checkSyncRequestScope(claims: {orgId:string;deviceId:string}, organizationId: string | undefined, deviceId: string | undefined): void;
