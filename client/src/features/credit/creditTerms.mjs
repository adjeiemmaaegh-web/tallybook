const DAY=86400000;
function utcDay(createdAt){
 if(typeof createdAt!=='string'||!/^\d{4}-\d\d-\d\dT/.test(createdAt)||!Number.isFinite(Date.parse(createdAt)))
  throw Error('Credit terms require a valid sale date.');
 return new Date(createdAt).toISOString().slice(0,10);
}
export function snapshotCreditTerms(createdAt,paymentDueDays){
 const issued=utcDay(createdAt);
 if(paymentDueDays===undefined)return {version:1,paymentDueDays:null,dueDateUtc:null};
 if(!Number.isSafeInteger(paymentDueDays)||paymentDueDays<0||paymentDueDays>3650)
  throw Error('Credit payment terms must be between zero and 3650 days.');
 const dueDateUtc=new Date(Date.parse(issued+'T00:00:00.000Z')+paymentDueDays*DAY).toISOString().slice(0,10);
 return {version:1,paymentDueDays,dueDateUtc};
}
export function validateCreditTerms(sale){
 const terms=sale.creditTermsAtSale;
 if(terms===undefined)return;
 if(!terms||terms.version!==1||!sale.customerId||!(sale.outstandingMinor>0))
  throw Error('Credit terms do not belong to an outstanding customer sale.');
 const expected=snapshotCreditTerms(sale.createdAt,terms.paymentDueDays===null?undefined:terms.paymentDueDays);
 if(terms.paymentDueDays!==expected.paymentDueDays||terms.dueDateUtc!==expected.dueDateUtc)
  throw Error('Saved credit due date differs from the original payment terms.');
}
