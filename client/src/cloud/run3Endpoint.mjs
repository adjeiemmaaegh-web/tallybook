/** Opt-in QA routing. Production builds cannot accidentally send tokens to the QA project. */
export const QA_SUPABASE_ORIGIN='https://lmneuqxfyxplrxjswpma.supabase.co';
export const QA_RUN3_ENDPOINT=QA_SUPABASE_ORIGIN+'/functions/v1/tallybook-run3-qa';
const denied=()=>{throw Error('Run 3 private QA endpoint configuration denied.');};
export function resolveRun3Endpoint({qaEndpoint='',supabaseUrl='',isPreview=false,publishableKey=''}={}){
  if(!qaEndpoint)return Object.freeze({base:'/api/run3/membership',key:null});
  if(qaEndpoint!==QA_RUN3_ENDPOINT||supabaseUrl!==QA_SUPABASE_ORIGIN||
    isPreview!==true||typeof publishableKey!=='string'||!publishableKey.trim())
    denied();
  return Object.freeze({base:QA_RUN3_ENDPOINT,key:publishableKey});
}
