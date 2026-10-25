/** Standalone, read-only, adapter-driven security validation for Tallybook V19. */
export type Decision = 'allow' | 'deny';
export type Severity = 'info' | 'warning' | 'critical';
export type Operation = string;
export interface Principal { id: string; companyId: string; roles: readonly string[]; sessionId?: string }
export interface Session { id: string; principalId: string; companyId: string; issuedAt: number; expiresAt: number; revoked?: boolean }
export interface AccessRequest { principal: Principal | null; companyId: string; operation: Operation; resourceCompanyId?: string; financial?: boolean; amount?: number; sessionId?: string; now?: number; requestId?: string }
export interface Finding { code: string; severity: Severity; message: string }
export interface AuditEntry { at: number; requestId?: string; principalId?: string; companyId: string; operation: string; decision: Decision; findings: Finding[] }
export interface SecurityReport { decision: Decision; findings: Finding[]; audit: AuditEntry; suspicious: boolean }
/** Database adapter is read-only. Implementations MUST NOT mutate records. */
export interface DatabaseAdapter {
  companyExists(companyId: string): Promise<boolean>;
  staffBelongsToCompany(principalId: string, companyId: string): Promise<boolean>;
  getSession(sessionId: string): Promise<Session | null>;
  /** Optional: verifies target record ownership from existing database. */
  resourceBelongsToCompany?(request: AccessRequest): Promise<boolean>;
}
/** Integrates existing authorization logic without prescribing role/permission schemas. */
export interface AuthorizationAdapter {
  isRoleValid(principal: Principal, role: string, companyId: string): Promise<boolean>;
  hasPermission(principal: Principal, operation: string, companyId: string): Promise<boolean>;
  canPerformFinancialOperation?(request: AccessRequest): Promise<boolean>;
}
export interface SecurityOptions {
  requireSession?: boolean;
  maxSessionAgeMs?: number;
  maxFailedAttempts?: number;
  failedAttemptWindowMs?: number;
  maxAuditEntries?: number;
  now?: () => number;
  /** Optional external sink: receive redacted audit entries, never credentials. */
  onAudit?: (entry: AuditEntry) => void | Promise<void>;
}
export class SecurityValidator {
  private readonly history: AuditEntry[] = [];
  private readonly attempts = new Map<string, number[]>();
  private readonly config: Required<Omit<SecurityOptions, 'onAudit'>> & Pick<SecurityOptions, 'onAudit'>;
  constructor(private readonly db: DatabaseAdapter, private readonly auth: AuthorizationAdapter, options: SecurityOptions = {}) {
    this.config = {
      requireSession: options.requireSession ?? true,
      maxSessionAgeMs: options.maxSessionAgeMs ?? 24 * 60 * 60 * 1000,
      maxFailedAttempts: options.maxFailedAttempts ?? 5,
      failedAttemptWindowMs: options.failedAttemptWindowMs ?? 5 * 60 * 1000,
      maxAuditEntries: options.maxAuditEntries ?? 1000,
      now: options.now ?? Date.now,
      onAudit: options.onAudit
    };
    if (!Number.isSafeInteger(this.config.maxFailedAttempts) || this.config.maxFailedAttempts < 1 ||
      !Number.isSafeInteger(this.config.failedAttemptWindowMs) || this.config.failedAttemptWindowMs < 1 ||
      !Number.isSafeInteger(this.config.maxSessionAgeMs) || this.config.maxSessionAgeMs < 1 ||
      !Number.isSafeInteger(this.config.maxAuditEntries) || this.config.maxAuditEntries < 1) throw new Error('Invalid security options');
  }
  getAuditReport(): AuditEntry[] { return this.history.map(e => ({ ...e, findings: e.findings.map(f => ({...f})) })); }
  clearAuditReport(): void { this.history.length = 0; }
  async validate(request: AccessRequest): Promise<SecurityReport> {
    const now = request.now ?? this.config.now();
    const findings: Finding[] = [];
    const add = (code: string, severity: Severity, message: string) => findings.push({ code, severity, message });
    const principal = request.principal;
    const key = `${principal?.id ?? 'anonymous'}\u0000${request.companyId}`;
    const prior = (this.attempts.get(key) ?? []).filter(t => now - t >= 0 && now - t <= this.config.failedAttemptWindowMs);
    // A caller must not be able to override the trusted clock for session checks.
    const trustedNow = this.config.now();
    if (!Number.isFinite(now) || !Number.isFinite(trustedNow) || Math.abs(now - trustedNow) > 1000) add('INVALID_TIME', 'critical', 'Invalid request time');
    if (!principal?.id || !principal.companyId || !request.companyId || !request.operation) add('INVALID_REQUEST', 'critical', 'Missing identity, company, or operation');
    if (prior.length >= this.config.maxFailedAttempts) add('SUSPICIOUS_ATTEMPTS', 'critical', 'Repeated denied access attempts');
    if (principal && principal.companyId !== request.companyId) add('COMPANY_ISOLATION', 'critical', 'Principal company does not match requested company');
    if (request.resourceCompanyId !== undefined && request.resourceCompanyId !== request.companyId) add('RESOURCE_ISOLATION', 'critical', 'Resource company does not match requested company');
    if (request.financial && (request.amount === undefined || !Number.isSafeInteger(request.amount) || request.amount < 0)) add('INVALID_FINANCIAL_AMOUNT', 'critical', 'Financial amount must be a nonnegative safe integer in minor units');
    if (findings.length === 0 && principal) {
      try {
        if (!await this.db.companyExists(request.companyId)) add('UNKNOWN_COMPANY', 'critical', 'Company not found');
        if (!await this.db.staffBelongsToCompany(principal.id, request.companyId)) add('STAFF_ISOLATION', 'critical', 'Staff membership not verified');
        if (this.config.requireSession) {
          const sessionId = request.sessionId ?? principal.sessionId;
          if (!sessionId || (request.sessionId && principal.sessionId && request.sessionId !== principal.sessionId)) add('SESSION_INVALID', 'critical', 'Missing or inconsistent session');
          else {
            const session = await this.db.getSession(sessionId);
            if (!session || session.revoked || session.id !== sessionId || session.principalId !== principal.id || session.companyId !== request.companyId ||
              !Number.isFinite(session.issuedAt) || !Number.isFinite(session.expiresAt) || session.issuedAt > trustedNow ||
              session.expiresAt <= trustedNow || session.expiresAt <= session.issuedAt || trustedNow - session.issuedAt > this.config.maxSessionAgeMs) {
              add('SESSION_INVALID', 'critical', 'Session is missing, expired, revoked, or mismatched');
            }
          }
        }
        if (request.resourceCompanyId === undefined && this.db.resourceBelongsToCompany && !await this.db.resourceBelongsToCompany(request)) add('RESOURCE_ISOLATION', 'critical', 'Resource ownership not verified');
        if (!principal.roles.length || !(await Promise.all(principal.roles.map(r => this.auth.isRoleValid(principal, r, request.companyId)))).every(Boolean)) add('ROLE_INVALID', 'critical', 'One or more staff roles not verified');
        if (!await this.auth.hasPermission(principal, request.operation, request.companyId)) add('PERMISSION_DENIED', 'critical', 'Operation not permitted');
        if (request.financial) {
          if (!this.auth.canPerformFinancialOperation || !await this.auth.canPerformFinancialOperation(request)) add('FINANCIAL_DENIED', 'critical', 'Financial authorization not verified');
        }
      } catch { add('ADAPTER_FAILURE', 'critical', 'Security adapter failed; access denied'); }
    }
    const decision: Decision = findings.length ? 'deny' : 'allow';
    if (decision === 'deny') {
      prior.push(trustedNow);
      this.attempts.set(key, prior);
    } else this.attempts.delete(key);
    // Limit tracked identities to avoid unbounded memory growth.
    if (this.attempts.size > this.config.maxAuditEntries) this.attempts.delete(this.attempts.keys().next().value!);
    const audit: AuditEntry = { at: trustedNow, requestId: request.requestId, principalId: principal?.id, companyId: request.companyId, operation: request.operation, decision, findings: findings.map(f => ({ ...f })) };
    this.history.push(audit);
    if (this.history.length > this.config.maxAuditEntries) this.history.shift();
    try { await this.config.onAudit?.({ ...audit, findings: audit.findings.map(f => ({...f})) }); } catch { /* audit sink errors must not alter decision; see integration guide */ }
    return { decision, findings, audit: { ...audit, findings: audit.findings.map(f => ({...f})) }, suspicious: findings.some(f => f.code === 'SUSPICIOUS_ATTEMPTS' || f.code === 'COMPANY_ISOLATION' || f.code === 'RESOURCE_ISOLATION') };
  }
}
