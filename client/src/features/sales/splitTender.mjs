/** Stage 5: one immutable checkout can contain 2–3 separately evidenced
 * cash/card/MoMo tenders. These are RECORDS of payments staff observed;
 * no external authorization, card PAN or provider settlement is inferred.
 */
const valid=n=>Number.isSafeInteger(n)&&n>0;
const REF=/^[A-Za-z0-9][A-Za-z0-9 ._:/-]{2,119}$/;
const allowed=new Set(["cash","mobile","card"]);
const keys=(object,names)=>object&&typeof object==="object"&&!Array.isArray(object)&&Object.keys(object).every(k=>names.includes(k));
export function normalizeSplitTenders(tenders,paidMinor,totalMinor){
 if(!Array.isArray(tenders)||tenders.length<2||tenders.length>3)
   throw Error("Split checkout needs two or three distinct payment methods.");
 if(!Number.isSafeInteger(paidMinor)||paidMinor<=0||!Number.isSafeInteger(totalMinor)||totalMinor<paidMinor)
   throw Error("Split payment amount does not reconcile to the sale.");
 const methods=new Set(),result=[];let sum=0n;
 for(const tender of tenders){
  if(!keys(tender,["method","amountMinor","providerId","reference"])||
    !allowed.has(tender.method)||methods.has(tender.method)||!valid(tender.amountMinor))
    throw Error("Split tenders require distinct cash, card or MoMo payments with positive amounts.");
  methods.add(tender.method);
  const providerId=tender.providerId?.trim(),reference=tender.reference?.trim();
  if(tender.method==="cash"){
   if(providerId||reference)throw Error("Cash must not carry provider or card references.");
  }else if(tender.method==="mobile"){
   if(!providerId||providerId.length>80||!reference||!REF.test(reference))
     throw Error("Split MoMo requires an active provider and transaction reference.");
  }else{
   if(providerId||!reference||!REF.test(reference))
     throw Error("Split card payment requires a card terminal transaction reference, not a card number.");
   if(/^[0-9][0-9 -]{10,23}$/.test(reference)&&reference.replace(/[^0-9]/g,"").length>=12)
     throw Error("Never record a card number or PAN as a transaction reference.");
  }
  sum+=BigInt(tender.amountMinor);
  if(sum>BigInt(Number.MAX_SAFE_INTEGER))throw Error("Split payment exceeds supported currency precision.");
  result.push({method:tender.method,amountMinor:tender.amountMinor,
    ...(providerId?{providerId}:{}),...(reference?{reference}:{})});
 }
 if(sum!==BigInt(paidMinor))throw Error("Split payment lines must equal the exact amount recorded as paid.");
 return result;
}
export function assertSplitPaymentLedger(sale,payments) {
 if(sale.paymentMethod!=="split") {
  if(sale.splitTendersAtSale!==undefined)throw Error("Non-split sale carries split-payment evidence.");
  return true;
 }
 const canonical=normalizeSplitTenders(sale.splitTendersAtSale,sale.amountPaidMinor,sale.totalMinor);
 if(payments.length!==canonical.length)throw Error("Split receipt has missing or duplicate tender postings.");
 const expected=new Map(canonical.map(t=>[t.method,t]));
 const seen=new Set();
 for(const payment of payments){
  const row=expected.get(payment.method);
  if(!row||seen.has(payment.method)||payment.businessProfileId!==sale.businessProfileId||
    payment.saleId!==sale.id||payment.customerId!==sale.customerId||
    payment.amountMinor!==row.amountMinor)
    throw Error("Split tender postings do not reconcile with the original receipt.");
  seen.add(payment.method);
  if(payment.method==="mobile" &&
    (payment.mobileMoneyProviderId!==row.providerId||payment.mobileMoneyReference!==row.reference))
    throw Error("Split MoMo provider and reference do not match the saved receipt.");
  if(payment.method==="card"&&payment.cardReference!==row.reference)
    throw Error("Split card reference does not match the saved receipt.");
  if(payment.method==="cash"&&(payment.mobileMoneyProviderId||payment.mobileMoneyReference||payment.cardReference))
    throw Error("Cash tender contains external provider evidence.");
 }
 return true;
}
