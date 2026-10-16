import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { CloudBusinessPanel } from "@/cloud/CloudBusinessPanel";
import { db } from "@/db/TallybookDB";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { getLocalSyncStatus, type SyncStatusSnapshot } from "@/features/sync/syncStatus";
import {Run14EncryptedRelayPanel} from "@/features/sync/Run14EncryptedRelayPanel";

export default function SyncStatusPage() {
  const { profile, activeCompanyId } = useBusinessProfile();
  const [status, setStatus] = useState<SyncStatusSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setStatus(null); setError(null);
    if (!profile || !activeCompanyId) return;
    const company = activeCompanyId;
    setLoading(true);
    try {
      const result = await getLocalSyncStatus(db, company);
      if (company === getActiveBusinessProfileId()) setStatus(result);
    } catch (cause) {
      if (company === getActiveBusinessProfileId()) setError(cause instanceof Error ? cause.message : "Could not inspect local synchronization records.");
    } finally { setLoading(false); }
  }, [activeCompanyId, profile]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const callback = () => { void refresh(); };
    window.addEventListener("focus", callback);
    return () => window.removeEventListener("focus", callback);
  }, [refresh]);
  const metrics: Array<[string, number]> = status ? [
    ["Pending local events", status.pendingEvents],
    ["Locally marked acknowledged", status.acknowledgedLocally],
    ["Active local devices", status.activeDevices],
    ["Revoked local devices", status.revokedDevices],
    ["Unresolved conflicts", status.unresolvedConflicts],
    ["Reviewed conflicts", status.reviewedConflicts],
  ] : [];
  return <section className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
    <header className="space-y-2"><p className="text-sm font-semibold uppercase tracking-wide">Stage 8 · Connected services</p>
      <h1 className="text-3xl font-bold">Local sync status</h1>
      <p className="text-sm">Read-only diagnostics for this business on this device. Automatic record upload is not configured.</p>
    </header>
    <CloudBusinessPanel />
    {activeCompanyId?<Run14EncryptedRelayPanel key={activeCompanyId} companyId={activeCompanyId}/>:null}
    {!profile ? <p role="status">Set up a business to inspect its local sync records. <Link href="/business" className="underline">Business setup</Link></p> : <>
      <button type="button" className="rounded border px-4 py-3 font-semibold" onClick={() => void refresh()} disabled={loading}>{loading ? "Checking…" : "Refresh status"}</button>
      {error ? <div role="alert" className="rounded border p-4"><strong>Synchronization records need attention.</strong><p>{error}</p></div> :
        loading ? <p role="status">Reading local records…</p> : status ? <>
          <p className="rounded border p-4" role="status"><strong>Consent: {status.consentEnabled ? "Enabled locally" : "Not enabled"}.</strong> Remote connection: not configured. Neither locally acknowledged events nor registered devices prove that a server accepted any data.</p>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{metrics.map(([label, count]) => <div key={label} className="rounded border p-4"><dt className="text-sm">{label}</dt><dd className="text-2xl font-semibold tabular-nums">{count}</dd></div>)}</dl>
          <p className="text-sm">Most recent pending event: {status.newestPendingAt ? new Date(status.newestPendingAt).toLocaleString() : "None"}</p>
          <div className="rounded border p-4 space-y-2"><h2 className="font-semibold">Requirements before connecting devices</h2><p className="text-sm">Authenticated organization identity, server-side device permissions, durable delivery acknowledgement, encrypted transport and tested conflict resolution are still required.</p><p className="text-sm">Offline sales remain independent of connected services.</p></div>
        </> : null}
      <Link href="/backup" className="inline-block underline">Local backup and restore</Link>
    </>}
  </section>;
}
