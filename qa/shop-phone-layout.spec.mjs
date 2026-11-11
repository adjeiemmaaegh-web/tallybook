// The shared shop on a phone. Only the Supabase network is mocked (see the config); the real app runs
// in a real browser. For every tab it checks that nothing makes the page scroll sideways, that nothing
// sticks out past the screen, and that fields are large enough not to trigger iOS zoom.
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SB = 'http://127.0.0.1:54321';
// The membership code only accepts real UUIDs for identities.
const OWNER = '11111111-1111-4111-8111-111111111111', ATT = '22222222-2222-4222-8222-222222222222', ATT2 = '33333333-3333-4333-8333-333333333333', BIZ = '44444444-4444-4444-8444-444444444444';
const SHOTS = process.env.SHOP_SHOTS_DIR || '';
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (sub, email) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, email, aud: 'authenticated', role: 'authenticated', session_id: 'session-1', exp: 4102444800 })}.sig`;
const person = (role) => role === 'owner'
  ? { id: OWNER, email: 'kwaku.mensah.owner@provisions-example.test' }
  : { id: ATT, email: 'ama.serwaa.attendant@provisions-example.test' };

const money = n => n;
const LONG = 'Extra long product name for layout testing 500g family pack';
const products = [
  ['eggs', 'Crate of eggs', 4500, 12], ['milo', 'Milo 400g tin', 3000, 3], ['rice', 'Rice 5kg bag', 9000, 0],
  ['long', LONG, 12550, 40], ['cut', 'Haircut', 5000, null], ['oil', 'Cooking oil 1 litre', 2200, 2],
  ['sugar', 'Sugar 1kg', 1800, 25], ['soap', 'Bar soap', 500, 100],
];
const overview = role => ({
  companyId: BIZ, role, currency: 'GHS',
  stores: [{ id: 'st-a', name: 'Madina main branch', status: 'active' }, { id: 'st-b', name: 'Tema community 7 kiosk', status: 'active' }],
  products: products.map(([id, name, price]) => ({ id, name, unitPriceMinor: price, active: true })),
  stock: products.filter(p => p[3] !== null).flatMap(([id, , , q]) => [{ storeId: 'st-a', productId: id, quantity: q }, { storeId: 'st-b', productId: id, quantity: Math.floor(q / 2) }]),
  members: [{ userId: OWNER, role: 'owner', email: person('owner').email, storeIds: [] },
    { userId: ATT, role: 'attendant', email: person('attendant').email, storeIds: ['st-a'] },
    { userId: ATT2, role: 'attendant', email: 'a-very-long-attendant-email-address-for-wrapping@some-long-domain-example.test', storeIds: ['st-b'] }],
  pendingInvites: role === 'owner' ? [{ invitationId: 'inv-1', email: 'new.hire@example.test', expiresAt: '2026-11-11T10:00:00Z' }] : [],
  myPermissions: role === 'owner' ? { canDiscount: true, maxDiscountBps: 10000, canCredit: true } : { canDiscount: true, maxDiscountBps: 1000, canCredit: true },
  memberPermissions: { [ATT]: { canDiscount: true, maxDiscountBps: 1000, canCredit: true }, [ATT2]: { canDiscount: false, maxDiscountBps: 0, canCredit: false } },
  customers: [{ id: 'c1', name: 'Ama Mensah-Boateng of the Kumasi Road Traders', phone: '0240000001', creditLimitMinor: 100000, balanceMinor: 45000 },
    { id: 'c2', name: 'Kofi', phone: null, creditLimitMinor: 20000, balanceMinor: 0 }],
});
const catalog = role => products.map(([id, name, price, q], i) => ({
  productId: id, name, unitPriceMinor: price, active: true, barcode: i % 2 ? null : `60012345${String(i).padStart(5, '0')}`,
  category: ['Dairy', 'Drinks', 'Grains', 'Groceries', 'Salon', 'Cooking', 'Groceries', 'Household'][i], kind: id === 'cut' ? 'service' : 'good',
  trackStock: id !== 'cut', lowStockThreshold: id === 'cut' ? null : 5, ...(role === 'owner' ? { costMinor: Math.round(price * 0.7) } : {}),
}));
const receipt = n => ({
  saleId: `sale-${n}`, companyId: BIZ, storeId: 'st-a', storeName: 'Madina main branch', cashierId: n % 2 ? OWNER : ATT, submissionKey: `k${n}`.padEnd(20, 'x'),
  receiptNumber: n, currency: 'GHS', totalMinor: 9000 + n * 100, recordedAt: new Date(Date.now() - n * 3600_000).toISOString(), replayed: false,
  customer: n === 2 ? { id: 'c1', name: 'Ama Mensah-Boateng of the Kumasi Road Traders', phone: '0240000001', creditLimitMinor: 100000, balanceMinor: 45000 } : null,
  payment: { method: 'split', amountDueMinor: 9000 + n * 100, amountTenderedMinor: 9000 + n * 100, changeMinor: 0, reference: null },
  tenders: [{ method: 'cash', amountMinor: 4000, tenderedMinor: 4000, reference: null }, { method: 'mobile', amountMinor: 5000 + n * 100, tenderedMinor: 5000 + n * 100, reference: 'MP123456789' }],
  lines: [{ lineNo: 1, productId: 'long', name: LONG, quantity: 2, unitPriceMinor: 4500, lineTotalMinor: 9000, refundedQuantity: 0 }, { lineNo: 2, productId: 'milo', name: 'Milo 400g tin', quantity: 1, unitPriceMinor: n * 100, lineTotalMinor: n * 100, refundedQuantity: 0 }],
  refundedMinor: 0, refunds: [],
});
const report = role => ({
  companyId: BIZ, role, from: new Date().toISOString(), to: new Date().toISOString(), storeId: null,
  sales: { count: 24, grossMinor: '1293000', discountMinor: '4000' }, byMethod: { cash: '737000', mobile: '450000', card: '36000', credit: '70000' },
  refunds: { count: 3, totalMinor: '13500', cash: '7500', mobile: '0', card: '0', creditReducedMinor: '6000' },
  repayments: { count: 2, totalMinor: '15000', cash: '10000', mobile: '5000', card: '0' },
  supplierPayments: role === 'owner' ? { cash: '50000', mobile: '0', card: '0', bank: '20000' } : { cash: '0', mobile: '0', card: '0', bank: '0' },
  topProducts: [{ name: LONG, quantity: 15, revenueMinor: '188250' }, { name: 'Crate of eggs', quantity: 12, revenueMinor: '54000' }],
  byCashier: role === 'owner' ? [{ cashierId: OWNER, count: 14, grossMinor: '800000' }, { cashierId: ATT2, count: 10, grossMinor: '493000' }] : [],
  cashTakenMinor: '747000', cashPaidOutMinor: '57500', cashExpectedMinor: '689500', customerCreditOutstandingMinor: role === 'owner' ? '45000' : null,
});

async function mock(page, role, hits) {
  const me = person(role);
  const session = { access_token: jwt(me.id, me.email), refresh_token: 'refresh', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer',
    user: { id: me.id, aud: 'authenticated', role: 'authenticated', email: me.email, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
  await page.addInitScript(s => localStorage.setItem('sb-127-auth-token', JSON.stringify(s)), session);
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
  const json = (route, body, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route(`${SB}/**`, async route => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/auth/v1/user') return json(route, session.user);
    if (url.pathname === '/auth/v1/token') return json(route, session);
    if (url.pathname === '/rest/v1/businesses') return json(route, [{ id: BIZ, name: 'Kwaku Provisions and General Merchandise', owner_id: OWNER, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]);
    if (url.pathname === '/rest/v1/business_members') return json(route, [{ business_id: BIZ, user_id: me.id, role }]);
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const { p_action: action, p_input: input } = JSON.parse(req.postData() || '{}');
      hits.add(action);
      const empty = { transfers: [], suppliers: [], orders: [], counts: [], sales: [] };
      const answers = {
        overview: overview(role), productCatalog: { products: catalog(role) }, readiness: { companyId: BIZ, saleCount: 24 },
        listSales: { sales: [1, 2, 3].map(receipt) },
        searchSales: { sales: [1, 2, 3, 4, 5].map(receipt), hasMore: true, next: { recordedAt: new Date().toISOString(), receiptNumber: 1 }, matchCount: 24, grossMinor: '1293000', refundedMinor: '13500' },
        dailyReport: report(role), refundPolicy: { companyId: BIZ, revision: 1, refundsEnabled: true, allowVoid: true, allowPartial: true, maxAgeDays: 30, effectiveAt: null, history: [] },
        supplierBalances: { suppliers: [{ supplierId: 's1', name: 'Wholesale Traders Limited of Kumasi', archived: false, receivedMinor: '3000000', settledMinor: '2000000', outstandingMinor: '1000000' }] },
        listPurchaseOrders: { orders: [{ orderId: 'o1', storeId: 'st-a', supplierId: 's1', reference: 'INV-2026-0042', createdAt: new Date().toISOString(), closed: false, orderedLines: 3, receivedMinor: '500000' }] },
        listStockCounts: { counts: [{ countId: 'ct1', storeId: 'st-a', productId: 'eggs', expectedQuantity: 12, countedQuantity: null, status: 'open', createdAt: new Date().toISOString() }] },
        listTransfers: { transfers: [{ transferId: 't1', fromStoreId: 'st-a', toStoreId: 'st-b', productId: 'long', quantity: 6, status: 'requested', requestedAt: new Date().toISOString() }] },
        listOnlineOrders: { orders: [{ orderId: 'oo1', storeId: 'st-a', quotedTotalMinor: '27000', customerReference: 'Ama, 024 000 0001', status: 'accepted', saleId: null, createdAt: new Date().toISOString() }] },
        salesSummary: { companyId: BIZ, role, days: 7, currency: 'GHS', salesCount: 24, grossMinor: '1293000', refundMinor: '13500', netSalesMinor: '1279500', customerCreditOutstandingMinor: '45000' },
        stockAccess: role === 'owner' ? { canManageStock: true, members: [{ userId: 'u-att', canManageStock: true }] } : { canManageStock: true },
        receivableOrders: { orders: [{ orderId: 'o1', storeId: 'st-a', reference: 'INV-2026-0042', supplierName: 'Wholesale Traders Limited of Kumasi', createdAt: new Date().toISOString(),
          lines: [{ lineNo: 1, productId: 'eggs', name: 'Extra long product name for layout testing 500g family pack', orderedQuantity: 120, receivedQuantity: 40 }] }] },
        archivedCustomers: { customerIds: [] },
        accountsOverview: { from: new Date().toISOString(), to: new Date().toISOString(), accounts: Object.fromEntries(['cash', 'mobile', 'card', 'bank'].map(a => [a, { components: { sales: '129300000', repayments: '1000000', transfersIn: '0', refunds: '1350000', suppliers: '5000000', expenses: '450000', transfersOut: '30000000' }, inMinor: '130300000', outMinor: '36800000', netMinor: '93500000',
          lastReconciliation: { reconciliationId: 'r1', asOf: new Date().toISOString(), actualMinor: '5380000000', differenceMinor: '-20000' }, expectedNowMinor: '5380020000' }])),
          position: { customersOweMinor: '4500000', oweSuppliersMinor: '2300000000', stockAtCostMinor: '62400000000', stockLinesWithoutCost: 12 } },
        listReconciliations: { reconciliations: [{ reconciliationId: 'r1', account: 'cash', asOf: new Date().toISOString(), actualMinor: '5380000000', expectedMinor: '5380020000', differenceMinor: '-20000', note: 'End of day count in the main drawer at the Madina branch' }] },
        listAccountTransfers: { transfers: [{ transferId: 't1', from: 'cash', to: 'bank', amountMinor: '30000000', note: 'Banked the weekend takings at the Kumasi Central branch', recordedAt: new Date().toISOString(), voided: false, voidReason: null }] },
        listQuotations: { quotations: [{ quotationId: 'q1', quoteNo: 12, storeId: 'st-a', customerId: null, customerName: 'Mr Mensah of the Kumasi Central Market Traders Association', validUntil: '2099-01-01',
          note: 'Delivery to the shop is free for orders above this amount, otherwise charged separately', totalMinor: '129300000', status: 'open', createdBy: 'u-att', createdAt: new Date().toISOString(), saleId: null,
          lines: [{ productId: 'long', name: 'Extra long product name for layout testing 500g family pack', quantity: 120, unitPriceMinor: 1077500, lineTotalMinor: 129300000 }] }] },
        profitReport: { companyId: BIZ, from: new Date().toISOString(), to: new Date().toISOString(), storeId: null, netRevenueMinor: '129300000', coveredRevenueMinor: '100000000', uncoveredRevenueMinor: '29300000',
          costOfGoodsMinor: '70000000', grossProfitMinor: '30000000', marginBps: 3000, expenses: { count: 3, totalMinor: '4500000' }, netProfitMinor: '25500000',
          saleLines: { total: 40, withCost: 30 }, topByProfit: [{ name: 'Extra long product name for layout testing 500g family pack', quantity: 120, revenueMinor: '50000000', profitMinor: '15000000' }] },
        listRefundRequests: { requests: [{ requestId: 'rr1', saleId: 's1', receiptNumber: 1042, totalMinor: '1293000', requestedBy: 'u-att', status: 'pending', reason: 'Customer says the eggs were cracked when opened at home',
          lines: null, returnToStock: true, createdAt: new Date().toISOString(), decidedAt: null, decisionNote: null, items: [{ name: 'Extra long product name for layout testing 500g family pack', quantity: 120 }] }] },
        myRefundRequests: { requests: [{ requestId: 'rr1', saleId: 's1', receiptNumber: 1042, status: 'declined', reason: 'Customer says the eggs were cracked', lines: null, returnToStock: true,
          createdAt: new Date().toISOString(), decidedAt: new Date().toISOString(), decisionNote: 'Please ask them to bring the eggs back first', items: [{ name: 'Eggs', quantity: 2 }] }] },
        listJoinCodes: { codes: [{ codeId: 'k1', status: 'pending', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), usedBy: null, usedAt: null }] },
        listExpenses: { expenses: [{ expenseId: 'e1', storeId: 'st-a', category: 'transport', amountMinor: '12500000', method: 'mobile', expenseDate: '2026-11-10',
          note: 'Taxi to the wholesale market and back with a very long explanatory note', recordedBy: 'u1', recordedAt: new Date().toISOString(), voided: false, voidReason: null }] },
        customerStatement: { id: 'c1', name: 'Ama', phone: null, creditLimitMinor: 100000, balanceMinor: 45000, entries: [] },
      };
      if (action in answers) return json(route, answers[action]);
      return json(route, empty);
    }
    return json(route, {});
  });
}

// Everything that can push the page wider than the screen, ignoring parts that are meant to scroll sideways.
const layoutReport = () => {
  const vw = window.innerWidth;
  const scrollers = el => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  // Only the deepest offenders: a wide container is usually just stretched by one thing inside it.
  const offenders = [...document.querySelectorAll('body *')].filter(el => {
    const r = el.getBoundingClientRect(), st = getComputedStyle(el);
    return r.width && st.visibility !== 'hidden' && st.display !== 'none' && st.position !== 'fixed' && r.right > vw + 1 && !scrollers(el);
  });
  const wide = offenders.filter(el => !offenders.some(other => other !== el && el.contains(other)))
    .map(el => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${(el.textContent || '').trim().slice(0, 40)}" width=${Math.round(el.getBoundingClientRect().width)} right=${Math.round(el.getBoundingClientRect().right)}`);
  const smallText = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea')]
    .filter(el => el.getBoundingClientRect().width && parseFloat(getComputedStyle(el).fontSize) < 16)
    .map(el => `${el.tagName.toLowerCase()} "${el.getAttribute('aria-label') || el.closest('label')?.textContent?.trim().slice(0, 25) || el.name || ''}" ${getComputedStyle(el).fontSize}`);
  const shortButtons = [...document.querySelectorAll('button.primary-action, button.secondary-action')]
    .filter(el => { const r = el.getBoundingClientRect(); return r.width && r.height < 40; })
    .map(el => `"${(el.textContent || '').trim().slice(0, 25)}" ${Math.round(el.getBoundingClientRect().height)}px`);
  return { pageScroll: document.documentElement.scrollWidth - vw, wide: wide.slice(0, 8), smallText: [...new Set(smallText)].slice(0, 8), shortButtons: [...new Set(shortButtons)].slice(0, 8) };
};

const TABS = {
  owner: ['Dashboard', 'Sell', 'Stock', 'Purchasing', 'Stock counts', 'Online orders', 'Customers', 'Quotes', 'Ask', 'Refund requests (1)', 'Expenses', 'Accounts', 'Team', 'Sales', 'Reports'],
  attendant: ['Sell', 'Customers', 'Stock counts', 'Receive goods', 'Quotes', 'Ask', 'My sales', 'My day'],
};

for (const width of [360, 320]) {
  for (const role of ['owner', 'attendant']) {
    test(`shared shop at ${width}px as ${role}: nothing sticks out and fields are big enough`, async ({ page }) => {
      const hits = new Set(), problems = [];
      await page.setViewportSize({ width, height: 740 });
      await mock(page, role, hits);
      await page.goto('/shop');
      const reqs = []; page.on('request', r => { if (r.url().startsWith(SB)) reqs.push(r.method() + ' ' + new URL(r.url()).pathname); });
      page.on('pageerror', e => reqs.push('PAGEERROR ' + e.message.slice(0, 160)));
      try { await expect(page.getByRole('button', { name: 'Sell', exact: true })).toBeVisible({ timeout: 30000 }); }
      catch (e) { console.log('DEBUG body:', (await page.locator('body').innerText()).slice(0, 400)); console.log('DEBUG requests:', reqs.slice(0, 20).join(' | ')); throw e; }
      if (SHOTS) mkdirSync(SHOTS, { recursive: true });
      for (const tab of TABS[role]) {
        await page.getByRole('button', { name: tab, exact: true }).click();
        await page.waitForTimeout(500);
        if (tab === 'Sell') { for (const name of ['Add one Crate of eggs', `Add one ${'Extra long product name for layout testing 500g family pack'}`]) await page.getByRole('button', { name }).click({ trial: false }).catch(() => {}); }
        if (tab === 'Ask') { for (const q of ['What did I sell today?', 'What is low on stock?', 'Draft an order for what is low']) { await page.getByLabel('Your question').fill(q); await page.getByLabel('Your question').press('Enter'); await page.waitForTimeout(300); } }
        if (tab === 'Quotes') { await page.locator('.shop-customer-row').first().click().catch(() => {}); }
        if (tab === 'Sales') await page.locator('.shop-sales li button').first().click().catch(() => {});
        if (tab === 'My sales') { await page.locator('.shop-sales li button').first().click().catch(() => {}); await page.getByRole('button', { name: 'Ask the owner for a refund' }).click().catch(() => {}); }
        if (tab === 'Stock') { await page.getByRole('button', { name: /Add product/ }).click().catch(() => {}); await page.getByText('Import products from a file').click().catch(() => {}); }
        await page.waitForTimeout(250);
        const r = await page.evaluate(layoutReport);
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/${role}-${width}-${tab.replace(/\s+/g, '-')}.png`, fullPage: true });
        if (r.pageScroll > 1) problems.push(`${tab}: page scrolls sideways by ${r.pageScroll}px`);
        if (r.wide.length) problems.push(`${tab}: sticks out past the screen: ${r.wide.join(' | ')}`);
        if (r.smallText.length) problems.push(`${tab}: fields under 16px (iOS zooms in): ${r.smallText.join(' | ')}`);
        if (r.shortButtons.length) problems.push(`${tab}: buttons under 40px tall: ${r.shortButtons.join(' | ')}`);
      }
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }
}
