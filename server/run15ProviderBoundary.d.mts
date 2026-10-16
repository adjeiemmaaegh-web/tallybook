export const RUN15_REAL_GATEWAY_ENABLED:false;
export const RUN15_APPROVED_SANDBOX_PROVIDER:null;
export function requireRun15ApprovedProvider(configuration?:{
 environment?:string;providerId?:string;production?:boolean;liveKeysPresent?:boolean
}):true;
export function createRun15UnconfiguredProviderAdapter():Readonly<{
 mode:"disabled";
 createIntent(...args:unknown[]):never;
 inspectIntent(...args:unknown[]):never;
 verifyCallback(...args:unknown[]):never;
 refund(...args:unknown[]):never;
 inspectDispute(...args:unknown[]):never;
}>;
