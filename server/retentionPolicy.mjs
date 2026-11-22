/** Configurable data-retention POLICY and DRY-RUN planner. Everything is OFF by default.
 *  This module never deletes anything and has no database access: it validates settings and says what WOULD be eligible.
 *  A deletion executor is deliberately not implemented; it needs counsel-approved periods and an explicit owner approval record. */
const DAY = 86_400_000;

/** `deletable:false` classes are financial records: append-only, corrected by new entries, never expired by this module. */
export const RETENTION_CLASSES = Object.freeze({
  financial_records: {deletable: false, label: "Sales, returns, payments, shifts, audit"},
  payment_events: {deletable: false, label: "Payment events (financial record)"},
  discover_requests: {deletable: true, minDays: 30, label: "Discover shopper requests (name, phone, note)"},
  support_evidence: {deletable: true, minDays: 7, label: "Support evidence"},
});
export const RETENTION_MODES = Object.freeze(["off", "dry-run", "enforce"]);

export const defaultRetentionConfig = () => ({
  enforcementEnabled: false,
  approval: null, // {approvedBy, approvedAt (ISO), reference} required for any 'enforce'
  classes: Object.fromEntries(Object.keys(RETENTION_CLASSES).map(id => [id, {mode: "off", periodDays: null}])),
});

export function validateRetentionConfig(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== "object" || typeof cfg.classes !== "object") return {ok: false, errors: ["Configuration is missing."]};
  for (const id of Object.keys(cfg.classes)) if (!RETENTION_CLASSES[id]) errors.push(`Unknown data class: ${id}`);
  let anyEnforce = false;
  for (const [id, spec] of Object.entries(RETENTION_CLASSES)) {
    const c = cfg.classes[id] ?? {mode: "off", periodDays: null};
    if (!RETENTION_MODES.includes(c.mode)) { errors.push(`${id}: unknown mode`); continue; }
    if (!spec.deletable) { if (c.mode !== "off") errors.push(`${id}: financial records are never expired by retention; use correction entries`); continue; }
    if (c.mode === "off") continue;
    if (!Number.isSafeInteger(c.periodDays) || c.periodDays < spec.minDays) errors.push(`${id}: period must be a whole number of days, at least ${spec.minDays}`);
    if (c.mode === "enforce") anyEnforce = true;
  }
  if (anyEnforce) {
    if (cfg.enforcementEnabled !== true) errors.push("Enforcement is switched off globally.");
    const a = cfg.approval;
    if (!a || typeof a.approvedBy !== "string" || !a.approvedBy.trim() || typeof a.reference !== "string" || !a.reference.trim() || !Number.isFinite(Date.parse(a.approvedAt)))
      errors.push("Enforcement needs a recorded owner approval (who, when, reference).");
  }
  return {ok: errors.length === 0, errors};
}

/** rows: [{id, at (ISO: when the retention clock started, e.g. answered/expired/closed), legalHold?, openObligation?}]
 *  Returns what would be eligible. `willDelete` is ALWAYS false here: this planner cannot delete. */
export function planRetention({config, dataClass, rows, now = Date.now()}) {
  const v = validateRetentionConfig(config);
  const empty = (mode, reason) => ({dataClass, mode, eligible: [], skipped: [], reason, willDelete: false});
  if (!v.ok) return {...empty("off", "invalid configuration"), errors: v.errors};
  const spec = RETENTION_CLASSES[dataClass];
  if (!spec) return {...empty("off", "unknown data class"), errors: ["Unknown data class."]};
  if (!spec.deletable) return empty("off", "financial records are never expired");
  const c = config.classes[dataClass] ?? {mode: "off"};
  if (c.mode === "off") return empty("off", "retention is off for this class");
  const cutoff = now - c.periodDays * DAY, eligible = [], skipped = [];
  for (const r of rows ?? []) {
    const at = Date.parse(r?.at);
    if (!r || typeof r.id !== "string") continue;
    if (!Number.isFinite(at)) skipped.push({id: r.id, reason: "no valid retention start date"});
    else if (r.legalHold === true) skipped.push({id: r.id, reason: "legal hold"});
    else if (r.openObligation === true) skipped.push({id: r.id, reason: "open obligation"});
    else if (at > cutoff) skipped.push({id: r.id, reason: "within retention period"});
    else eligible.push(r.id);
  }
  return {dataClass, mode: c.mode, eligible, skipped, cutoffIso: new Date(cutoff).toISOString(), willDelete: false,
    note: c.mode === "enforce" ? "Enforce is configured but this build has no deletion executor; nothing is deleted." : "Dry run only."};
}
