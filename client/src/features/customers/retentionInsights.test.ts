import { describe, expect, it } from 'vitest';
import { calculateCustomerRetention } from './retentionInsights';
const now = new Date('2026-10-09T12:00:00.000Z');
describe('local customer retention insights', () => {
  it('returns neutral values for a new customer', () => {
    expect(calculateCustomerRetention([],now)).toEqual({completedSales:0,recordedSalesMinor:0,recent90DaySales:0,prior90DaySales:0,trend:'insufficient-history'});
  });
  it('compares two equal 90-day windows', () => {
    const result=calculateCustomerRetention([{createdAt:'2026-10-08T12:00:00Z',totalMinor:1200},{createdAt:'2026-09-15T12:00:00Z',totalMinor:300},{createdAt:'2026-06-01T12:00:00Z',totalMinor:400}],now);
    expect(result).toMatchObject({completedSales:3,recordedSalesMinor:1900,recent90DaySales:2,prior90DaySales:1,trend:'increasing',daysSinceLastPurchase:1});
  });
  it('rejects future dated and invalid amounts', () => {
    expect(()=>calculateCustomerRetention([{createdAt:'2026-12-01',totalMinor:100}],now)).toThrow('reconciliation');
    expect(()=>calculateCustomerRetention([{createdAt:'2026-09-01',totalMinor:-1}],now)).toThrow('reconciliation');
  });
});
