/** Confirmation-gated, company-scoped offline quotation preparation.
 * No stock, payment, or sale is ever written by this module.
 */
import { nanoid } from 'nanoid';
import type { TallybookDB } from '@/db/TallybookDB';
import { getActiveBusinessProfileId } from '@/features/business/activeCompany';
import { getCustomerSnapshot } from '@/features/customers/customers';
import { getInventorySnapshot } from '@/features/inventory/inventory';
import { matchEntity } from './entityMatcher';
import { question, failure } from './replies';
import type { AssistantReply } from './types';
import { prepareQuotationHandoff } from '@/features/customers/quotationHandoff';
import { requirePermission } from '@/features/staff/staff';
import { formatMinorAmount } from '@/features/inventory/inventory';

type Line = { productId: string; productName: string; quantity: number; priceMinor: number };
type Draft = { companyId: string; customerId?: string; customerName?: string; lines: Line[]; token?: string; expiresAt: number };
const ttl = 15 * 60_000;
export function createQuotationDraftSession(database: TallybookDB, currency: string, clock: () => Date = () => new Date()) {
  let draft: Draft | null = null;
  const clear = () => { draft = null; };
  const active = () => {
    if (draft && (draft.companyId !== getActiveBusinessProfileId() || draft.expiresAt <= clock().getTime())) clear();
    return draft;
  };
  const prompt = (text: string): AssistantReply => question(text, [{type:'cancel',label:'Cancel quotation'}], {link:{label:'Open Quotations',href:'/quotations'}});
  async function update(text: string): Promise<AssistantReply> {
    const companyId = getActiveBusinessProfileId();
    await requirePermission('sell', database, companyId);
    const previous = active();
    if (!previous) draft = { companyId, lines: [], expiresAt: clock().getTime() + ttl };
    if (!draft) return failure('Quotation context expired. Please start again.');
    // Explicitly require a customer name; never borrow a customer from unrelated conversation memory.
    const customerName = /(?:\b(?:for|to)\s+)([a-z][\p{L}\p{M} '\-]{1,85}?)(?=\s+(?:with|including|containing)\b|[,.!?]|$)/iu.exec(text)?.[1]?.trim();
    if (customerName) {
      const customers = (await getCustomerSnapshot(database)).customers.filter(c => c.status === 'active' && !c.archivedAt);
      const found = matchEntity(customerName, customers);
      if (found.status !== 'one') return prompt(found.status === 'none' ? `I cannot find “${customerName}”. Enter an existing customer's exact name.` : `“${customerName}” is ambiguous. Enter the customer's full name.`);
      draft.customerId = found.match.id;
      draft.customerName = found.match.name;
      draft.token = undefined;
    }
    // Multi-item entry is deliberately one item per explicit line/turn; never drop second items silently.
    const itemMatch = /(?:\b(?:item|product|add|include|with)\s+)?(\d{1,6})\s+(?:x\s+)?([\p{L}\p{M}][\p{L}\p{M}0-9 '\-]{1,80})$/iu.exec(text.trim());
    if (itemMatch) {
      const quantity = Number(itemMatch[1]);
      if (!Number.isSafeInteger(quantity) || quantity < 1) return prompt('Enter a positive whole-number quantity.');
      const inventory = (await getInventorySnapshot(database)).products.filter(p => !p.archivedAt);
      const productName = itemMatch[2].trim();
      const matched = matchEntity(productName, inventory);
      if (matched.status !== 'one') return prompt(matched.status === 'none' ? `I cannot find product “${productName}”. Please enter an exact active product name.` : `Several products match “${productName}”. Please specify the full product name.`);
      if (draft.lines.some(line => line.productId === matched.match.id)) return prompt('That product is already on this quotation. Cancel and restart if you need to change its quantity.');
      if (draft.lines.length >= 100) return failure('A quotation supports at most 100 products.');
      draft.lines.push({productId:matched.match.id,productName:matched.match.name,quantity,priceMinor:matched.match.sellingPriceMinor});
      draft.token = undefined;
    }
    if (!draft.customerId) return prompt('Who is the quotation for? Reply “for Customer Full Name”.');
    if (!draft.lines.length) return prompt(`Quotation for ${draft.customerName}. Add a product by replying “2 Product Name”.`);
    if (/\b(?:add|another|more)\b/i.test(text) && !itemMatch) return prompt('Enter the next item as “2 Product Name”, or say “review quotation”.');
    const totalMinor = draft.lines.reduce((sum,line) => sum + line.priceMinor * line.quantity,0);
    if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) return failure('Quotation amount exceeds the safe money limit.');
    if (!draft.token) draft.token = nanoid(16);
    return {kind:'preview',text:`Quotation draft for ${draft.customerName}. Review the items and current prices. Confirming completes this read-only preparation. To save an actual quotation, open Quotations; stock and payments will not change.`,details:[...draft.lines.map(line=>({label:`${line.quantity} × ${line.productName}`,value:`${(line.quantity*line.priceMinor/100).toFixed(2)} ${currency}`})),{label:'Quoted total',value:`${(totalMinor/100).toFixed(2)} ${currency}`}],actions:[{type:'confirm',label:'Review quotation for entry',token:draft.token},{type:'cancel',label:'Cancel'}],link:{label:'Open Quotations',href:'/quotations'}};
  }
  async function confirm(token: string): Promise<AssistantReply> {
    const current = active();
    if (!current?.token || current.token !== token || !current.customerId || !current.lines.length) return failure('Quotation preview expired or changed. Review it again.');
    await requirePermission('sell', database, current.companyId);
    // Reject stale previews: the current catalogue is authoritative and any changed
    // price must be shown in a new review, never silently used on confirmation.
    const products = (await getInventorySnapshot(database)).products;
    for (const line of current.lines) {
      const product = products.find(p => p.id === line.productId && !p.archivedAt);
      if (!product || product.sellingPriceMinor !== line.priceMinor) {
        clear();
        return failure('A product or its selling price changed since the preview. Start a new quotation and review the current prices.');
      }
    }
    // Confirm the preparation only. The authoritative Quotations screen is the
    // exclusive write boundary; this session must never mutate a business record.
    const lines = current.lines.map(line => ({label:`${line.quantity} × ${line.productName}`,value:formatMinorAmount(line.quantity * line.priceMinor, currency)}));
    const handoff = prepareQuotationHandoff({ companyId: current.companyId, customerId: current.customerId, currency, lines: current.lines.map(({ productId, quantity, priceMinor }) => ({ productId, quantity, priceMinor })) });
    clear();
    return {kind:'info',text:`Quotation preparation reviewed for ${current.customerName}. No quotation has been saved. Open Quotations to review these items and save the real offer.`,details:lines,link:{label:'Open Quotations',href:`/quotations?draft=${handoff}`}};
  }
  return { update, confirm, clear, hasDraft:()=>Boolean(active()), token:()=>active()?.token??null };
}
