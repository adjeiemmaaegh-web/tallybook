/** Read-only, schema-configured integrity assessment for Dexie-like databases. */
export type Severity = 'critical' | 'warning' | 'info';
export type IssueCode = 'READ_FAILED' | 'INVALID_RECORD' | 'MISSING_KEY' | 'DUPLICATE_KEY' | 'DUPLICATE_TRANSACTION_ID' | 'INVALID_FINANCIAL_VALUE' | 'BROKEN_REFERENCE' | 'INVALID_REFERENCE' | 'RECOVERY_RISK' | 'CHECK_FAILED' | 'CONFIG_ERROR';
export interface TableLike { toArray(): Promise<unknown[]>; }
export interface DatabaseLike { table(name: string): TableLike; transaction?: (...args: any[]) => Promise<unknown>; }
export type Path = string;
export interface FinancialRule { path: Path; allowNegative?: boolean; allowZero?: boolean; integer?: boolean; max?: number; }
export interface ReferenceRule { path: Path; targetTable: string; targetPath: Path; optional?: boolean; many?: boolean; }
export interface TableRules {
  name: string;
  key?: Path;
  transactionIds?: Path[];
  financial?: FinancialRule[];
  references?: ReferenceRule[];
  validate?: (record: Record<string, unknown>) => string | undefined;
}
export interface RecoveryRules {
  requiredTables?: string[];
  minimumRecords?: Record<string, number>;
  backupPresent?: boolean | (() => boolean | Promise<boolean>);
  backupVerified?: boolean | (() => boolean | Promise<boolean>);
  backupAgeHours?: number;
  maximumBackupAgeHours?: number;
}
export interface Options { tables: TableRules[]; recovery?: RecoveryRules; maxIssues?: number; signal?: AbortSignal; }
export interface Issue { code: IssueCode; severity: Severity; table?: string; recordIndex?: number; path?: string; message: string; }
export interface Report { status: 'clean' | 'issues' | 'incomplete'; issues: Issue[]; scanned: Record<string, number>; startedAt: string; completedAt: string; truncated: boolean; complete: boolean; }

const objectRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
const identity = (v: unknown): string | undefined => {
  if (typeof v === 'string' && v.trim()) return `s:${v}`;
  if (typeof v === 'number' && Number.isFinite(v)) return `n:${v}`;
  if (typeof v === 'bigint') return `b:${v}`;
  return undefined;
};
function valueAt(obj: unknown, path: string): unknown {
  if (!path || path.split('.').some(p => !p || p === '__proto__' || p === 'constructor' || p === 'prototype')) return undefined;
  return path.split('.').reduce<unknown>((v, p) => objectRecord(v) ? Object.prototype.hasOwnProperty.call(v, p) ? v[p] : undefined : undefined, obj);
}
function validPath(path: string): boolean { return typeof path === 'string' && path.length > 0 && path.split('.').every(p => !!p && !['__proto__', 'constructor', 'prototype'].includes(p)); }
function assertConfig(options: Options): void {
  if (!options || !Array.isArray(options.tables) || !options.tables.length) throw new Error('At least one table definition is required');
  if (options.maxIssues !== undefined && (!Number.isSafeInteger(options.maxIssues) || options.maxIssues < 1)) throw new Error('maxIssues must be a positive safe integer');
  const names = new Set<string>();
  for (const t of options.tables) {
    if (!t || typeof t.name !== 'string' || !t.name.trim() || names.has(t.name)) throw new Error('Invalid or duplicate table name');
    names.add(t.name);
    for (const p of [t.key, ...(t.transactionIds ?? []), ...(t.financial ?? []).map(f => f.path), ...(t.references ?? []).flatMap(r => [r.path, r.targetPath])].filter((p): p is string => p !== undefined)) if (!validPath(p)) throw new Error(`Invalid field path in ${t.name}`);
    for (const r of t.references ?? []) if (!r.targetTable || typeof r.targetTable !== 'string') throw new Error(`Invalid reference target in ${t.name}`);
  }
}
/** Does not invoke Dexie writes or create backups. A concurrent writer may change data between table reads. */
export async function assessIntegrity(db: DatabaseLike, options: Options): Promise<Report> {
  assertConfig(options);
  const startedAt = new Date().toISOString();
  const issues: Issue[] = [], scanned: Record<string, number> = {}, snapshots = new Map<string, unknown[]>();
  const limit = options.maxIssues ?? 10000;
  let truncated = false, complete = true;
  const emit = (issue: Issue) => { if (issues.length < limit) issues.push(issue); else { truncated = true; complete = false; } };
  const abort = () => { if (options.signal?.aborted) throw new Error('Integrity assessment aborted'); };
  for (const t of options.tables) {
    abort();
    try {
      const rows = await db.table(t.name).toArray();
      if (!Array.isArray(rows)) throw new Error('toArray did not return an array');
      snapshots.set(t.name, rows); scanned[t.name] = rows.length;
    } catch (e) {
      complete = false;
      emit({ code: 'READ_FAILED', severity: 'critical', table: t.name, message: `Unable to read table: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  const indexCache = new Map<string, Set<string>>();
  const index = (table: string, path: string): Set<string> | undefined => {
    const rows = snapshots.get(table); if (!rows) return undefined;
    const cacheKey = JSON.stringify([table, path]);
    if (!indexCache.has(cacheKey)) {
      const keys = new Set<string>();
      for (const row of rows) { const id = identity(valueAt(row, path)); if (id !== undefined) keys.add(id); }
      indexCache.set(cacheKey, keys);
    }
    return indexCache.get(cacheKey);
  };
  // Transaction IDs are scoped to their configured field, across every scanned table using that field.
  const txSeen = new Map<string, string>();
  for (const t of options.tables) {
    const rows = snapshots.get(t.name); if (!rows) continue;
    const keySeen = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      abort();
      const row = rows[i];
      const add = (code: IssueCode, severity: Severity, path: string | undefined, message: string) => emit({ code, severity, table: t.name, recordIndex: i, path, message });
      if (!objectRecord(row)) { add('INVALID_RECORD', 'critical', undefined, 'Record must be a non-null plain object-like value'); continue; }
      if (t.key) {
        const key = identity(valueAt(row, t.key));
        if (key === undefined) add('MISSING_KEY', 'critical', t.key, 'Missing or invalid primary identity');
        else if (keySeen.has(key)) add('DUPLICATE_KEY', 'critical', t.key, 'Duplicate configured identity');
        else keySeen.add(key);
      }
      for (const path of t.transactionIds ?? []) {
        const id = identity(valueAt(row, path));
        if (id === undefined) { add('MISSING_KEY', 'critical', path, 'Missing or invalid transaction identifier'); continue; }
        const scope = JSON.stringify([path, id]);
        if (txSeen.has(scope)) add('DUPLICATE_TRANSACTION_ID', 'critical', path, `Duplicate transaction identifier (first at ${txSeen.get(scope)})`);
        else txSeen.set(scope, `${t.name}[${i}]`);
      }
      for (const f of t.financial ?? []) {
        const v = valueAt(row, f.path);
        if (typeof v !== 'number' || !Number.isFinite(v) || (f.integer && !Number.isSafeInteger(v)) || (!f.allowNegative && v < 0) || (f.allowZero === false && v === 0) || (f.max !== undefined && v > f.max))
          add('INVALID_FINANCIAL_VALUE', 'critical', f.path, 'Financial value violates configured numeric constraints');
      }
      for (const r of t.references ?? []) {
        const raw = valueAt(row, r.path);
        if ((raw === null || raw === undefined || raw === '') && r.optional) continue;
        const refs = r.many ? (Array.isArray(raw) ? raw : null) : [raw];
        if (!refs) { add('INVALID_REFERENCE', 'critical', r.path, 'Expected an array of references'); continue; }
        const targets = index(r.targetTable, r.targetPath);
        if (!targets) { complete = false; add('CONFIG_ERROR', 'critical', r.path, `Target table ${r.targetTable} was not scanned`); continue; }
        for (const ref of refs) {
          const id = identity(ref);
          if (id === undefined) add('INVALID_REFERENCE', 'critical', r.path, 'Invalid reference identifier');
          else if (!targets.has(id)) add('BROKEN_REFERENCE', 'critical', r.path, `Reference not found in ${r.targetTable}.${r.targetPath}`);
        }
      }
      if (t.validate) {
        try { const error = t.validate(row); if (error) add('INVALID_RECORD', 'warning', undefined, String(error)); }
        catch (e) { complete = false; add('CHECK_FAILED', 'critical', undefined, `Custom validator failed: ${e instanceof Error ? e.message : String(e)}`); }
      }
    }
  }
  const recovery = options.recovery;
  if (recovery) {
    for (const table of recovery.requiredTables ?? []) if (!snapshots.has(table)) { complete = false; emit({ code: 'RECOVERY_RISK', severity: 'critical', table, message: 'Required table unavailable for recovery assessment' }); }
    for (const [table, min] of Object.entries(recovery.minimumRecords ?? {})) if (!snapshots.has(table) || snapshots.get(table)!.length < min) emit({ code: 'RECOVERY_RISK', severity: 'warning', table, message: `Fewer than ${min} records available` });
    for (const [name, check] of [['backupPresent', recovery.backupPresent], ['backupVerified', recovery.backupVerified]] as const) {
      if (check !== undefined) {
        try { const result = typeof check === 'function' ? await check() : check; if (result !== true) emit({ code: 'RECOVERY_RISK', severity: 'critical', message: `${name} is not confirmed` }); }
        catch (e) { complete = false; emit({ code: 'CHECK_FAILED', severity: 'critical', message: `${name} check failed: ${e instanceof Error ? e.message : String(e)}` }); }
      }
    }
    if (recovery.maximumBackupAgeHours !== undefined && (recovery.backupAgeHours === undefined || !Number.isFinite(recovery.backupAgeHours) || recovery.backupAgeHours < 0 || recovery.backupAgeHours > recovery.maximumBackupAgeHours)) emit({ code: 'RECOVERY_RISK', severity: 'warning', message: 'Backup age is missing, invalid, or exceeds configured maximum' });
  }
  return { status: !complete ? 'incomplete' : issues.length ? 'issues' : 'clean', issues, scanned, startedAt, completedAt: new Date().toISOString(), truncated, complete };
}
