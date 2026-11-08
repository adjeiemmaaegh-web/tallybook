/** Read-only manual tender vs provider/bank statement matching.
 * A matching reference and amount is ONLY a manual reconciliation hint,
 * not payment authorization, gateway settlement or ownership verification.
 */
const validMoney=n=>Number.isSafeInteger(n)&&n>0;
const normalize=s=>typeof s==="string"?s.trim().toUpperCase():"";
const allowed=new Set(["card","mobile"]);
function csvRows(input){
 if(typeof input!=="string"||input.length>1024*1024)throw Error("Statement file is missing or too large (1 MB maximum).");
 const rows=[],fields=[];let value="",quoted=false;
 for(let i=0;i<input.length;i++){
  const c=input[i];
  if(c==='"'){if(quoted&&input[i+1]==='"'){value+='"';i++;}else if(value.length===0||quoted)quoted=!quoted;else throw Error("Invalid statement CSV quotation.");}
  else if(!quoted&&c===","){fields.push(value);value="";}
  else if(!quoted&&(c==="\n"||c==="\r")){
   if(c==="\r"&&input[i+1]==="\n")i++;
   fields.push(value);value="";if(fields.some(x=>x.trim()))rows.push([...fields]);fields.length=0;
  }else value+=c;
 }
 if(quoted)throw Error("Unterminated quoted statement field.");
 fields.push(value);if(fields.some(x=>x.trim()))rows.push(fields);
 if(rows.length>2501)throw Error("Statement exceeds 2500 rows.");
 return rows;
}
export function parseManualTenderStatement(text){
 const rows=csvRows(text);
 if(!rows.length)throw Error("Statement CSV must include a header.");
 const headings=rows.shift().map(x=>normalize(x).replace(/[^A-Z]/g,""));
 if(new Set(headings).size!==headings.length)throw Error("Duplicate statement column.");
 const required=["METHOD","REFERENCE","AMOUNTMINOR"];
 if(required.some(k=>!headings.includes(k)))throw Error("CSV columns must include method, reference, amountMinor.");
 const extra=headings.filter(k=>!([...required,"PROVIDERID"].includes(k)));
 if(extra.length)throw Error("Unexpected statement columns: "+extra.join(", "));
 return rows.map((fields,index)=>{
  if(fields.length!==headings.length)throw Error("Statement row "+(index+2)+" has an invalid column count.");
  const entry=Object.fromEntries(headings.map((key,i)=>[key,fields[i].trim()]));
  const method=entry.METHOD.toLowerCase();
  if(!allowed.has(method))throw Error("Only manually recorded card or Mobile Money payments may be matched.");
  if(!/^[A-Z0-9._:/-]{3,120}$/i.test(entry.REFERENCE))throw Error("Statement reference is invalid.");
  if(!/^[1-9][0-9]{0,14}$/.test(entry.AMOUNTMINOR)||!validMoney(Number(entry.AMOUNTMINOR)))
    throw Error("Statement amountMinor must be a positive whole-number minor-unit amount.");
  return {method,reference:normalize(entry.REFERENCE),amountMinor:Number(entry.AMOUNTMINOR),providerId:entry.PROVIDERID||undefined};
 });
}
export function reconcileManualTenderStatement(payments,statement,companyId){
 if(!Array.isArray(payments)||!Array.isArray(statement)||typeof companyId!=="string"||!companyId)throw Error("Manual tender reconciliation requires a company-scoped ledger.");
 const key=(method,reference,providerId)=>JSON.stringify([method,normalize(reference),method==="mobile"?providerId??"": ""]);
 const saved=new Map(),found=new Set(),statementSeen=new Set();
 for(const payment of payments){
  if(payment.businessProfileId!==companyId)throw Error("Cross-company payment was supplied to reconciliation.");
  if(!allowed.has(payment.method))continue;
  if(!validMoney(payment.amountMinor))throw Error("Saved manual tender amount is invalid.");
  const reference=payment.method==="mobile"?payment.mobileMoneyReference:payment.cardReference;
  if(!reference)continue;
  const code=key(payment.method,reference,payment.mobileMoneyProviderId);
  if(saved.has(code))throw Error("Duplicate manual tender reference in saved ledger.");
  saved.set(code,payment);
 }
 const results=[];
 for(const row of statement){
  if(!allowed.has(row.method)||!validMoney(row.amountMinor)||!normalize(row.reference))throw Error("Invalid statement row.");
  const code=key(row.method,row.reference,row.providerId);
  if(statementSeen.has(code))throw Error("Duplicate reference in statement CSV.");
  statementSeen.add(code);
  const payment=saved.get(code);
  if(payment)found.add(code);
  results.push({method:row.method,reference:row.reference,amountMinor:row.amountMinor,
    status:!payment?"unmatched":payment.amountMinor===row.amountMinor?"matched":"amount-mismatch",
    paymentId:payment?.id});
 }
 return {matched:results.filter(row=>row.status==="matched").length,
  amountMismatches:results.filter(row=>row.status==="amount-mismatch").length,
  statementUnmatched:results.filter(row=>row.status==="unmatched").length,
  ledgerUnmatched:[...saved.keys()].filter(code=>!found.has(code)).length,
  rows:results, verifiedByGateway:false};
}
