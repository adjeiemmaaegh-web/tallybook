import {reconcilePrepaidLiability} from './prepaidLiabilityReconciliation.mjs';

/** Run 10: independent whole-ledger wallet cash/liability conservation.
 * External deposits/refunds are recorded cash movements, not independently
 * bank/provider-verified. Wallet spending and its reversal are NOT new cash.
 * No currency conversion, inferred historic cash or invented credit applied.
 */
const deny=x=>{throw Error('Prepaid cash conservation: '+x);};
const whole=x=>Number.isSafeInteger(x)&&x>=0;
const valid=x=>typeof x==='string'&&x.trim().length>0;
const plus=(a,b)=>{
 const next=a+BigInt(b);
 if(next>BigInt(Number.MAX_SAFE_INTEGER)||next< -BigInt(Number.MAX_SAFE_INTEGER))
  deny('monetary total exceeds safe integer precision');
 return next;
};
export function auditRun10PrepaidCashConservation(
 {transfers,benefits,sales,reversals},currency
){
 if(![transfers,benefits,sales,reversals].every(Array.isArray)||
    typeof currency!=='string'||!/^[A-Z]{3}$/.test(currency))
  deny('missing wallet, currency or sale evidence');
 // This is the authoritative full-history per-customer event replay.
 const verified=reconcilePrepaidLiability({transfers,benefits,sales,reversals},currency);
 let deposited=0n,refunded=0n,spent=0n,reversed=0n;
 const salesById=new Map(sales.map(s=>[s.id,s]));
 const seen=new Set();
 for(const transfer of transfers){
  if(!whole(transfer?.amountMinor)||!valid(transfer.id)||seen.has(transfer.id))
   deny('invalid, duplicated external cash record');
  seen.add(transfer.id);
  if(transfer.kind==='deposit')deposited=plus(deposited,transfer.amountMinor);
  else if(transfer.kind==='refund')refunded=plus(refunded,transfer.amountMinor);
  else deny('unsupported external prepaid cash kind');
 }
 for(const sale of sales){
  const value=sale.walletAppliedMinor??0;
  if(!whole(value))deny('invalid saved wallet expenditure');
  spent=plus(spent,value);
 }
 for(const reversal of reversals){
  const original=salesById.get(reversal.originalSaleId);
  if(!original)deny('orphaned wallet-sale reversal');
  reversed=plus(reversed,original.walletAppliedMinor??0);
 }
 const netCash=deposited-refunded;
 const netWalletSpending=spent-reversed;
 const impliedLiability=netCash-netWalletSpending;
 if(impliedLiability!==BigInt(verified.liabilityMinor))
  deny('external cash, wallet use and customer liability differ');
 if(netCash<0n||netWalletSpending<0n||impliedLiability<0n)
  deny('negative external prepaid funds or inconsistent net spending');
 return Object.freeze({
  currency,liabilityMinor:verified.liabilityMinor,
  customerCount:verified.customerCount,
  depositedMinor:Number(deposited),refundedMinor:Number(refunded),
  spentMinor:Number(spent),reversedWalletSpendMinor:Number(reversed),
  recordedNetExternalCashMinor:Number(netCash),
  netWalletConsumptionMinor:Number(netWalletSpending)
 });
}
