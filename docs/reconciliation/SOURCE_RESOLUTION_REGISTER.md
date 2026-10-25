# Master versus GitHub source resolution register

GitHub baseline: `v19/stage22-financial-workflow-completion-20261017` at `52668cc28687ef6ce1304a601e45413bac6d3093`.
Master SHA-256 and each branch SHA-256 are in `file_sha256_comparison.json`.
A clean textual merge is provisional until semantic tests pass. Conflicted files are not accepted by default.

| Path | Master SHA-256 | Three-way result | Current treatment |
|---|---|---|---|
| `client/src/components/TaxSettings.tsx` | `efb87195dbc01ed38a31f831167f74cae72dd4272dcb14bb2ed3e3666e30770f` | clean (0 conflict blocks) | Clean source merge applied |
| `client/src/contexts/BusinessProfileContext.tsx` | `421b7c8e786debc5e8beb037d0752109f75c6bb825bc48220dd4e9811cd3a1fc` | clean (0 conflict blocks) | Clean source merge applied |
| `client/src/db/TallybookDB.test.ts` | `e7c2b5757071b6124a0aa8ffdd0617c01023fb13b879ab81ace5ae7f6b185254` | clean (0 conflict blocks) | Clean source merge applied |
| `client/src/db/TallybookDB.ts` | `7d727be738e2b1dde3ea9afd08c2f8ee3ce7dd912166cb0a8cf46175845e464c` | conflict (2 conflict blocks) | Manual v29/v30 lineage union and v35 migration; focused tests pass |
| `client/src/features/assistant/reversals.ts` | `57fe65026ea0d3dcd2ad68603990ee8f4134d044fac3920f0705d9288c380127` | conflict (2 conflict blocks) | Partial manual security merge; focused company-isolation tests pass |
| `client/src/features/assistant/salesAnalytics.ts` | `d7e31f77505272a2152094af1a52272be4729810b3bad8235304811242139d46` | clean (0 conflict blocks) | Clean source merge applied |
| `client/src/features/backup/backup.test.ts` | `b07809fa32cdadfe01d28166e5bbcd74dbe597e68a0813d0945cd9d541f2c647` | conflict (1 conflict blocks) | Stage22 verified-export receipt test retained. Master test invoked the older unverified timestamp API; that expectation would bypass the newer digest proof. Legitimate staff unlock and post-restore re-unlock added to fixtures; backup suite passes 11/11. Wider restore acceptance remains open. |
| `client/src/features/backup/backup.ts` | `6289100045e1fd0c7467d3b38b5c7c6218b505904c6ee62902a0feb7b5041bc6` | conflict (1 conflict blocks) | Stage22 verified receipt and recovery coordination retained; Master company-switch checks added around export metadata writes. Receipt-linked batches now require matching immutable cost evidence before restore. Backup and cost-ledger focused suites pass 27/27; full acceptance remains open. |
| `client/src/features/business/businessProfile.test.ts` | `3d8cd37d647733fc80fdd1e4deb3a3aa1de1a04f02ca719b8b1c932f1b9ec75d` | clean (0 conflict blocks) | Clean source merge applied |
| `client/src/features/business/businessProfile.ts` | `ce086a9435707b4b2eb2033934df713b4cae3a8fd6d70b651783738578af7ad6` | clean (0 conflict blocks) | Clean source merge applied |
| `client/src/features/credit/credit.ts` | `3a5b60c3d03cffa344154987c90d5adf2763b85a1a01c13ef91c99b826d329c0` | conflict (4 conflict blocks) | Stage22 company-switch guards, recovery barrier and full receivable audit retained; Master guards were equivalent where they overlapped. Credit suite passes 18/18 with legitimate staff fixture. Wider financial acceptance remains open. |
| `client/src/features/customers/customerBenefits.ts` | `e6bb194df0ad2072264adfd195fcafbbbf758c8cfc4fc285a709ff852614dc35` | conflict (4 conflict blocks) | Pending semantic resolution; GitHub baseline retained |
| `client/src/features/customers/customers.ts` | `651201e5fdfeff9ea7f7c90150cb1cf3228a45631f8f08cf707328892a951afe` | conflict (1 conflict blocks) | Pending semantic resolution; GitHub baseline retained |
| `client/src/features/customers/retentionInsights.ts` | `02280b52fc896d3bccd654ad28d8104be880e8ad5dbd179d81e5ed87ed03e0e0` | clean (0 conflict blocks) | Clean source merge applied |
| `client/src/features/expenses/expenses.ts` | `fceeb38ef07231551f2ae193a1b6c200b33da28de6afde05926b36ba9618f0d6` | conflict (4 conflict blocks) | Pending semantic resolution; GitHub baseline retained |
| `client/src/features/inventory/advancedInventory.ts` | `ca21add489c0ba379028b02431d7d935540dae89ea927cbbc4c3996a2ffb6922` | conflict (2 conflict blocks) | Pending semantic resolution; GitHub baseline retained |
| `client/src/features/inventory/costLedger.test.ts` | `a7a251798689c9f115ecdfb77b171541e318ae9e1769673bfb168bc1ffc32d6a` | clean (0 conflict blocks) | Clean source merge applied |
| `client/src/features/inventory/costLedger.ts` | `f0f4c5035d8ab4653c2186a8c64ce643717ed957dda7624d593b7cfc38941823` | clean (0 conflict blocks) | Clean source merge applied |
| `client/src/features/inventory/stage2Inventory.ts` | `444f7241bf10717dd3a5020e01aa6e1426289b41041235ad13afbee0d84328f1` | conflict (5 conflict blocks) | Pending semantic resolution; GitHub baseline retained |
| `client/src/features/payments/mobileMoney.test.ts` | `013c465a28fe68260b247eff966d8ab150d3e70c8f09d7e4aaef15055e5fe122` | clean (0 conflict blocks) | Clean source merge applied |
| `client/src/features/payments/mobileMoney.ts` | `7783847695f44f6356d39dc76fb46ef0a1e7016f3ae82a276efd981acbe36c3e` | clean (0 conflict blocks) | Clean source merge applied |
| `client/src/features/purchases/purchases.test.ts` | `86144bcdf9297b6affc66010dc0243e897eabfcea82550328f609cddf9f7a7f6` | clean (0 conflict blocks) | Clean source merge applied |
| `client/src/features/purchases/purchases.ts` | `5976c7c04b718330cd7194d7ea9177734b0c1236694956e54eecc87ad9e6538a` | conflict (3 conflict blocks) | Master batch receipt validation, retry identity, cost links and atomic batch writes merged with stage22 company currency, store ledger, recovery lock and supplier safeguards. Purchase and company-isolation suites pass 25/25; wider integration remains open. |
| `client/src/features/purchases/supplierPayables.test.ts` | `1e35b11c3bdb172205c89fe4cf769938a090a5591cd49586ff59e5ab41bbfa6a` | conflict (1 conflict blocks) | Pending semantic resolution; GitHub baseline retained |
| `client/src/features/purchases/supplierPayables.ts` | `cc0183e6a86c34d68892e4eb90696281f3c9c832481465b6b58a5e690781a221` | conflict (5 conflict blocks) | Stage22 recovery barrier, proposed-entry reconciliation and supplier identity checks retained; Master company guards were equivalent where overlapping. Settled zero balances now stay out of outstanding-by-currency totals. Supplier-payable and Run12 integration suites pass 22/22. Wider acceptance remains open. |
| `client/src/features/reliability/integrity.ts` | `5885a17ccd502a5a1ab09003d9627e3f23d1500ef8bdc88623a5fb40661f682b` | clean (0 conflict blocks) | Clean source merge applied |
| `client/src/features/reports/financialIntelligence.ts` | `f80b8957080538938e39b1d2cbaff0ec82ff9a3a2225345b6bcafbb69f16fab6` | conflict (2 conflict blocks) | Stage22 report path retained: it includes Master cost valuation plus customer receivable and supplier-identity audits, and rechecks company scope. Financial intelligence, Run10 and Run12 focused suites pass 53/53. Wider reporting acceptance remains open. |
| `client/src/features/sales/cashPartialReturnPosting.ts` | `129b3ca02275ce910a3d2e28805ec71226126e395a721248882cb8ce23c77565` | clean (0 conflict blocks) | Clean source merge applied |
| `client/src/features/sales/sales.ts` | `5c57f0fad2d5f9527817dbf595049788ceaea4b136066441be694ef2a373f4a8` | conflict (2 conflict blocks) | Partial manual security merge; focused company-isolation tests pass |
| `client/src/features/stores/storeAuthorization.test.ts` | `33f9575deb752a7231d8de86d6448b70552e4471f9de8478a9ef11334e772fa5` | clean (0 conflict blocks) | Clean source merge applied |
| `client/src/features/stores/storeDirectory.ts` | `c0b6cc22f4020f86559a4e5f07d15bd4fafb2cb9502ae115f390ebd15e1f398c` | clean (0 conflict blocks) | Clean source merge applied |
| `client/src/features/stores/storeStockCounts.ts` | `4975b76e87ed79c062755db35c486d5bb4082559c2718d3074c081e7dac2a676` | clean (0 conflict blocks) | Clean source merge applied |
| `client/src/features/stores/storeTransfers.ts` | `131404d9b6f18c2a89487c66ae36d0a61fd8cf09bea7bafe1c866f42d023bd68` | conflict (3 conflict blocks) | Pending semantic resolution; GitHub baseline retained |
| `client/src/pages/BackupPage.tsx` | `958f5cf1ea1ec2e4bc772c1c0f327c7d7d8e547c07fe94bffd1224767aa67423` | conflict (1 conflict blocks) | Pending semantic resolution; GitHub baseline retained |
| `client/src/pages/BusinessSetup.tsx` | `db59e49edc3012dd4e89c1990d2446995ff62e994172e557a122bad9698b42ef` | clean (0 conflict blocks) | Clean source merge applied |
| `client/src/pages/FinancialIntelligencePage.tsx` | `9b47315db222f430754c2d01ee65035888efd6ba26546dede7d34b816bdb055f` | conflict (1 conflict blocks) | Pending semantic resolution; GitHub baseline retained |
| `client/src/pages/InventoryPage.tsx` | `2a284e632ea57d53293bc564deb986059cc042fe7eaa3829fa10d783a546047c` | conflict (1 conflict blocks) | Pending semantic resolution; GitHub baseline retained |
| `client/src/pages/PurchasesPage.tsx` | `c1af570d07b1cb03e3a8e3715e963a214e4e4871d05b37e866b39fcebae88e8b` | conflict (3 conflict blocks) | Master batch input and existing-lot registration UI merged with stage22 receiving-store and supplier-settlement UI. TypeScript and production build pass; browser acceptance remains open. |
| `client/src/pages/ReportsPage.tsx` | `03cb348c53fa0b1d22d44fdf7c15e366bcf37ae17a732e7a4b015399245629ee` | clean (0 conflict blocks) | Clean source merge applied |
| `client/src/pages/StaffPage.tsx` | `6a828244f0316e1e47edf0b77385fa417017f8a900c25bcc6c2ebb2a372dce27` | clean (0 conflict blocks) | Clean source merge applied |
| `docs/release/HANDOVER.md` | `bf855c1095f0aa58b4f09a0a8cb5ccc63af471e5e51d3e3aa07614f0d49aa6b3` | clean (0 conflict blocks) | GitHub release record retained; Master record copied separately if unique |
| `docs/release/RELEASE_REPORT.md` | `cb096538d298ff9aab621fb752cfa616585fe95f2733be4f5e1e1f460e97fe65` | clean (0 conflict blocks) | GitHub release record retained; Master record copied separately if unique |
| `docs/release/blockers.json` | `4279489b233e5ca70a1a908c37476a2cd4bee05ddb1462bee9b2c95ec80fef19` | clean (0 conflict blocks) | GitHub release record retained; Master record copied separately if unique |
| `docs/release/traceability.json` | `ad8de1a29a4d53904b642ea85adf371aa6010bde11e8a365a8a812b2ddf045e6` | clean (0 conflict blocks) | GitHub release record retained; Master record copied separately if unique |
| `docs/release/write-entrypoints.json` | `acd925c49372f12b3afc56955bc19efcbcb9c41b5e28f0b1646316875470e3a7` | clean (0 conflict blocks) | GitHub release record retained; Master record copied separately if unique |
| `todo.md` | `6a8819ea1857770123e9b2d5b1ed55628fba6d9482192b9b742e0e87ae3c8205` | clean (0 conflict blocks) | GitHub release record retained; Master record copied separately if unique |

Master-only paths and their hashes are also listed in `file_sha256_comparison.json`; their copy status is in `master-clean-merge.json`. Candidate modules are preserved as candidates and require separate integration evidence.
