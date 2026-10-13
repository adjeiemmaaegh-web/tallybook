/** Read-only offline quotation assistant. Never converts a quote or writes stock. */
import type { TallybookDB } from '@/db/TallybookDB';
import { listQuotations } from '@/features/customers/quotations';
import { getCustomerSnapshot } from '@/features/customers/customers';
import { matchEntity } from './entityMatcher';
import { answer, failure, question, say } from './replies';
import type { AssistantReply } from './types';

export function isQuotationRequest(text: string): boolean {
  return /\b(?:quote|quotes|quotation|quotations|estimate|estimates|proforma|pro-forma)\b/i.test(text);
}

export async function respondToQuotationRequest(text: string, database: TallybookDB, currency: string): Promise<AssistantReply> {
  if (/\b(?:create|make|prepare|draft|new|convert|accept|approve|decline|delete|send|issue|record)\b/i.test(text)) {
    return question('Quotations must be prepared or converted on the Quotations page so the customer, products, prices and final sale confirmation can be reviewed. I have not changed any records.', [say('Show my quotations', 'Show quotations')], { link: { label: 'Open Quotations', href: '/quotations' } });
  }
  const quotes = await listQuotations(database);
  const customers = (await getCustomerSnapshot(database)).customers;
  const customerPhrase = /\b(?:for|to|from)\s+(.+?)(?:\s+(?:this|last|today|yesterday)\b|[?.!]|$)/i.exec(text)?.[1]?.trim();
  let selected = quotes;
  if (customerPhrase) {
    const matches = matchEntity(customerPhrase, customers.filter(c => !c.archivedAt));
    if (matches.status === 'many' || matches.status === 'suggest') {
      return question(`I found several possible customers for “${customerPhrase}”. Please use the customer’s full name. No quotation was changed.`, [], { link: { label: 'Open Quotations', href: '/quotations' } });
    }
    if (matches.status === 'none') return question(`I could not identify a customer named “${customerPhrase}” in this business. Please check the name.`, [], { link: { label: 'Open Customers', href: '/customers' } });
    selected = quotes.filter(q => q.customerId === matches.match.id);
  }
  // Quotation evidence is only useful if the saved values reconcile to their lines.
  // An inconsistent quotation must never be presented as a trustworthy amount.
  for (const quote of selected) {
    if (!Number.isSafeInteger(quote.totalMinor) || quote.totalMinor < 0 || !quote.lines.length ||
        quote.lines.some(line => !Number.isSafeInteger(line.quantity) || line.quantity <= 0 || !Number.isSafeInteger(line.unitPriceMinor) || line.unitPriceMinor < 0 || line.unitPriceMinor * line.quantity !== line.lineTotalMinor) ||
        quote.lines.reduce((sum, line) => sum + line.lineTotalMinor, 0) !== quote.totalMinor) {
      return failure('A saved quotation has inconsistent item totals. Open Quotations and review its records before relying on the amount.', { link: { label: 'Open Quotations', href: '/quotations' } });
    }
  }
  const amounts = selected.slice(0, 5).map(q => {
    const customer = customers.find(c => c.id === q.customerId)?.name ?? 'Unknown customer';
    return { label: `${customer} · ${q.status} · ${q.id}`, value: `${(q.totalMinor / 100).toFixed(2)} ${q.currency || currency} · ${q.lines.length} items` };
  });
  return answer(selected.length ? `I found ${selected.length} saved quotation${selected.length === 1 ? '' : 's'}${customerPhrase ? ' for that customer' : ''}. Here are the latest ${amounts.length}. This is a read-only view; no stock or money has changed.` : 'No saved quotations matched. Nothing was changed.', { details: amounts, link: { label: 'Open Quotations', href: '/quotations' } });
}
