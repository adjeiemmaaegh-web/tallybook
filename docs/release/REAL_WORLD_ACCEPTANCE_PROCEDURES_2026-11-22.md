# Real-world acceptance procedures (owner-run; none performed)

Automated and simulated evidence is **not** acceptance. Record every result in the table at the end with date, tester, device, build SHA and screenshots. Use test businesses only; no live payments; never test against real customer data.

## A. Two real accounts (shared shop)
Prereqs: staging project and a build pointing at it; two real email accounts (owner O, attendant A) + one non-member N.
1. O signs up, creates company + shop, invites A (join code, 24 h expiry). Expect: A joins; N cannot read anything.
2. O adds products. A (phone) sells 3 items cash; O (laptop) sees it within 1 minute. Expect identical totals, stock down by 3.
3. Both sell the last unit at the same moment, offline on both. Expect: after reconnect exactly one sale posts, the other is flagged for review, stock never negative.
4. Remove A's membership while A is offline with a queued sale. Expect: the queued sale is refused on reconnect, nothing posted.
5. N tries owner URLs and RPCs directly. Expect: refusal everywhere.
6. Split-tender sale + partial return under each refund policy (proportional, reverse-order); points reversed as configured. Compare drawer, wallet, loyalty, report.
Pass: no cross-account leakage, no lost/duplicated sale, totals equal on both devices.

## B. Physical devices
Matrix: low-spec Android Chrome, iPhone Safari (and installed PWA), Windows Edge, macOS Safari. For each: install PWA, work offline 30 min (10 sales, 2 returns, 1 stocktake), airplane mode toggles, kill the browser mid-checkout and reopen (expect the pending sale recovered, never silently dropped), low-storage warning, 20,000-product catalogue scroll/search speed (target: search < 300 ms), battery/thermal notes.

## C. Printers
Thermal 58 mm and 80 mm (Bluetooth and USB), one A4 laser. Print: normal receipt, long product names, 40-line receipt, return receipt, GHS amounts with thousands separators, reprint marking, out-of-paper and disconnected mid-print (expect a clear error and no lost receipt data). Check cut/feed and legibility; photograph each.

## D. Security key and encryption (PR #111, opt-in)
1. Enable ledger encryption on a populated test ledger; confirm Chrome DevTools > IndexedDB shows no readable products/amounts/customer names, and localStorage drafts are sealed.
2. Reload: unlock screen appears; wrong passphrase refused; correct opens.
3. Idle auto-lock at 1 min; confirm staff session cleared.
4. **Key rotation**: rotate, kill the tab halfway, reopen, resume with the OLD passphrase/recovery code; verify completion and that the old credentials stop working only after verification.
5. Lost passphrase: recover with the one-time recovery code on a **clean device** from an exported backup.
6. Security key (optional step-up, see `SECURITY_KEY_STEP_UP_2026-11-22.md`; the owner panel/gating is not built yet, so run the `webauthnClient` flow from the dev console on a staging build): register each physical key (USB, NFC, platform authenticator) with user verification; confirm twice (counter advances); try an unregistered key (refused); remove it; try requiring it with a single key and no recovery code (refused); then recover access with the recovery code only. Record AAGUID/model, browser and OS per key.
Pass: no plaintext at rest, recovery works clean-device, rotation survives interruption.

## E. Backup restoration drill
1. Export an encrypted backup from a populated ledger (record counts and money totals). 2. On a clean browser profile restore it. 3. Compare per-table counts, stock, customer balances, wallet, loyalty, cash drawer, and run the integrity check (expect clean). 4. Restore a deliberately tampered copy (flip one byte): expect refusal with no change. 5. Interrupt a restore mid-way: expect rollback to the prior state. 6. Time it; record RTO. Pass: byte-exact financial totals and clean integrity check.

## F. Independent security review (scope for the reviewer)
Hosted RLS/RPC authorization (all `tallybook_*` RPCs as owner/manager/attendant/non-member/anon), session-proof checks, guest-order pricing, payment webhook signature/replay/rate-limit, Discover public API abuse, encryption design (XChaCha20-Poly1305 rows, blinded indexes, keyring CAS, rotation), service-worker/PWA caching of private data, secrets handling, dependency advisories, backup file format. Provide: repo at the release SHA, the register, `docs/security/*`, CI reports (CodeQL, secret scan). Deliverable: findings with severity and re-test of fixes.

## Results log
| Section | Tester | Date | Build SHA | Result | Evidence link |
|---|---|---|---|---|---|
