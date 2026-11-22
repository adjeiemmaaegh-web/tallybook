import { useEffect } from "react";
import { createIdleLocker } from "@/features/security/ledgerAutoLock";

const ACTIVITY = ["pointerdown", "keydown", "wheel", "touchstart", "focus"] as const;
/** Renders nothing. While mounted it locks the ledger after `minutes` without interaction. */
export function LedgerAutoLock({ minutes, onIdle }: { minutes: number; onIdle: () => void }) {
  useEffect(() => {
    if (!minutes) return;
    const locker = createIdleLocker({ timeoutMs: minutes * 60_000, onIdle });
    locker.start();
    const touch = () => locker.touch();
    // A hidden tab can have throttled timers; re-check the real deadline the moment the tab is seen again.
    const visibility = () => { if (document.visibilityState === "visible") locker.check(); };
    for (const name of ACTIVITY) window.addEventListener(name, touch, { passive: true, capture: true });
    document.addEventListener("visibilitychange", visibility);
    return () => { locker.stop(); for (const name of ACTIVITY) window.removeEventListener(name, touch, { capture: true }); document.removeEventListener("visibilitychange", visibility); };
  }, [minutes, onIdle]);
  return null;
}
