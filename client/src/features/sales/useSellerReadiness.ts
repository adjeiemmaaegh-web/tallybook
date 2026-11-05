import { useEffect, useState } from "react";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { currentStaffId, STAFF_SESSION_CHANGED } from "@/features/staff/staff";

/** What the till still needs before a sale can be saved. Every sale is attributed to an unlocked staff member's open shift. */
export type SellerReadiness = "checking" | "ready" | "no-staff" | "locked" | "no-shift";

export async function readSellerReadiness(companyId: string, database: TallybookDB = db): Promise<SellerReadiness> {
  const staffId = currentStaffId(companyId);
  if (!staffId) {
    const members = await database.staffMembers.where("businessProfileId").equals(companyId).filter(member => !member.disabledAt).count();
    return members ? "locked" : "no-staff";
  }
  const shift = await database.staffShifts.where("staffId").equals(staffId).filter(row => row.businessProfileId === companyId && !row.closedAt).first();
  return shift ? "ready" : "no-shift";
}

export function useSellerReadiness(companyId: string | null | undefined, refreshKey: unknown = null): SellerReadiness {
  const [state, setState] = useState<SellerReadiness>("checking");
  useEffect(() => {
    if (!companyId) return;
    let live = true;
    const check = () => { void readSellerReadiness(companyId).then(next => { if (live) setState(next); }).catch(() => { if (live) setState("checking"); }); };
    check();
    window.addEventListener(STAFF_SESSION_CHANGED, check);
    window.addEventListener("focus", check);
    return () => { live = false; window.removeEventListener(STAFF_SESSION_CHANGED, check); window.removeEventListener("focus", check); };
  }, [companyId, refreshKey]);
  return state;
}
