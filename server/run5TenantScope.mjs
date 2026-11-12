/** Run 5 cloud-only tenant payload guard.
 * Derived from the old Run 5 review code, but scoped to the current route.
 * Checks are defense in depth: authorization and RLS must still enforce ownership.
 * Pure, dependency-free and never enables an endpoint or DB operation.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TENANT_KEYS=new Set(['companyId','businessId','businessProfileId','organizationId','tenantId',
  'company_id','business_id','business_profile_id','organization_id','tenant_id']);
const UNSAFE_KEYS=new Set(['__proto__','prototype','constructor']);
const deny=()=>{throw Error('Cloud tenant payload scope denied');};

/** Reject foreign embedded tenant identifiers, exotic values, malicious accessors,
 * cycles and resource-exhausting payloads on both the request and response.
 * This cannot substitute for per-record transaction-bound RLS and membership.
 */
export function assertRun5ScopedJson(value,companyId){
  if(typeof companyId!=='string'||!UUID.test(companyId))deny();
  const seen=new WeakSet();
  let visited=0;
  function visit(node,depth){
    if(depth>24||++visited>2048)deny();
    if(node===null||typeof node==='string'||typeof node==='boolean')return;
    if(typeof node==='number'){
      if(!Number.isFinite(node))deny();
      return;
    }
    if(typeof node!=='object'||seen.has(node))deny();
    seen.add(node);
    try{
      if(Array.isArray(node)){
        if(node.length>1024)deny();
        for(const item of node)visit(item,depth+1);
        return;
      }
      const proto=Object.getPrototypeOf(node);
      if(proto!==Object.prototype&&proto!==null)deny();
      for(const key of Reflect.ownKeys(node)){
        const desc=Object.getOwnPropertyDescriptor(node,key);
        if(typeof key!=='string'||UNSAFE_KEYS.has(key)||!desc||!desc.enumerable||!Object.hasOwn(desc,'value'))deny();
        if(TENANT_KEYS.has(key)&&desc.value!==companyId)deny();
        visit(desc.value,depth+1);
      }
    }finally{seen.delete(node);}
  }
  visit(value,0);
  return value;
}
