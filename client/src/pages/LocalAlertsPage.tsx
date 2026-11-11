import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { getInventorySnapshot } from "@/features/inventory/inventory";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { calculateStockAlerts, type StockAlert } from "@/features/inventory/localAlerts";
import { DEFAULT_ALERT_PREFERENCES, loadAlertPreferences, saveAlertPreferences, type AlertPreferences } from "@/features/inventory/alertPreferences";

export default function LocalAlertsPage() {
  const { profile, activeCompanyId } = useBusinessProfile();
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [preferences, setPreferences] = useState<AlertPreferences>(DEFAULT_ALERT_PREFERENCES);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  useEffect(() => {
    setPreferences(DEFAULT_ALERT_PREFERENCES); setPreferenceError(null);
    if (!activeCompanyId) return;
    try { setPreferences(loadAlertPreferences(activeCompanyId)); }
    catch (cause) { setPreferenceError(cause instanceof Error ? cause.message : "Unable to read alert settings."); }
  }, [activeCompanyId]);
  const updatePreference = (key: keyof AlertPreferences, enabled: boolean) => {
    if (!activeCompanyId || preferenceError) return;
    const next = { ...preferences, [key]: enabled };
    try { saveAlertPreferences(activeCompanyId, next); setPreferences(next); }
    catch (cause) { setPreferenceError(cause instanceof Error ? cause.message : "Unable to save alert settings."); }
  };
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const notifyOnThisDevice = async () => {
    if (!activeCompanyId || error || loading) return;
    if (typeof window === "undefined" || !("Notification" in window) || !window.isSecureContext) { setNotificationMessage("Device notifications are unavailable here; in-app alerts remain available."); return; }
    try {
      const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      if (permission !== "granted") { setNotificationMessage("Notification permission was not granted. You can still review alerts here."); return; }
      if (!visibleAlerts.length) { setNotificationMessage("No matching stock alerts to notify about."); return; }
      new Notification("Tallybook stock alerts", { body: `${visibleAlerts.length} product${visibleAlerts.length === 1 ? "" : "s"} need attention in ${profile?.name ?? "this business"}.` });
      setNotificationMessage("Notification sent while the app is open. No background delivery is configured.");
    } catch { setNotificationMessage("Could not display a device notification. In-app alerts remain available."); }
  };
  const visibleAlerts = alerts.filter(alert => alert.severity === "out" ? preferences.showOutOfStock : preferences.showLowStock);
  const refresh = useCallback(async () => {
    if (!profile) { setAlerts([]); setError(null); return; }
    setLoading(true); setAlerts([]); setError(null);
    try {
      const requestedCompanyId = activeCompanyId;
      const snapshot = await getInventorySnapshot();
      // Do not render results computed for a company that was switched during the read.
      if (requestedCompanyId !== getActiveBusinessProfileId()) return;
      setAlerts(calculateStockAlerts(snapshot.products));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to read local inventory.");
    } finally { setLoading(false); }
  }, [activeCompanyId, profile]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const onReturn = () => { void refresh(); };
    window.addEventListener("focus", onReturn);
    window.addEventListener("pageshow", onReturn);
    return () => { window.removeEventListener("focus", onReturn); window.removeEventListener("pageshow", onReturn); };
  }, [refresh]);
  return <section className="ds-page">
    <header><p className="text-sm font-semibold uppercase tracking-wide">Alerts</p>
      <h1 className="text-3xl font-bold">Stock needing attention</h1>
      <p className="mt-2 text-sm">Read-only alerts from this business's saved inventory on this device. No internet or notification permission required.</p></header>
    {!profile ? <p role="status">Set up a business to see stock alerts. <Link href="/business" className="underline">Business setup</Link></p> : <>
      <fieldset className="rounded border p-4" disabled={Boolean(preferenceError)}><legend className="px-2 font-semibold">Alerts shown on this device</legend><div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2"><input type="checkbox" checked={preferences.showOutOfStock} onChange={event => updatePreference("showOutOfStock", event.target.checked)} /> Out of stock</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={preferences.showLowStock} onChange={event => updatePreference("showLowStock", event.target.checked)} /> Low stock</label>
      </div><p className="mt-2 text-xs">Filters only change what appears here; they never change inventory or stock thresholds.</p></fieldset>
      {preferenceError && <p role="alert" className="rounded border p-3">{preferenceError} Settings are locked to protect the saved record.</p>}
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void refresh()} className="rounded border px-4 py-3 font-semibold" disabled={loading}>{loading ? "Checking…" : "Refresh alerts"}</button><button type="button" onClick={() => void notifyOnThisDevice()} className="rounded border px-4 py-3 font-semibold" disabled={loading || Boolean(error) || Boolean(preferenceError)}>Notify on this device</button></div>{notificationMessage ? <p role="status" className="text-sm">{notificationMessage}</p> : null}
      {error ? <div role="alert" className="rounded border p-4"><strong>Inventory needs attention.</strong><p>{error}</p></div> :
        loading ? <p role="status">Checking saved products…</p> :
        visibleAlerts.length === 0 ? <p role="status" className="rounded border p-4">No stock alerts match the selected filters.</p> :
        <ul className="space-y-3" aria-label="Low-stock products">{visibleAlerts.map(alert => <li key={alert.productId} className="rounded border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><strong>{alert.productName}</strong><span className="font-semibold">{alert.severity === "out" ? "Out of stock" : "Low stock"}</span></div>
          <p className="text-sm">Available: {alert.remaining} · Alert threshold: {alert.threshold}</p>
        </li>)}</ul>}
      <Link href="/inventory" className="inline-block underline">Review inventory</Link>
    </>}
  </section>;
}
