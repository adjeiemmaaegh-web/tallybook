import { useState } from "react";
import { Link } from "wouter";
import { MessageCircleQuestion, X, Maximize2 } from "lucide-react";
import AssistantPage from "@/pages/AssistantPage";
import "./ClementiaLauncher.css";

export function ClementiaLauncher({ hidden }: { hidden: boolean }) {
  const [open, setOpen] = useState(false);
  if (hidden) return null;
  return open ? (
    <section className="clementia-panel" aria-label="Clementia assistant">
      <header className="clementia-panel-header">
        <span className="clementia-avatar"><MessageCircleQuestion size={20} /></span>
        <strong>Clementia</strong>
        <Link href="/assistant" aria-label="Open assistant full screen"><Maximize2 size={18}/></Link>
        <button type="button" aria-label="Close Clementia" onClick={() => setOpen(false)}><X size={20}/></button>
      </header>
      <div className="clementia-panel-body"><AssistantPage /></div>
    </section>
  ) : (
    <button type="button" className="clementia-launcher" aria-label="Let Clementia assist you" onClick={() => setOpen(true)}>
      <span className="clementia-avatar"><MessageCircleQuestion size={22}/></span>
      <span>Let Clementia assist you</span>
    </button>
  );
}
