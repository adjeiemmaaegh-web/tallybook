/** Pure per-company/currency reporting reconciliation. No data fetching or ledger writes. */
export type ReportRecord={companyId:string;currency:string;kind:'sale'|'reversal'|'repayment'|'refund';amountMinor:number;id:string};
export type ReportGroup={companyId:string;currency:string;salesMinor:number;reversalsMinor:number;repaymentsMinor:number;refundsMinor:number};
export function summarizeFinancialEvents(rows:readonly ReportRecord[]):ReportGroup[]{const groups=new Map<string,ReportGroup>();const seen=new Set<string>();
 for(const r of rows){if(!r.companyId||!r.id||!/^[A-Z]{3}$/.test(r.currency)||!Number.isSafeInteger(r.amountMinor)||r.amountMinor<0)throw Error('Invalid reporting record');
  const id=JSON.stringify([r.companyId,r.id]);if(seen.has(id))throw Error('Duplicate reporting event');seen.add(id);
  const key=JSON.stringify([r.companyId,r.currency]);let g=groups.get(key);if(!g){g={companyId:r.companyId,currency:r.currency,salesMinor:0,reversalsMinor:0,repaymentsMinor:0,refundsMinor:0};groups.set(key,g);}
  const field=({sale:'salesMinor',reversal:'reversalsMinor',repayment:'repaymentsMinor',refund:'refundsMinor'} as const)[r.kind];if(!field)throw Error('Invalid reporting event type');
  const next=g[field]+r.amountMinor;if(!Number.isSafeInteger(next))throw Error('Reporting arithmetic overflow');g[field]=next;
 }return [...groups.values()].sort((a,b)=>a.companyId.localeCompare(b.companyId)||a.currency.localeCompare(b.currency));}
