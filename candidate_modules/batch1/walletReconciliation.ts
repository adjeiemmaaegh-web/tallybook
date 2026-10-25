import {minor,type Finding} from './financialReconciliation.ts';
export type WalletPosting={id:string;businessProfileId:string;customerId:string;currency?:string;kind:'deposit'|'refund'|'spend'|'credit';amountMinor:number;createdAt:string;submissionKey:string};
/** Read-only review. Postings sharing the same *instant* are netted together, not ordered by ISO spelling. */
export function reviewWallet(postings:readonly WalletPosting[],company:string,customer:string):{balanceMinor:number|null;findings:Finding[]}{
 const f:Finding[]=[]; const keys=new Set<string>(), ids=new Set<string>();let currency:string|undefined;
 const rows: Array<{posting:WalletPosting;time:number}>=[];
 for(const p of postings.filter(p=>p.businessProfileId===company&&p.customerId===customer)){
  if(!p.id||ids.has(p.id))f.push({code:'WALLET_ID',entityId:p.id,message:'Missing or duplicate posting ID'});ids.add(p.id);
  if(!p.submissionKey||keys.has(p.submissionKey))f.push({code:'WALLET_DUPLICATE',entityId:p.id,message:'Missing or duplicate posting key'});keys.add(p.submissionKey);
  if(!minor(p.amountMinor)||!['deposit','refund','spend','credit'].includes(p.kind))f.push({code:'WALLET_POSTING',entityId:p.id,message:'Invalid wallet posting'});
  const time=Date.parse(p.createdAt);
  if(!Number.isFinite(time))f.push({code:'WALLET_DATE',entityId:p.id,message:'Invalid posting date'});
  if(p.currency!==undefined){
   if(!/^[A-Z]{3}$/.test(p.currency)||(currency!==undefined&&currency!==p.currency))f.push({code:'WALLET_CURRENCY',entityId:p.id,message:'Invalid or conflicting currency'});
   if(currency===undefined)currency=p.currency;
  }
  if(Number.isFinite(time)&&minor(p.amountMinor))rows.push({posting:p,time});
 }
 if(f.length)return {balanceMinor:null,findings:f};
 rows.sort((a,b)=>a.time-b.time||a.posting.id.localeCompare(b.posting.id));
 let balance=0, i=0;
 while(i<rows.length){const time=rows[i].time;let credit=0,debit=0,unsafe=false;
  while(i<rows.length&&rows[i].time===time){const p=rows[i++].posting;const inbound=p.kind==='deposit'||p.kind==='credit';
   if(inbound){if(!Number.isSafeInteger(credit+p.amountMinor))unsafe=true;else credit+=p.amountMinor;}
   else {if(!Number.isSafeInteger(debit+p.amountMinor))unsafe=true;else debit+=p.amountMinor;}
  }
  if(unsafe||!Number.isSafeInteger(balance+credit)||balance+credit<debit){f.push({code:'WALLET_OVERDRAW',entityId:customer,message:'Wallet overdraft or unsafe accumulation at posting instant'});break;}
  balance=balance+credit-debit;
 }
 return {balanceMinor:f.length?null:balance,findings:f};
}
