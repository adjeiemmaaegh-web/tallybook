/** Owner-supplied single-rate invoice tax, never a guessed country VAT rate.
 * A sale saved without the Run 12 configuration snapshot is legacy
 * UNVERIFIED (even when its original tax arithmetic is independently sound).
 * No tax return, multi-rate, exemption or payment to a tax authority.
 */
import {validateGhanaVatEvidence} from "../sales/ghanaVat.mjs";
const fail=message=>{throw Error('Run 12 tax evidence: '+message);};
const safe=v=>Number.isSafeInteger(v)&&v>=0;
const keys=(x,allowed)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).every(k=>allowed.includes(k));
const policyKeys=['enabled','registrationStatus','registrationNumber','label','rateBasisPoints','priceMode','scheme'];
const policyValid=p=>keys(p,policyKeys)&&
 Object.hasOwn(p,'enabled')&&typeof p.enabled==='boolean'&&
 ['unknown','not-registered','registered'].includes(p.registrationStatus)&&
 (p.registrationNumber===undefined||(typeof p.registrationNumber==='string'&&p.registrationNumber.length<=80))&&
 typeof p.label==='string'&&p.label.trim()===p.label&&p.label.length>0&&p.label.length<=40&&
 Number.isSafeInteger(p.rateBasisPoints)&&p.rateBasisPoints>=0&&p.rateBasisPoints<=10000&&
 ['inclusive','exclusive'].includes(p.priceMode)&&
 (p.scheme===undefined||p.scheme==='ghana-vat-2026')&&
 (p.scheme!=='ghana-vat-2026'||(p.rateBasisPoints===2000&&(!p.enabled||(typeof p.registrationNumber==='string'&&!!p.registrationNumber.trim()))))&&
 (!p.enabled||p.registrationStatus==='registered');
const equalPolicy=(a,b)=>!!a&&!!b&&policyValid(a)&&policyValid(b)&&
 policyKeys.every(k=>a[k]===b[k]);
export function snapshotSaleTaxConfiguration(configuredPolicy){
 if(configuredPolicy!==undefined&&!policyValid(configuredPolicy))
   fail('saved company tax configuration is malformed or is not registered');
 const policy=configuredPolicy?{...configuredPolicy}:undefined;
 return Object.freeze({mode:policy?.enabled?'on':'off',
  ...(policy?{policy}: {})});
}
export function validateRun12SaleTaxEvidence(sale){
 if(!sale||!safe(sale.subtotalMinor)||!safe(sale.discountMinor)||
    sale.discountMinor>sale.subtotalMinor||!safe(sale.totalMinor))
   fail('invalid original sale amount');
 const saved=sale.taxConfigurationAtSale;
 if(saved===undefined)return Object.freeze({verified:false,legacy:true,chargedTax:!!sale.tax});
 if(!keys(saved,['mode','policy'])||!['on','off'].includes(saved.mode)||
   (saved.policy!==undefined&&!policyValid(saved.policy)))
   fail('original sale tax configuration snapshot is malformed');
 const base=BigInt(sale.subtotalMinor-sale.discountMinor);
 if(saved.mode==='off'){
  if(saved.policy?.enabled===true||sale.tax!==undefined||
     BigInt(sale.totalMinor)!==base)
   fail('tax-off sale has unexpected tax or altered net invoice total');
  return Object.freeze({verified:true,legacy:false,chargedTax:false});
 }
 const p=saved.policy;
 if(!p||p.enabled!==true||p.registrationStatus!=='registered'||
    !sale.tax||!equalPolicy(p,sale.tax.policy))
  fail('tax-charged sale lacks matching registered invoice policy');
 if(p.scheme==='ghana-vat-2026'){
   try{validateGhanaVatEvidence(sale)}catch(error){fail(error instanceof Error?error.message:'Ghana tax evidence invalid');}
   return Object.freeze({verified:true,legacy:false,chargedTax:true});
 }
 const rate=BigInt(p.rateBasisPoints);
 const divisor=p.priceMode==='inclusive'?10000n+rate:10000n;
 const tax=(base*rate*2n+divisor)/(2n*divisor);
 const total=p.priceMode==='inclusive'?base:base+tax;
 if(total>BigInt(Number.MAX_SAFE_INTEGER)||!safe(sale.tax.taxMinor)||
    !safe(sale.tax.taxableMinor)||!safe(sale.tax.totalMinor)||
    BigInt(sale.tax.taxMinor)!==tax||
    BigInt(sale.tax.taxableMinor)!==total-tax||
    BigInt(sale.tax.totalMinor)!==total||
    BigInt(sale.totalMinor)!==total)
  fail('saved tax policy, exact discount and original receipt amounts do not reconcile');
 return Object.freeze({verified:true,legacy:false,chargedTax:true});
}
export function auditRun12SaleTaxHistory(sales){
 if(!Array.isArray(sales))fail('missing complete historical sale evidence');
 let configuredChargedSales=0,explicitNoTaxSales=0,legacyUnverifiedSales=0;
 const seen=new Set();
 for(const sale of sales){
  if(typeof sale?.id!=='string'||!sale.id||seen.has(sale.id))
   fail('duplicate or missing original sale identity');
  seen.add(sale.id);
  const record=validateRun12SaleTaxEvidence(sale);
  if(record.legacy)legacyUnverifiedSales++;
  else if(record.chargedTax)configuredChargedSales++;
  else explicitNoTaxSales++;
 }
 return Object.freeze({configuredChargedSales,explicitNoTaxSales,
  legacyUnverifiedSales,totalSales:sales.length,
  statutoryFilingVerified:false});
}
