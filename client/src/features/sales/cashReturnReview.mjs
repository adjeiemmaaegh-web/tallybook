import { reconcileCashPartialReturns, MANUAL_REFUND_TENDERS } from './cashPartialReturn.mjs';
import { planPartialSaleReturn } from './partialReturnPlan.mjs';

/** Read-only, provisional return review. NEVER authorize, record or issue a refund here. */
export function prepareCashReturnReview({company, sale, saleLines, payments, receipts, priorReturns, fullReversals, products, costEvents, batches, stillOwedMinor}) {
  if (!company || !sale || sale.businessProfileId !== company) throw new Error('The sale does not belong to the active company.');
  if (![saleLines,payments,receipts,priorReturns,fullReversals,products,costEvents,batches].every(Array.isArray))
    throw new Error('Return review evidence is incomplete.');
  if (saleLines.some(row => row.saleId !== sale.id || row.businessProfileId !== company) ||
      payments.some(row => row.saleId !== sale.id || row.businessProfileId !== company) ||
      priorReturns.some(row => row.originalSaleId !== sale.id || row.businessProfileId !== company) ||
      fullReversals.some(row => row.originalSaleId !== sale.id || row.businessProfileId !== company))
    throw new Error('Return review contains records from a different sale or company.');
  if (receipts.length !== 1 || receipts[0].saleId !== sale.id || receipts[0].businessProfileId !== company ||
      receipts[0].receiptNumber !== sale.receiptNumber)
    throw new Error('Original receipt evidence must be reconciled first.');
  if (fullReversals.length) throw new Error('This sale has already been fully reversed.');
  // This also validates the exact saved tender, sequence, tax and earlier refunds.
  reconcileCashPartialReturns([sale],saleLines,payments,priorReturns,fullReversals);
  const hasCustomer = sale.customerId !== undefined;
  if (!['credit',...MANUAL_REFUND_TENDERS].includes(sale.paymentMethod) ||
      !Number.isSafeInteger(sale.totalMinor) || sale.totalMinor <= 0 ||
      sale.walletAppliedMinor || sale.loyaltyRedeemedMinor || sale.loyaltyRedeemedPoints ||
      !/^[A-Z]{3}$/.test(sale.currency ?? '') ||
      (hasCustomer
        ? sale.outstandingMinor <= 0 || !Number.isSafeInteger(stillOwedMinor) || stillOwedMinor < 0
        : (sale.paymentMethod === 'credit' || sale.outstandingMinor !== 0 || sale.amountPaidMinor !== sale.totalMinor)) ||
      (sale.amountPaidMinor === 0 ? payments.length !== 0
        : (payments.length !== 1 || payments[0].method !== sale.paymentMethod || payments[0].amountMinor !== sale.amountPaidMinor)))
    throw new Error('Only a single-tender cash, mobile-money or card sale, or a customer credit sale with a verified receivable, can use this narrow return review.');
  const previous = priorReturns.flatMap(item => item.lines.map(line=>({saleLineId:line.saleLineId,quantity:line.quantity})));
  const productsById=new Map(products.map(product=>[product.id,product]));
  const eventsById=new Map(costEvents.map(event=>[event.id,event]));
  const options=[];
  for (const line of saleLines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0 || !line.costEventId ||
        line.stockTracked === false || (line.batchAllocations?.length ?? 0) > 0)
      throw new Error('Sale contains service, batch or unverified original stock evidence.');
    const product=productsById.get(line.productId),event=eventsById.get(line.costEventId);
    if (!product || product.businessProfileId !== company || product.itemKind === 'service' ||
        !Number.isSafeInteger(product.stockQuantity) || product.stockQuantity < 0 ||
        batches.some(batch=>batch.productId===line.productId) ||
        !event || event.businessProfileId !== company || event.kind !== 'issue' || event.saleId !== sale.id ||
        event.saleLineId !== line.id || event.productId !== line.productId || event.quantityDelta !== -line.quantity)
      throw new Error('Original stock, batch or FIFO evidence needs reconciliation.');
    const returned=previous.filter(row=>row.saleLineId===line.id).reduce((sum,row)=>sum+BigInt(row.quantity),0n);
    const remaining=BigInt(line.quantity)-returned;
    if (remaining < 0n || remaining > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Prior return quantities cannot be reconciled.');
    options.push({saleLineId:line.id,productName:product.name,remainingQuantity:Number(remaining)});
  }
  if (!options.length) throw new Error('No supported original sale lines.');
  return {refundMethod:sale.paymentMethod, stillOwedMinor: hasCustomer ? stillOwedMinor : 0, sale, saleLines, prior:previous, options, currency:sale.currency, receiptNumber:sale.receiptNumber, priorReturnCount:priorReturns.length};
}

export function quoteReviewedCashReturn(review,saleLineId,quantity) {
  if (!review || !review.options.some(row=>row.saleLineId===saleLineId && Number.isSafeInteger(quantity) && quantity>0 && quantity<=row.remainingQuantity))
    throw new Error('Select an original sale line and valid remaining quantity.');
  const plan=planPartialSaleReturn(review.sale,review.saleLines,review.prior,[{saleLineId,quantity}]);
  if (review.sale.tax && !plan.taxPolicyVerified) throw new Error('Original tax configuration is not verified.');
  // Posting only accepts a positive minor-unit cash amount. A tiny quantity
  // may legitimately allocate zero after invoice-wide discount rounding;
  // never present that draft as a payable cash refund.
  if (!Number.isSafeInteger(plan.draftAmountMinor) || plan.draftAmountMinor <= 0)
    throw new Error('Selected quantity has no refundable cash amount at the saved invoice precision.');
  // Receivable credit comes first; only the remainder goes back through the original tender.
  const debtReducedMinor=Math.min(plan.draftAmountMinor,review.stillOwedMinor??0);
  const refundMinor=plan.draftAmountMinor-debtReducedMinor;
  if (refundMinor>0 && review.sale.paymentMethod==='credit')
    throw new Error('This quantity exceeds the unpaid balance of a credit sale; refunding the customer\'s repayments is not supported here.');
  return {amountMinor:plan.draftAmountMinor,debtReducedMinor,refundMinor,taxMinor:plan.draftTaxMinor,
    discountMinor:plan.draftDiscountMinor,taxableMinor:plan.draftTaxableMinor};
}
