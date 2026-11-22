/** Configurable data-retention POLICY and DRY-RUN planner. Everything is OFF by default.
 *  This module never deletes anything and has no database access: it validates settings and says what WOULD be eligible.
 *  A deletion executor is deliberately not implemented. Owner-proposed defaults below are PROPOSALS: every period and legal
 *  basis needs jurisdiction-specific legal verification before production enforcement (enforcement is refused until recorded). */
const DAY = 86_400_000;

/** action: 'delete' = row may be deleted when eligible; 'review' = never auto-deleted, only listed for a human archival/anonymisation review.
 *  proposedDays: owner-proposed default (applied only when the owner turns the class on); minDays: lowest value the owner may set. */
export const RETENTION_CLASSES = Object.freeze({
  financial_records: {action: "review", proposedDays: 2557, minDays: 2557, legalBasis: "legal_obligation", label: "Financial/accounting records (sales, returns, payments, shifts, payment events): 7 years", note: "Append-only; corrected by new entries. After the period they are listed for review, never auto-deleted."},
  security_audit_logs: {action: "delete", proposedDays: 365, minDays: 90, legalBasis: "legitimate_interests", label: "Security and audit logs: 12 months"},
  technical_logs: {action: "delete", proposedDays: 30, minDays: 7, legalBasis: "legitimate_interests", label: "Technical logs: 30 days"},
  rolling_backups: {action: "delete", proposedDays: 30, minDays: 7, legalBasis: "contractual_necessity", label: "Rolling backups: 30 days"},
  discover_requests: {action: "delete", proposedDays: 90, minDays: 30, legalBasis: "contractual_necessity", label: "Discover shopper requests: 90 days if inactive and not linked to transactions, disputes or legal holds"},
  marketing_contacts: {action: "delete", proposedDays: null, minDays: 1, legalBasis: "consent", requiresConsent: true, label: "Optional marketing contacts (consent required; removed on withdrawal)"},
});
export const LEGAL_BASES = Object.freeze(["contractual_necessity", "legal_obligation", "legitimate_interests", "consent"]);
export const RETENTION_MODES = Object.freeze(["off", "dry-run", "enforce"]);

export const defaultRetentionConfig = () => ({
  enforcementEnabled: false,
  approval: null, // {approvedBy, approvedAt (ISO), reference}: owner approval for any 'enforce'
  legalVerification: null, // {jurisdiction, verifiedBy, verifiedAt (ISO), reference}: required for any 'enforce'; periods/bases are unverified until set
  classes: Object.fromEntries(Object.keys(RETENTION_CLASSES).map(id => [id, {mode: "off", periodDays: null}])),
});

/** The owner-proposed defaults as a ready-to-apply 'dry-run' config (still unverified, still cannot enforce). */
export function proposedDryRunConfig() {
  const c = defaultRetentionConfig();
  for (const [id, s] of Object.entries(RETENTION_CLASSES)) if (s.proposedDays) c.classes[id] = {mode: "dry-run", periodDays: s.proposedDays};
  return c;
}

const filled = (v, ...keys) => v && typeof v === "object" && keys.every(k => typeof v[k] === "string" && v[k].trim());
export function validateRetentionConfig(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== "object" || typeof cfg.classes !== "object") return {ok: false, errors: ["Configuration is missing."]};
  for (const id of Object.keys(cfg.classes)) if (!RETENTION_CLASSES[id]) errors.push(`Unknown data class: ${id}`);
  let anyEnforce = false;
  for (const [id, spec] of Object.entries(RETENTION_CLASSES)) {
    const c = cfg.classes[id] ?? {mode: "off", periodDays: null};
    if (!RETENTION_MODES.includes(c.mode)) { errors.push(`${id}: unknown mode`); continue; }
    if (c.mode === "off") continue;
    if (!Number.isSafeInteger(c.periodDays) || c.periodDays < spec.minDays) errors.push(`${id}: period must be a whole number of days, at least ${spec.minDays}`);
    if (c.mode === "enforce") { anyEnforce = true; if (spec.action === "review") errors.push(`${id}: records of this class are never auto-deleted; use dry-run (review list)`); }
  }
  if (anyEnforce) {
    if (cfg.enforcementEnabled !== true) errors.push("Enforcement is switched off globally.");
    const a = cfg.approval;
    if (!filled(a, "approvedBy", "reference") || !Number.isFinite(Date.parse(a.approvedAt))) errors.push("Enforcement needs a recorded owner approval (who, when, reference).");
    const l = cfg.legalVerification;
    if (!filled(l, "jurisdiction", "verifiedBy", "reference") || !Number.isFinite(Date.parse(l.verifiedAt))) errors.push("Enforcement needs jurisdiction-specific legal verification of the periods and legal bases (jurisdiction, who, when, reference).");
  }
  return {ok: errors.length === 0, errors};
}

/** rows: [{id, at (ISO retention start), legalHold?, openObligation?, inDispute?, linkedToTransaction?, active?, consentWithdrawn?}]
 *  Returns what would be eligible. `willDelete` is ALWAYS false here: this planner cannot delete. */
export function planRetention({config, dataClass, rows, now = Date.now()}) {
  const v = validateRetentionConfig(config);
  const empty = (mode, reason) => ({dataClass, mode, eligible: [], skipped: [], reason, willDelete: false});
  if (!v.ok) return {...empty("off", "invalid configuration"), errors: v.errors};
  const spec = RETENTION_CLASSES[dataClass];
  if (!spec) return {...empty("off", "unknown data class"), errors: ["Unknown data class."]};
  const c = config.classes[dataClass] ?? {mode: "off"};
  if (c.mode === "off") return empty("off", "retention is off for this class");
  const cutoff = now - c.periodDays * DAY, eligible = [], skipped = [];
  for (const r of rows ?? []) {
    if (!r || typeof r.id !== "string") continue;
    const at = Date.parse(r.at), withdrawn = spec.requiresConsent && r.consentWithdrawn === true;
    if (r.legalHold === true) skipped.push({id: r.id, reason: "legal hold"});
    else if (r.openObligation === true) skipped.push({id: r.id, reason: "open obligation"});
    else if (r.inDispute === true) skipped.push({id: r.id, reason: "in dispute"});
    else if (r.linkedToTransaction === true && dataClass === "discover_requests") skipped.push({id: r.id, reason: "linked to a transaction"});
    else if (withdrawn) eligible.push(r.id);                                  // consent withdrawn: due now, whatever the age
    else if (!Number.isFinite(at)) skipped.push({id: r.id, reason: "no valid retention start date"});
    else if (dataClass === "discover_requests" && r.active === true) skipped.push({id: r.id, reason: "still active"});
    else if (at > cutoff) skipped.push({id: r.id, reason: "within retention period"});
    else eligible.push(r.id);
  }
  return {dataClass, mode: c.mode, action: spec.action, legalBasis: spec.legalBasis, eligible, skipped, cutoffIso: new Date(cutoff).toISOString(), willDelete: false,
    note: spec.action === "review" ? "Listed for human review only; never auto-deleted." : c.mode === "enforce" ? "Enforce is configured but this build has no deletion executor; nothing is deleted." : "Dry run only."};
}
