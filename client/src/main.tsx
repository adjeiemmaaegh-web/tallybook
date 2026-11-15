import "./styles/Fonts.css";
import "./index.css";
/** Tactile Ledger design reminder: the app registers only an offline shell; business records remain in IndexedDB. */
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { retirePriorBrowserData } from "./auth/freshStartReset.mjs";

async function boot() {
  // A new release cannot mount prior IndexedDB, cached sessions or a service worker
  // before the explicit owner-authorized one-way retirement completes.
  const epoch = import.meta.env.VITE_TALLYBOOK_FRESH_START_EPOCH?.trim() ?? "";
  if (epoch) await retirePriorBrowserData({
    epoch,
    mandatoryOnlineAuth: import.meta.env.VITE_TALLYBOOK_MANDATORY_ONLINE_AUTH === "true",
  });
  // Do not evaluate app modules (which may initialize IndexedDB or auth)
  // until any configured retirement has completed successfully.
  const [{ default: App }, { initErrorReporting }, { announceRun18UpdateReady }] = await Promise.all([
    import("./App"),
    import("@/lib/errorReporting"),
    import("@/features/reliability/run18UpdatePolicy"),
  ]);
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
}

void boot().catch(() => {
  // Fail closed: do not import a ledger, register a worker or expose cached data
  // if a legacy tab, browser API or storage fault prevents complete retirement.
  const root = document.getElementById("root");
  if (!root) return;
  const message = document.createElement("main");
  message.setAttribute("role", "alert");
  message.style.cssText = "max-width:36rem;margin:4rem auto;padding:1.5rem;font:16px system-ui;line-height:1.5";
  const title = document.createElement("h1");
  title.textContent = "Tallybook needs to finish its fresh start";
  const details = document.createElement("p");
  details.textContent = "Close other Tallybook tabs and reload. If this continues, clear this site's browser data in your browser settings and sign in again. The previous workspace will not open.";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Retry fresh start";
  retry.addEventListener("click", () => window.location.reload());
  message.append(title, details, retry);
  root.replaceChildren(message);
});
