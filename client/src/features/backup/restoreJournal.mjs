/** The durable marker is stored in the retail DB before touching the separate
 * assistant DB. The marker is removed atomically with a retail restore OR
 * company deletion. Absence after a crash proves that retail commit completed.
 * Older restore markers omit 'operation' and remain readable.
 */
export const RESTORE_JOURNAL_KEY = 'restoreRecoveryJournal';
export const RESTORE_JOURNAL_KIND = 'tallybook-assistant-restore-preimage';
export const RESTORE_JOURNAL_VERSION = 1;
export const RESTORE_JOURNAL_MAX_BYTES = 32 * 1024 * 1024;

// The journal has a portable UTF-8 JSON byte budget. JavaScript .length counts UTF-16
// code units, which can drastically undercount non-ASCII assistant text. Keep
// the quick code-unit rejection for obviously oversized input, then enforce
// the actual serialized byte limit before parsing or saving a recovery marker.
const encoder = new TextEncoder();
function exceedsJournalByteLimit(text) {
  return text.length > RESTORE_JOURNAL_MAX_BYTES ||
    encoder.encode(text).byteLength > RESTORE_JOURNAL_MAX_BYTES;
}
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);

/** No malformed/cross-company preimage may be applied by automatic recovery. */
export function validateRestoreJournal(input) {
  if (!record(input) || input.kind !== RESTORE_JOURNAL_KIND || input.version !== RESTORE_JOURNAL_VERSION || input.phase !== 'assistant-preimage-durable' ||
      (input.operation !== undefined && input.operation !== 'backup-restore' && input.operation !== 'company-clear') ||
      typeof input.id !== 'string' || !/^[a-zA-Z0-9-]{10,80}$/.test(input.id) ||
      typeof input.companyId !== 'string' || !input.companyId.trim() || input.companyId.length > 100 ||
      typeof input.createdAt !== 'string' || !Number.isFinite(Date.parse(input.createdAt)) ||
      !record(input.before)) throw new Error('Invalid pending backup restore journal. Stop and preserve this device.');
  validateAssistantSnapshot(input.before, input.companyId);
  // New journals record the exact assistant state permitted after the first
  // database commit. Version-one journals without `after` still parse, but
  // recovery cannot safely guess an unknown postimage if it differs from the
  // preimage (those older pending journals must fail closed).
  if (input.after !== undefined) validateAssistantSnapshot(input.after, input.companyId);
  // Deleting one company's records cannot legitimately have a populated
  // assistant postimage. Reject a forged/incorrect recovery marker rather than
  // treating unrelated assistant writes as an authorized company clear.
  // Legacy markers without an after-image are still readable; the recovery
  // path already fails closed if their current state differs from the preimage.
  if (input.operation === 'company-clear' && input.after !== undefined &&
      (input.after.workflows.length || input.after.aliases.length || input.after.history.length)) {
    throw new Error('Invalid pending company-clear journal postimage. Stop and preserve this device.');
  }
  return input;
}

/**
 * The retail recovery marker is JSON while the assistant database uses the
 * structured-clone algorithm. Reject any values that would change or vanish
 * during that boundary: silently converting a Date, losing `undefined`, or
 * stringifying a non-finite number would make a preimage impossible to replay.
 * Keep the existing records' fields, but require plain, bounded JSON values.
 */
