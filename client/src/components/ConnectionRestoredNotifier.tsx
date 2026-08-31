/** Tactile Ledger Stage 8 repair: connectivity feedback is truthful and never implies a sync, upload, or backup. */
import { useEffect, useRef } from "react";
import { toast } from "sonner";

export function ConnectionRestoredNotifier() {
  const wasOffline = useRef(typeof navigator !== "undefined" && !navigator.onLine);

  useEffect(() => {
    const noteOffline = () => { wasOffline.current = true; };
    const noteOnline = () => {
      if (!wasOffline.current) return;
      wasOffline.current = false;
      toast.success("Connection restored", {
        description: "Your records remain saved on this device. Nothing was uploaded.",
        duration: 3000,
        id: "connection-restored",
      });
    };
    window.addEventListener("offline", noteOffline);
    window.addEventListener("online", noteOnline);
    return () => { window.removeEventListener("offline", noteOffline); window.removeEventListener("online", noteOnline); };
  }, []);

  return null;
}
