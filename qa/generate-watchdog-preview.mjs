/** Reproducible, synthetic Tallybook export for a future Watchdog importer test. */
import { writeFileSync } from 'node:fs';
import { mapSingleStoreWatchdogEvents, serializeSingleStoreWatchdogCsv } from '../client/src/features/integrations/watchdogEventMapper.ts';
import { createWatchdogDayEnvelope } from '../client/src/features/integrations/watchdogDayEnvelope.ts';
import { serializeWatchdogCanonicalCsv } from '../client/src/features/integrations/watchdogCanonicalCsv.ts';

const source = {
  companyId: 'fixture-business', storeId: 'fixture-shop', dayUtc: '2026-10-24',
  sales: [{ id: 'fixture-sale', businessProfileId: 'fixture-business',
    staffId: 'fixture-staff', shiftId: 'fixture-shift', createdAt: '2026-10-24T12:00:00Z',
    currency: 'GHS', totalMinor: 2000, amountPaidMinor: 2000, outstandingMinor: 0,
    discountMinor: 100, paymentMethod: 'mobile', receiptNumber: 'FIXTURE-001' }],
  payments: [{ id: 'fixture-payment', saleId: 'fixture-sale', businessProfileId: 'fixture-business',
    method: 'mobile', amountMinor: 2000, mobileMoneyProviderName: 'Fixture Provider',
    mobileMoneyReference: 'FIXTURE-REF-1' }],
  shifts: [{ id: 'fixture-shift', businessProfileId: 'fixture-business', staffId: 'fixture-staff',
    openedAt: '2026-10-24T08:00:00Z', closedAt: '2026-10-24T18:00:00Z',
    openingFloatMinor: 200, countedCashMinor: 100, varianceMinor: -100 }],
  reversals: [],
  noSaleEvents: [{ id: 'fixture-drawer', businessProfileId: 'fixture-business',
    storeId: 'fixture-shop', deviceId: 'local-claim-only', staffId: 'fixture-staff',
    shiftId: 'fixture-shift', operationKey: 'fixture-drawer-key',
    createdAt: '2026-10-24T15:00:00Z', reason: 'cash_check' }],
};
const events = mapSingleStoreWatchdogEvents(source);
const envelope = createWatchdogDayEnvelope({ ...source, events }, '2026-10-24T20:00:00Z');
writeFileSync(new URL('./fixtures/tallybook-watchdog-preview-v1.json', import.meta.url),
  JSON.stringify(envelope, null, 2) + '\n');
writeFileSync(new URL('./fixtures/tallybook-watchdog-legacy.csv', import.meta.url),
  serializeSingleStoreWatchdogCsv(source));
writeFileSync(new URL('./fixtures/tallybook-watchdog-canonical-pos-v1.csv', import.meta.url),
  serializeWatchdogCanonicalCsv(envelope).csv);
