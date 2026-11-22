# Retention settings and alert channel (built disabled; nothing enabled)

## What exists (tested, 10 tests, 4 safety mutants caught)
- `server/retentionPolicy.mjs`: per-class settings, **everything `off` by default**. Financial records and payment events can **never** be put under retention (validation rejects it). Deletable classes (Discover shopper requests, support evidence) need a whole-day period above a floor (30 and 7 days). `enforce` needs the global switch **and** a recorded owner approval (who, when, reference). The planner returns what *would* be eligible, skips legal holds, open obligations and rows with no valid start date, and **always reports `willDelete: false`: no deletion executor exists in this build.**
- `server/alertChannel.mjs`: dispatcher **disabled by default**; severity floor, dedupe window, hourly cap (critical bypasses the cap), redaction of tokens/PINs/phones/names/emails, failed channels never counted as sent. Only an in-memory sink exists. An external channel is refused unless `externalApproved` is true **and** an owner-supplied adapter is registered. No network code.

## Still to build, after decisions
1. Periods: counsel confirms the table in the runbook section 5 (proposal: Discover requests 90 days after answered/expired; financial records legal bookkeeping period).
2. Deletion executor (separate PR): SQL function that anonymises/deletes only rows the planner marked, in batches, writing an append-only audit row, with a dry-run-first gate and a guarded rollback note (deletion is irreversible; take a backup first).
3. Settings UI for owner (read-only preview first).
4. Alert adapters for the chosen channel; wire the daily smoke workflow, the two reconcile calls (non-empty `discrepancies`, `needsReview`, `unresolved`, abandoned shift) and Supabase log alerts (`permission denied` spikes, RPC 5xx) to the dispatcher via a service-role runner.

## Decisions needed
- Retention periods per class and legal basis. - Whether Discover requests auto-delete. - Alert channel (email / Slack / Telegram) and who receives critical alerts. - Where the scheduled runner lives (GitHub Actions cron vs Supabase scheduled function).
