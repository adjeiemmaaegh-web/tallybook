# Retention, privacy and alerts (built; nothing enabled or deleted)

**Status: proposals adopted as defaults by the owner on 2026-11-22. Every period and legal basis requires jurisdiction-specific legal verification before production enforcement.** The code enforces that: `enforce` mode is refused until a legal verification record (jurisdiction, who, when, reference) AND an owner approval record exist. This build has **no deletion executor**; the planner only reports what would be eligible.

## Retention defaults (`server/retentionPolicy.mjs`, `RETENTION_CLASSES`)
| Class | Default | Legal basis (to be verified) | Behaviour |
|---|---|---|---|
| Financial/accounting records (sales, returns, payments, shifts, payment events) | **7 years** (2557 days, also the minimum) | Legal obligation | Append-only; after 7 years rows are listed for **human review only**, never auto-deleted; `enforce` is refused for this class |
| Security and audit logs | **12 months** | Legitimate interests (assessment required) | Deletable when enforced |
| Technical logs | **30 days** | Legitimate interests | Deletable when enforced |
| Rolling backups | **30 days** | Contractual necessity (service delivery) | Deletable when enforced |
| Discover shopper requests | **90 days**, only if inactive and **not** linked to a transaction, dispute or legal hold | Contractual necessity | Planner skips linked/active/disputed/held rows; deletable when enforced |
| Optional marketing contacts | **no default period** | **Consent** (a consent mechanism is required; the Connected Commerce consent ledger `cc_consent_events` is the intended mechanism) | Consent withdrawal makes a contact due immediately |

Everything starts **off**. `proposedDryRunConfig()` returns the defaults as a dry-run-only configuration. Legal holds, open obligations and disputes always block eligibility.

**Tests:** `qa/retention-and-alerts.test.mjs` (16 tests; 8 deliberate-break checks caught, 1 redundant guard documented as equivalent).

## Alerts (`server/alertChannel.mjs`)
- **Primary: email + in-app.** Disabled by default. Slack and Telegram are optional, each off by default and individually switchable, and still need the global external-delivery approval.
- Routing: **critical business alert -> verified business owner** (email + in-app). Warning/info business alerts -> in-app only. **Platform security incident -> the designated security administrator** (email) + in-app; never sent to a business owner.
- Safeguards: external delivery needs `externalApproved`, an owner-supplied adapter and a **verified recipient** (unverified/unresolved recipients get in-app only); message detail is redacted (tokens, PINs, phones, names, emails never leave); severity floor, per-business dedupe window, hourly cap (critical bypasses), a failing channel never blocks others.
- **Resend adapter built, inactive** (`server/resendEmailAdapter.mjs`, 8 tests, 10 deliberate-break checks caught): cannot be constructed without an injected API key and fetch, a company-owned (not free-mail) sender domain marked verified, and the `api.resend.com` endpoint; sends from `alerts@<company domain>` to one verified address; strips header injection; error text never contains the key or provider response. It reads no environment variable and imports no network client, so nothing can be sent until the owner wires it. `checkSenderDnsAuth` pre-checks SPF, a DKIM key and an enforcing DMARC policy (`p=none` fails) with an injected resolver; `alertActivationChecklist` names every missing item. **No credential, domain or recipient exists in the repo.**

## Still to build / to decide (none is blocking development)
1. Deletion executor (separate reviewed PR; irreversible, so backup first, dry-run gate, append-only audit row).
2. Owner settings screen (read-only preview first).
3. **Activation (owner/ops, not performed):** record the actual responsible person (name and contact) in place of the interim platform owner; confirm the company-owned sender domain and add SPF/DKIM/DMARC DNS records; verify the domain in the Resend dashboard; provision the API key as a server-side secret; confirm business-owner addresses come from the auth provider's confirmed-email flag; set `externalApproved`. `alertActivationChecklist` returns what is still missing; today it is everything.
4. Scheduled runner (GitHub Actions cron vs Supabase scheduled function) for the reconcile/smoke/log-alert hooks in the operations runbook.
5. Counsel: verify periods and bases per jurisdiction (Ghana first), the 90-day Discover rule, the marketing consent wording, and data-subject request handling.
**Authorization needed before any external delivery:** named recipients, verified addresses, provider choice and sender domain.

**Recorded decisions (2026-11-22):** interim security administrator = the verified Tallybook platform owner (actual person's name and contact still needed before activation); provider Resend; sender `alerts@<verified company domain>` (final domain to be confirmed); critical incidents -> platform security administrator, business-specific incidents -> the business owner; Slack/Telegram stay optional and disabled; external delivery stays off until verified.
