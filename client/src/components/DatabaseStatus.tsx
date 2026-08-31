/** Tallybook Africa design reminder: the compact header status must use plain, truthful device-first language with no sync claim. */
import { Check, CircleAlert, CloudOff, LoaderCircle, RefreshCcw } from "lucide-react";
import { useDatabase } from "@/contexts/DatabaseContext";
import { useOnlineState } from "@/hooks/useOnlineState";

export function DatabaseStatus() {
  const { status, message, retry } = useDatabase();
  const online = useOnlineState();
  if (status === "checking") return <div className="status-chip status-chip-neutral" role="status" aria-live="polite"><LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /><span>Getting your records ready</span></div>;
  if (status === "error") return <button className="status-chip status-chip-alert" onClick={() => void retry()} type="button" title={message ?? undefined} aria-label="Your saved records need attention. Try again."><CircleAlert className="h-3.5 w-3.5" aria-hidden="true" /><span>Your saved records need attention</span><span className="status-chip-action">Try again</span><RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" /></button>;
  if (!online) return <div className="status-chip status-chip-offline" role="status" aria-live="polite" aria-label="Offline. Changes saved on this device." title="You can continue with records already available on this device."><CloudOff className="h-3.5 w-3.5" aria-hidden="true" /><span>Offline — changes saved on this device</span></div>;
  return <div className="status-chip status-chip-ready" role="status" aria-live="polite"><Check className="h-3.5 w-3.5" aria-hidden="true" /><span>Saved on this device</span></div>;
}