const MAX_SNAPSHOT_DEPTH = 32;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
function stableValue(value, depth = 0, ancestors = new WeakSet()) {
  if (depth > MAX_SNAPSHOT_DEPTH) throw new Error('Assistant recovery snapshot is too deeply nested. Preserve this device.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object') throw new Error('Assistant recovery snapshot contains a non-JSON value. Preserve this device.');
  if (ancestors.has(value)) throw new Error('Assistant recovery snapshot contains a cyclic value. Preserve this device.');
  if (Array.isArray(value)) {
    ancestors.add(value);
    try {
      if (Reflect.ownKeys(value).some(key => key !== 'length' &&
          (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length ||
           !Object.getOwnPropertyDescriptor(value, key)?.enumerable || !('value' in Object.getOwnPropertyDescriptor(value, key)))))
        throw new Error('Assistant recovery snapshot contains unsupported array fields. Preserve this device.');
      return Array.from(value, item => stableValue(item, depth + 1, ancestors));
    }
    finally { ancestors.delete(value); }
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error('Assistant recovery snapshot contains unsupported record fields. Preserve this device.');
  ancestors.add(value);
  try {
    const pairs = [];
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some(key => typeof key !== 'string'))
      throw new Error('Assistant recovery snapshot contains nonportable record fields. Preserve this device.');
    for (const key of ownKeys.sort()) {
      if (!Object.getOwnPropertyDescriptor(value, key)?.enumerable ||
          !('value' in Object.getOwnPropertyDescriptor(value, key)))
        throw new Error('Assistant recovery snapshot contains nonportable record fields. Preserve this device.');
      if (UNSAFE_KEYS.has(key)) throw new Error('Assistant recovery snapshot contains an unsafe record key. Preserve this device.');
      pairs.push([key, stableValue(value[key], depth + 1, ancestors)]);
    }
    return Object.fromEntries(pairs);
  } finally { ancestors.delete(value); }
}

/** Validates company ownership and JSON-roundtrippable snapshot values. */
export function validateAssistantSnapshot(snapshot, companyId) {
  if (!record(snapshot) || typeof companyId !== 'string' || !companyId.trim())
    throw new Error('Invalid pending backup restore journal. Stop and preserve this device.');
  if (Reflect.ownKeys(snapshot).some(key => !['workflows', 'aliases', 'history'].includes(key)))
    throw new Error('Invalid assistant recovery snapshot table. Stop and preserve this device.');
  for (const table of ['workflows', 'aliases', 'history']) {
    const rows = snapshot[table];
    if (!Array.isArray(rows)) throw new Error('Invalid pending backup restore journal. Stop and preserve this device.');
    const ids = new Set();
    for (const row of rows) {
      if (!record(row) || typeof row.id !== 'string' || !row.id.trim() || ids.has(row.id) ||
          row.businessProfileId !== companyId) throw new Error('Invalid pending backup restore journal. Stop and preserve this device.');
      ids.add(row.id);
      // A successful validation must mean JSON serialization and later
      // comparison preserve the entire record, not merely its owner/id.
      stableValue(row);
    }
  }
  return snapshot;
}

// IndexedDB index scans and structured-clone object keys have no stable order.
// Normalize both without coercing unsupported data into matching JSON values.
export function assistantSnapshotsEqual(left, right) {
  if (!record(left) || !record(right)) return false;
  if (Reflect.ownKeys(left).some(key => !['workflows','aliases','history'].includes(key)) ||
      Reflect.ownKeys(right).some(key => !['workflows','aliases','history'].includes(key))) return false;
  for (const table of ['workflows', 'aliases', 'history']) {
    if (!Array.isArray(left[table]) || !Array.isArray(right[table]) || left[table].length !== right[table].length) return false;
    const sortIds = rows => rows.map(row => stableValue(row)).sort((a,b) => String(a.id).localeCompare(String(b.id)));
    if (JSON.stringify(sortIds(left[table])) !== JSON.stringify(sortIds(right[table]))) return false;
  }
  return true;
}

export function parseRestoreJournal(value) {
  if (typeof value !== 'string' || exceedsJournalByteLimit(value))
    throw new Error('Pending restore journal exceeds the safe local recovery limit. Stop and preserve this device.');
  let candidate;
  try { candidate = JSON.parse(value); }
  catch { throw new Error('Pending restore journal is corrupt. Stop and preserve this device.'); }
  return validateRestoreJournal(candidate);
}

export function serializeRestoreJournal(journal) {
  validateRestoreJournal(journal);
  const text = JSON.stringify(journal);
  if (exceedsJournalByteLimit(text))
    throw new Error('Assistant recovery snapshot exceeds the safe local restore limit. Backup restore was not started.');
  return text;
}
