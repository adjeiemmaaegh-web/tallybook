# Four-week pilot plan (not deployment authorization)

- Week 1: isolated development schema and two-business security-negative tests; sample-only records; validate new staff PIN/shift and MoMo reference workflows in a disposable environment.
- Week 2: one-shop offline sales and audited no-sale events, CSV compatibility checked by actual Watchdog importer; measure missing shop/staff/device provenance and cash variance, with no live cloud activation.
- Week 3: test-project upload-only replay: connectivity loss, restart, duplicate operations, server rejection and shop offline alerts; verify all accepted operations exactly once and clear exception queues.
- Week 4: review retention, tenant segregation, cash/MoMo statement matching, owner reports and backup recovery; run Windows/Chrome/Edge physical acceptance and secure incident-evidence handling.

Suggested quantitative exit: zero unauthenticated accepted writes; zero double-counted replayed operations; zero unauthorized cross-business reads; 100% of new sale/drawer actions attributed to active staff, shift and shop; 100% server ACK reconciliation for connected test events (including retries); documented latency percentiles and offline recovery. Only with separate owner authorization expand gradually to shops 2–7; seven is not a software limit.
