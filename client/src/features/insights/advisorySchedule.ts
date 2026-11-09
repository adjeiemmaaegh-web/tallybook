import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { currentStaffId, requirePermission } from "@/features/staff/staff";
import { withCoordinatedRetailWrite } from "@/features/backup/coordinatedRetailWrite";
import { assertRun7RetailWriteReady } from "@/features/backup/run7RetailWriteBarrier.mjs";
import { getInsightFindings } from "./insightEvidence";
import {
  validateAdvisorySchedule,
  type AdvisorySchedule,
  type AdvisoryKind,
  type ScheduledFinding,
} from "./advisoryScheduleRules";
function checkScope(company: string, staff: string) {
  if (
    getActiveBusinessProfileId() !== company ||
    currentStaffId(company) !== staff
  )
    throw Error("Company or owner session changed during scheduled review.");
}
async function owner(database: TallybookDB, company: string) {
  const actor = await requirePermission("reports", database, company);
  if (!actor || actor.role !== "owner" || currentStaffId(company) !== actor.id)
    throw Error("Unlock the company owner to manage scheduled reviews.");
  return actor;
}
export async function readAdvisorySchedule(database: TallybookDB = db) {
  const company = getActiveBusinessProfileId();
  return database.transaction(
    "r",
    [database.businessProfiles, database.staffMembers],
    async () => {
      const actor = await owner(database, company);
      const value = (await database.businessProfiles.get(company))
        ?.advisorySchedule;
      validateAdvisorySchedule(value, company);
      checkScope(company, actor.id);
      return value;
    }
  );
}
export async function configureAdvisorySchedule(
  input: {
    state: AdvisorySchedule["state"];
    intervalHours: 24 | 168;
    kinds: AdvisoryKind[];
  },
  database: TallybookDB = db,
  now = new Date()
) {
  const company = getActiveBusinessProfileId(),
    at = now.toISOString();
  return withCoordinatedRetailWrite(() =>
    database.transaction(
      "rw",
      [
        database.appMeta,
        database.businessProfiles,
        database.staffMembers,
        database.staffAudits,
      ],
      async () => {
        await assertRun7RetailWriteReady(database.appMeta);
        const actor = await owner(database, company);
        const profile = await database.businessProfiles.get(company);
        if (!profile) throw Error("Set up this business first.");
        validateAdvisorySchedule(profile.advisorySchedule, company);
        const previous = profile.advisorySchedule;
        const schedule: AdvisorySchedule = {
          version: 1,
          companyId: company,
          ownerStaffId: actor.id,
          revision: (previous?.revision ?? 0) + 1,
          state: input.state,
          intervalHours: input.intervalHours,
          kinds: [...input.kinds],
          nextDueAt: at,
          updatedAt: at,
          ...(previous?.lastRun ? { lastRun: previous.lastRun } : {}),
        };
        validateAdvisorySchedule(schedule, company);
        checkScope(company, actor.id);
        await database.businessProfiles.update(company, {
          advisorySchedule: schedule,
        });
        await database.staffAudits.add({
          id: crypto.randomUUID(),
          businessProfileId: company,
          staffId: actor.id,
          action: "insights.schedule." + input.state,
          createdAt: at,
          details: `revision:${schedule.revision};interval:${schedule.intervalHours};kinds:${schedule.kinds.join(",")};advisory-only`,
        });
        checkScope(company, actor.id);
        return schedule;
      }
    )
  );
}
/** One catch-up snapshot when due. No replay storm after time spent offline,
 * no execution with a locked/revoked owner, and no writes to business ledgers. */
export async function runDueAdvisorySchedule(
  database: TallybookDB = db,
  now = new Date()
) {
  const company = getActiveBusinessProfileId(),
    at = now.toISOString();
  return withCoordinatedRetailWrite(() =>
    database.transaction("rw", database.tables, async () => {
      await assertRun7RetailWriteReady(database.appMeta);
      const profile = await database.businessProfiles.get(company),
        schedule = profile?.advisorySchedule;
      if (!schedule) return null;
      validateAdvisorySchedule(schedule, company);
      if (
        schedule.state !== "active" ||
        Date.parse(schedule.nextDueAt) > now.getTime()
      )
        return null;
      const actor = await owner(database, company);
      if (actor.id !== schedule.ownerStaffId)
        throw Error("The current owner must explicitly adopt this schedule.");
      const findings = (
        await getInsightFindings("last7", now, database)
      ).filter(f => schedule.kinds.includes(f.kind as AdvisoryKind));
      const result = {
        id: `advisory:${schedule.revision}:${schedule.nextDueAt}`,
        dueAt: schedule.nextDueAt,
        completedAt: at,
        findings: findings
          .slice(0, 100)
          .map(f => ({
            id: f.id,
            kind: f.kind as AdvisoryKind,
            title: f.title,
            evidence: f.evidence,
            href: f.href,
          })) as ScheduledFinding[],
        totalFindings: findings.length,
      };
      const saved: AdvisorySchedule = {
        ...schedule,
        nextDueAt: new Date(
          now.getTime() + schedule.intervalHours * 3600000
        ).toISOString(),
        updatedAt: at,
        lastRun: result,
      };
      validateAdvisorySchedule(saved, company);
      checkScope(company, actor.id);
      await database.businessProfiles.update(company, {
        advisorySchedule: saved,
      });
      await database.staffAudits.add({
        id: crypto.randomUUID(),
        businessProfileId: company,
        staffId: actor.id,
        action: "insights.schedule.reviewed",
        createdAt: at,
        details: `${result.id};findings:${result.totalFindings};advisory-only`,
      });
      checkScope(company, actor.id);
      return result;
    })
  );
}
