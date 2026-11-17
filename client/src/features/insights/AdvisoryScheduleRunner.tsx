import { useEffect } from "react";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { currentStaffId, STAFF_SESSION_CHANGED } from "@/features/staff/staff";
/** No background access while locked. The service rechecks authorization and
 * the due time inside one transaction, including when multiple tabs wake up. */
export function AdvisoryScheduleRunner({ companyId }: { companyId: string }) {
  useEffect(() => {
    let stopped = false,
      running = false;
    const tick = async () => {
      if (
        stopped ||
        running ||
        companyId !== getActiveBusinessProfileId() ||
        !currentStaffId(companyId)
      )
        return;
      running = true;
      try {
        const {readAdvisorySchedule,runDueAdvisorySchedule}=await import("./advisorySchedule");
        const schedule=await readAdvisorySchedule();
        if (
          stopped ||
          !schedule ||
          schedule.state !== "active" ||
          Date.parse(schedule.nextDueAt) > Date.now()
        )
          return;
        if (!stopped && companyId === getActiveBusinessProfileId()) {
          const result = await runDueAdvisorySchedule();
          if (result)
            window.dispatchEvent(new Event("tallybook:advisory-result"));
        }
      } catch {
        // Preserve the due schedule on failure. The owner's explicit check on
        // Insights reports the error; the next wake can retry the same due slot.
      } finally {
        running = false;
      }
    };
    const wake = () => {
      void tick();
    };
    wake();
    const timer = window.setInterval(wake, 60000);
    window.addEventListener(STAFF_SESSION_CHANGED, wake);
    window.addEventListener("focus", wake);
    window.addEventListener("tallybook:advisory-schedule-changed", wake);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener(STAFF_SESSION_CHANGED, wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("tallybook:advisory-schedule-changed", wake);
    };
  }, [companyId]);
  return null;
}
