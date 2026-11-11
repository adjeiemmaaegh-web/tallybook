import "./index.css";
/** Tactile Ledger design reminder: the app registers only an offline shell; business records remain in IndexedDB. */
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import {announceRun18UpdateReady} from "@/features/reliability/run18UpdatePolicy";
import { initErrorReporting } from "@/lib/errorReporting";

initErrorReporting();

if ("serviceWorker" in navigator) {
  let apply:((reloadPage?:boolean)=>Promise<void>)|null=null;
  apply=registerSW({immediate:true,onNeedRefresh:()=>{
    announceRun18UpdateReady(async()=>{
      if(!apply)throw Error("Offline update coordinator is unavailable.");
      // Explicit reload requires the same exclusive cooperating lock used
      // for restore/company-clear and the local retail shared-write lock.
      // A pending recovery marker must never be hidden by a service-worker
      // refresh, even after the user presses the update button.
      const [{withCrossTabDataLock},{db},{RESTORE_JOURNAL_KEY}]=await Promise.all([
        import("@/features/backup/crossTabDataLock.mjs"),
        import("@/db/TallybookDB"),
        import("@/features/backup/restoreJournal.mjs"),
      ]);
      await withCrossTabDataLock("exclusive",async()=>{
        if(await db.appMeta.get(RESTORE_JOURNAL_KEY))
          throw Error("Complete interrupted local recovery before updating the app.");
        await apply!(true);
      });
    });
  }});
}

createRoot(document.getElementById("root")!).render(<App />);
