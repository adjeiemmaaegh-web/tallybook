import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import {
  configureAdvisorySchedule,
  readAdvisorySchedule,
  runDueAdvisorySchedule,
} from "./advisorySchedule";
import {
  ADVISORY_KINDS,
  type AdvisoryKind,
  type AdvisorySchedule,
} from "./advisoryScheduleRules";
export const ADVISORY_SCHEDULE_CHANGED = "tallybook:advisory-schedule-changed";
export function ScheduledAdvisories({ companyId }: { companyId: string }) {
  const [schedule, setSchedule] = useState<AdvisorySchedule>();
  const [intervalHours, setInterval] = useState<24 | 168>(24);
  const [kinds, setKinds] = useState<AdvisoryKind[]>([
    "stock",
    "debt",
    "expiry",
  ]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const value = await readAdvisorySchedule();
    if (companyId !== getActiveBusinessProfileId()) return;
    setSchedule(value);
    if (value) {
      setInterval(value.intervalHours);
      setKinds(value.kinds);
    }
  }, [companyId]);
  useEffect(() => {
    let live = true;
    const reload = () => {
      void refresh().catch(e => {
        if (live)
          setError(
            e instanceof Error ? e.message : "Cannot read scheduled reviews."
          );
      });
    };
    reload();
    window.addEventListener("tallybook:advisory-result", reload);
    return () => {
      live = false;
      window.removeEventListener("tallybook:advisory-result", reload);
    };
  }, [refresh]);
  const act = async (work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (companyId !== getActiveBusinessProfileId())
        throw Error("Company changed.");
      await work();
      await refresh();
      window.dispatchEvent(new Event(ADVISORY_SCHEDULE_CHANGED));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="space-y-3 rounded border p-4"
      aria-label="Scheduled advisory reviews"
    >
      <h2 className="text-lg font-semibold">Scheduled local reviews</h2>
      <p>
        Opt in to a saved stock, debt and expiry review while this app is open
        and the owner is unlocked. After time offline or closed, one catch-up
        review runs. These reminders never send messages or change money, stock
        or orders.
      </p>
      {error && <p role="alert">{error}</p>}
      <label className="block">
        Review frequency
        <select
          className="ml-2 rounded border p-2"
          value={intervalHours}
          onChange={e => setInterval(Number(e.target.value) as 24 | 168)}
        >
          <option value={24}>Daily</option>
          <option value={168}>Weekly</option>
        </select>
      </label>
      <fieldset className="flex flex-wrap gap-3">
        <legend>Include in the review</legend>
        {ADVISORY_KINDS.map(kind => (
          <label key={kind}>
            <input
              type="checkbox"
              checked={kinds.includes(kind)}
              onChange={e =>
                setKinds(old =>
                  e.target.checked
                    ? [...old, kind]
                    : old.filter(k => k !== kind)
                )
              }
            />{" "}
            {kind}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded border p-2"
          disabled={busy || !kinds.length}
          onClick={() =>
            void act(() =>
              configureAdvisorySchedule({
                state: "active",
                intervalHours,
                kinds,
              })
            )
          }
        >
          Enable / update owner-approved reviews
        </button>
        {schedule && (
          <>
            <button
              className="rounded border p-2"
              disabled={busy || schedule.state !== "active"}
              onClick={() =>
                void act(() =>
                  configureAdvisorySchedule({ ...schedule, state: "paused" })
                )
              }
            >
              Pause reviews
            </button>
            <button
              className="rounded border p-2"
              disabled={busy || schedule.state === "cancelled"}
              onClick={() =>
                void act(() =>
                  configureAdvisorySchedule({ ...schedule, state: "cancelled" })
                )
              }
            >
              Cancel schedule
            </button>
            <button
              className="rounded border p-2"
              disabled={busy || schedule.state !== "active"}
              onClick={() => void act(() => runDueAdvisorySchedule())}
            >
              Check due review now
            </button>
          </>
        )}
      </div>
      <p role="status">
        {schedule
          ? `Schedule ${schedule.state}. Next due: ${new Date(schedule.nextDueAt).toLocaleString()}.`
          : "Scheduling is off until the owner opts in."}
      </p>
      {schedule?.lastRun && (
        <div>
          <p>
            Last review:{" "}
            {new Date(schedule.lastRun.completedAt).toLocaleString()} ·{" "}
            {schedule.lastRun.totalFindings} findings
            {schedule.lastRun.totalFindings > 100
              ? " (showing the first 100)"
              : ""}
            .
          </p>
          <ul className="space-y-2">
            {schedule.lastRun.findings.map(f => (
              <li className="rounded border p-2" key={f.id}>
                <strong>{f.title}</strong>
                <p>{f.evidence}</p>
                <Link className="underline" href={f.href}>
                  Review supporting records
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
