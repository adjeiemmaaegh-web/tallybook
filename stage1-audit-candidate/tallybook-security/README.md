# Tallybook V19 — Standalone Security Validation Component

This package adds a read-only, fail-closed security *validation layer*. It does not change Tallybook tables, database records, authorization interfaces, or application code. It uses TypeScript structural interfaces and a supplied database adapter; no Dexie table names or schemas are assumed.

## Build and test

With TypeScript 5.8+ installed: `npm run build` and `npm test` (or `tsc -p tsconfig.json && node --test tests/*.test.cjs`). Fourteen focused tests cover authorization, isolation, roles, sessions, financial approvals, suspicious attempts, failure behavior, auditing and read-only operation.

## Integration

Import `SecurityValidator` and implement `DatabaseAdapter` and `AuthorizationAdapter` by delegating to your *existing* Dexie instance and existing authorization services. Do not create replacement stores or policies. For example:

```ts
import { SecurityValidator } from './security';
const validator = new SecurityValidator({
  companyExists: async companyId => /* read existing Dexie company table */ false,
  staffBelongsToCompany: async (staffId, companyId) => /* read membership */ false,
  getSession: async sessionId => /* read existing session, or null */ null,
  resourceBelongsToCompany: async request => /* resolve target record ownership */ false,
}, {
  isRoleValid: async (principal, role, companyId) => /* existing role service */ false,
  hasPermission: async (principal, operation, companyId) => /* existing permission service */ false,
  canPerformFinancialOperation: async request => /* existing transaction policy */ false,
}, { onAudit: entry => { /* optional secure logging, avoid PII */ } });
const result = await validator.validate({
  principal: { id: 'staff-id', companyId: 'company-id', roles: ['role'], sessionId: 'session-id' },
  companyId: 'company-id', operation: 'payment.refund', financial: true,
  amount: 1250, // integer minor currency units, e.g. pesewas/cents
  resourceCompanyId: 'company-id', sessionId: 'session-id'
});
if (result.decision !== 'allow') throw new Error('Unauthorized');
// Then execute the actual operation through your existing, independently guarded write transaction.
```

**Important boundaries:** Validation is a snapshot, not atomic with a later write; revalidate authorization and company ownership *inside the actual write transaction* to prevent TOCTOU/race attacks. Treat request-supplied principal, roles, company IDs, session IDs and amounts as untrusted: bind the principal to an independently authenticated identity, derive roles and record ownership from trusted stores, and never let the caller choose `now`. `resourceBelongsToCompany` is optional in the interface, but MUST be implemented or equivalent ownership checks performed for resource-scoped operations. A financial operation requires an explicit `canPerformFinancialOperation` adapter and integer minor-unit amount. Session validation assumes millisecond epoch times. For offline-first apps, protect local database and audit data against tampering as appropriate to the threat model; browser-local validation alone cannot stop an attacker with full device/database control.

`getAuditReport()` provides bounded, in-memory, redacted decision history (no session token recorded). `onAudit` can persist audit events using an existing secure audit facility, but this component does not write to IndexedDB. Audit-sink errors are intentionally ignored so the sink cannot change the authorization result; if durable logging is mandatory for a sensitive action, enforce it separately in the write transaction. Suspicious-attempt tracking is per validator instance and not durable or cross-tab; it is an advisory signal, not a production rate limiter. Review and tune thresholds for your deployment.
