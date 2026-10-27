export const QA_SUPABASE_ORIGIN:string;
export const QA_RUN3_ENDPOINT:string;
export function resolveRun3Endpoint(config:{
 qaEndpoint?:string;supabaseUrl?:string;isPreview?:boolean;publishableKey?:string;
}):Readonly<{base:string;key:string|null}>;
