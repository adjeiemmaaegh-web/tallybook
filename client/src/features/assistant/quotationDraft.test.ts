import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createQuotationDraftSession } from './quotationDraft';
import { getActiveBusinessProfileId } from '@/features/business/activeCompany';
import { getCustomerSnapshot } from '@/features/customers/customers';
import { getInventorySnapshot } from '@/features/inventory/inventory';
import { requirePermission } from '@/features/staff/staff';
import { readQuotationHandoff } from '@/features/customers/quotationHandoff';
vi.mock('@/features/business/activeCompany',()=>({getActiveBusinessProfileId:vi.fn(()=> 'shopA')}));
vi.mock('@/features/customers/customers',()=>({getCustomerSnapshot:vi.fn()}));
vi.mock('@/features/inventory/inventory',async importOriginal=>({...await importOriginal<typeof import('@/features/inventory/inventory')>(),getInventorySnapshot:vi.fn()}));
vi.mock('@/features/staff/staff',()=>({requirePermission:vi.fn()}));
const customer={id:'c1',businessProfileId:'shopA',name:'Ama Mensah',status:'active'};
const product={id:'p1',businessProfileId:'shopA',name:'Rice',sellingPriceMinor:3500,stockQuantity:4};
beforeEach(()=>{
 vi.resetAllMocks();
 vi.mocked(requirePermission).mockResolvedValue(null);
 vi.mocked(getActiveBusinessProfileId).mockReturnValue('shopA');
 vi.mocked(getCustomerSnapshot).mockResolvedValue({customers:[customer]} as never);
 vi.mocked(getInventorySnapshot).mockResolvedValue({products:[product]} as never);
});
describe('quotation preparation and financial safety',()=>{
 it('collects customer and items over turns, does not write even after preparation confirmation',async()=>{
  const session=createQuotationDraftSession({} as never,'GHS');
  expect((await session.update('prepare quote for Ama Mensah')).kind).toBe('question');
  const preview=await session.update('2 Rice');
  expect(preview.kind).toBe('preview');
  expect((await session.confirm('incorrect')).kind).toBe('error');
  const result=await session.confirm(session.token()!);
  expect(result.kind).toBe('info');
  expect(result.link?.href).toMatch(/^\/quotations\?draft=/);
  const token = new URL(result.link!.href, 'http://localhost').searchParams.get('draft')!;
  expect(readQuotationHandoff(token, 'shopA')).toMatchObject({ customerId: 'c1', lines: [{ productId: 'p1', quantity: 2, priceMinor: 3500 }] });
  expect(readQuotationHandoff(token, 'shopB')).toBeNull();
 });
 it('does not prepare a quotation after staff access is denied',async()=>{
  vi.mocked(requirePermission).mockRejectedValue(new Error('permission denied'));
  const session=createQuotationDraftSession({} as never,'GHS');
  await expect(session.update('quote for Ama Mensah')).rejects.toThrow('permission denied');
  expect(session.hasDraft()).toBe(false);
 });
 it('blocks price changes between preview and confirmation',async()=>{
  const session=createQuotationDraftSession({} as never,'GHS');
  await session.update('quote for Ama Mensah');await session.update('2 Rice');
  vi.mocked(getInventorySnapshot).mockResolvedValue({products:[{...product,sellingPriceMinor:4000}]} as never);
  expect((await session.confirm(session.token()!)).kind).toBe('error');
 });
 it('invalidates confirmations when changing business',async()=>{
  const session=createQuotationDraftSession({} as never,'GHS');
  await session.update('quote for Ama Mensah');await session.update('2 Rice');
  const token=session.token()!;vi.mocked(getActiveBusinessProfileId).mockReturnValue('shopB');
  expect((await session.confirm(token)).kind).toBe('error');
 });
});
