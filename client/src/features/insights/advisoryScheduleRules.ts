/** The only scheduled action is a device-local advisory snapshot. */
export const ADVISORY_KINDS = [
  "stock",
  "debt",
  "repayment",
  "expiry",
  "reorder",
] as const;
export type AdvisoryKind = (typeof ADVISORY_KINDS)[number];
export interface ScheduledFinding {
  id: string;
  kind: AdvisoryKind;
  title: string;
  evidence: string;
  href: string;
}
export interface AdvisorySchedule {
  version: 1;
  companyId: string;
  ownerStaffId: string;
  revision: number;
  state: "active" | "paused" | "cancelled";
  intervalHours: 24 | 168;
  kinds: AdvisoryKind[];
  nextDueAt: string;
  updatedAt: string;
  lastRun?: {
    id: string;
    dueAt: string;
    completedAt: string;
    findings: ScheduledFinding[];
    totalFindings: number;
  };
}
const date = (value: unknown) =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const text = (value: unknown, max: number) =>
  typeof value === "string" && value.length > 0 && value.length <= max;
export function validateAdvisorySchedule(
  value: unknown,
  companyId: string
): asserts value is AdvisorySchedule | undefined {
  if (value === undefined) return;
  const s = value as AdvisorySchedule;
  if (
    !s ||
    s.version !== 1 ||
    s.companyId !== companyId ||
    !text(s.ownerStaffId, 200) ||
    !Number.isSafeInteger(s.revision) ||
    s.revision < 1 ||
    !["active", "paused", "cancelled"].includes(s.state) ||
    ![24, 168].includes(s.intervalHours) ||
    !Array.isArray(s.kinds) ||
    !s.kinds.length ||
    s.kinds.length > 5 ||
    new Set(s.kinds).size !== s.kinds.length ||
    s.kinds.some(k => !ADVISORY_KINDS.includes(k)) ||
    !date(s.nextDueAt) ||
    !date(s.updatedAt)
  )
    throw Error("Invalid company advisory schedule.");
  if (s.lastRun) {
    const r = s.lastRun;
    if (
      !text(r.id, 250) ||
      !date(r.dueAt) ||
      !date(r.completedAt) ||
      !Array.isArray(r.findings) ||
      r.findings.length > 100 ||
      !Number.isSafeInteger(r.totalFindings) ||
      r.totalFindings < r.findings.length ||
      r.findings.some(
        f =>
          !f ||
          !text(f.id, 250) ||
          !ADVISORY_KINDS.includes(f.kind) ||
          !text(f.title, 500) ||
          !text(f.evidence, 4000) ||
          !["/inventory", "/customers", "/reports"].includes(f.href)
      )
    )
      throw Error("Invalid saved advisory result.");
  }
}
