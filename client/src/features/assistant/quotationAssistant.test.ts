import { describe, expect, it, vi } from 'vitest';
import { isQuotationRequest, respondToQuotationRequest } from './quotationAssistant';
import { listQuotations } from '@/features/customers/quotations';
import { getCustomerSnapshot } from '@/features/customers/customers';
vi.mock('@/features/customers/quotations', () => ({ listQuotations: vi.fn() }));
vi.mock('@/features/customers/customers', () => ({ getCustomerSnapshot: vi.fn() }));

describe('offline quotation assistant safety', () => {
  it('returns an actionable error for corrupt quotation totals instead of crashing or presenting money', async () => {
    vi.mocked(listQuotations).mockResolvedValue([{id:'bad',businessProfileId:'co',customerId:'a',status:'draft',currency:'GHS',totalMinor:2500,lines:[{productId:'p1',productName:'Rice',quantity:1,unitPriceMinor:2500,lineTotalMinor:1}],createdAt:'2026-01-01',updatedAt:'2026-01-01'}] as never);
    vi.mocked(getCustomerSnapshot).mockResolvedValue({customers:[],archivedCustomers:[]} as never);
    const reply = await respondToQuotationRequest('show quotations', {} as never, 'GHS');
    expect(reply.kind).toBe('error');
    expect(reply.text).toContain('inconsistent item totals');
    expect(reply.link?.href).toBe('/quotations');
    expect(reply.details).toBeUndefined();
  });
  it('recognizes quotation and estimate vocabulary without matching unrelated words', () => {
    expect(isQuotationRequest('show my quotations')).toBe(true);
    expect(isQuotationRequest('an estimate for Ama')).toBe(true);
    expect(isQuotationRequest('show proforma for Ama')).toBe(true);
    expect(isQuotationRequest('how much rice is left')).toBe(false);
  });
  it('routes writes to the quotation screen, without reading or writing the ledger', async () => {
    const reply = await respondToQuotationRequest('create a quotation for Ama', {} as never, 'GHS');
    expect(reply.kind).toBe('question');
    expect(reply.link?.href).toBe('/quotations');
    expect(listQuotations).not.toHaveBeenCalled();
  });
  it('reads quotations and identifies their customers, without mutation', async () => {
    vi.mocked(listQuotations).mockResolvedValue([{id:'q1',businessProfileId:'co',customerId:'a',status:'draft',currency:'GHS',totalMinor:2500,lines:[{productId:'p1',productName:'Rice',quantity:1,unitPriceMinor:2500,lineTotalMinor:2500}],createdAt:'2026-01-01',updatedAt:'2026-01-01'}] as never);
    vi.mocked(getCustomerSnapshot).mockResolvedValue({customers:[{id:'a',name:'Ama',status:'active'}],archivedCustomers:[]} as never);
    const reply = await respondToQuotationRequest('show quotations for Ama', {} as never, 'GHS');
    expect(reply.kind).toBe('answer');
    expect(reply.details?.[0].value).toContain('25.00 GHS');
  });
});
