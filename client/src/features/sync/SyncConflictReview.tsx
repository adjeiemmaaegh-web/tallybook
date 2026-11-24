/** Owner review of recorded sync conflicts. Resolutions are permanent, audited, and never change money or stock. */
import { useCallback, useEffect, useState } from "react";
import type { TallybookDB } from "@/db/TallybookDB";
import { listUnresolvedSyncConflicts, resolveSyncConflict, SYNC_CONFLICT_DECISIONS, type SyncConflict, type SyncConflictDecision } from "./reconciliation";

const REASON: Record<SyncConflict["reason"], string> = {
  "payload-mismatch": "Another device reported different details for a record this device already has.",
  "operation-collision": "The same operation arrived again under a different event.",
  "unknown-event": "Another device reported a record this device has never seen.",
};
const DECISION: Record<SyncConflictDecision, string> = {
  "keep-local": "Keep this device's record (do not adopt the other report)",
  "duplicate-delivery": "It is the same operation delivered twice",
  "escalate": "Needs checking on the server (keep as escalated evidence)",
};

export function SyncConflictReview({ database, companyId, onChanged }: { database: TallybookDB; companyId: string; onChanged?: () => void }) {
  const [rows, setRows] = useState<SyncConflict[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, { decision?: SyncConflictDecision; note: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try { setRows(await listUnresolvedSyncConflicts(database, companyId)); }
    catch { setRows(null); setError("Unlock the owner account to review sync conflicts."); }
  }, [database, companyId]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <p role="status" className="rounded border p-4 text-sm">{error}</p>;
  if (!rows) return null;
  if (!rows.length) return <p role="status" className="text-sm">No unresolved sync conflicts.</p>;
  return (
    <section aria-labelledby="sync-conflicts-heading" className="space-y-3 rounded border p-4">
      <h2 id="sync-conflicts-heading" className="font-semibold">Review sync conflicts</h2>
      <p className="text-sm">Your decision is recorded with your name and reason and cannot be changed later. It never changes sales, payments or stock.</p>
      <ul className="space-y-3">
        {rows.map(c => {
          const cur = choice[c.id] ?? { note: "" };
          const allowed = SYNC_CONFLICT_DECISIONS[c.reason];
          return (
            <li key={c.id} className="space-y-2 rounded border p-3">
              <p className="text-sm font-medium">{REASON[c.reason]}</p>
              <p className="text-xs">Detected {new Date(c.detectedAt).toLocaleString()} · event {c.eventId}</p>
              <fieldset className="space-y-1">
                <legend className="text-sm">Decision</legend>
                {allowed.map(d => (
                  <label key={d} className="flex items-center gap-2 text-sm">
                    <input type="radio" name={`decision-${c.id}`} value={d} checked={cur.decision === d}
                      onChange={() => setChoice({ ...choice, [c.id]: { ...cur, decision: d } })} />{DECISION[d]}
                  </label>
                ))}
              </fieldset>
              <label className="block text-sm"><span>Reason for the record</span>
                <textarea aria-label={`Reason for conflict ${c.eventId}`} className="mt-1 w-full rounded border bg-background p-2 min-h-11" maxLength={280}
                  value={cur.note} onChange={e => setChoice({ ...choice, [c.id]: { ...cur, note: e.target.value } })} /></label>
              <button type="button" className="primary-action min-h-11" disabled={!cur.decision || cur.note.trim().length < 3 || busy !== null}
                onClick={async () => {
                  setBusy(c.id); setError(null);
                  try { await resolveSyncConflict(database, c.id, { decision: cur.decision!, note: cur.note }); await load(); onChanged?.(); }
                  catch (e) { setError(e instanceof Error ? e.message : "The decision was not saved."); }
                  finally { setBusy(null); }
                }}>Save decision</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
