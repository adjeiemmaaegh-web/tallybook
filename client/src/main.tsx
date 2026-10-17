/** Tactile Ledger design reminder: the app registers only an offline shell; business records remain in IndexedDB. */
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import {announceRun18UpdateReady} from "@/features/reliability/run18UpdatePolicy";
import "./index.css";

if ("serviceWorker" in navigator) {
  let apply:((reloadPage?:boolean)=>Promise<void>)|null=null;
  apply=registerSW({immediate:true,onNeedRefresh:()=>{
    announceRun18UpdateReady(async()=>{
      if(!apply)throw Error("Offline update coordinator is unavailable.");
      await apply(true);
    });
  }});
}

createRoot(document.getElementById("root")!).render(<App />);
