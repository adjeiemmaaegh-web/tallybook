/** Tactile Ledger design reminder: the app registers only an offline shell; business records remain in IndexedDB. */
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";

if ("serviceWorker" in navigator) registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(<App />);
