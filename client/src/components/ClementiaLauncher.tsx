import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { X, Maximize2 } from "lucide-react";
import AssistantPage from "@/pages/AssistantPage";
import "./ClementiaLauncher.css";

function ClementiaPortrait() { return <svg viewBox="0 0 96 96" role="img" aria-label="Clementia illustrated assistant" width="64" height="64"><circle cx="48" cy="48" r="47" fill="#dceeff"/><path d="M15 94c2-23 15-33 33-33s31 10 33 33" fill="#2563c7"/><path d="M22 48c-5-28 6-42 26-42 22 0 32 16 26 43l-6 17H28z" fill="#31263f"/><ellipse cx="48" cy="46" rx="23" ry="28" fill="#a96c4b"/><path d="M25 37C29 13 50 12 66 25c-7 0-13-2-19-6-4 11-12 17-22 18" fill="#31263f"/><path d="M28 49c-2-14-2-24 5-31M68 48c4-14 2-25-5-33" stroke="#31263f" strokeWidth="9" strokeLinecap="round" fill="none"/><ellipse cx="39" cy="46" rx="2" ry="2.5" fill="#261f27"/><ellipse cx="57" cy="46" rx="2" ry="2.5" fill="#261f27"/><path d="M42 59q6 6 12 0" fill="none" stroke="#6b2835" strokeWidth="2.5" strokeLinecap="round"/><path d="M36 69l12 10 12-10" fill="#f8fafc"/><path d="M26 83q22 8 44 0" fill="none" stroke="#72b5f3" strokeWidth="2"/></svg>; }

/** The existing assistant owns all reads, drafts, and confirmation-sensitive actions. */
export function ClementiaLauncher({ hidden }: { hidden: boolean }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  useEffect(() => {
    if (!open || hidden) return;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, hidden]);

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  if (hidden) return null;
  return <>
    <button ref={triggerRef} type="button" className="clementia-launcher" aria-label="Let Clementia assist you" aria-expanded={open} aria-controls="clementia-assistant-panel" onClick={() => setOpen(true)} hidden={open}>
      <span className="clementia-avatar" aria-hidden="true"><ClementiaPortrait/></span>
      <span className="clementia-launcher-label">Let Clementia assist you</span>
    </button>
    {open && <section ref={panelRef} id="clementia-assistant-panel" className="clementia-panel" role="dialog" aria-modal="false" aria-label="Clementia assistant">
      <header className="clementia-panel-header">
        <span className="clementia-avatar" aria-hidden="true"><ClementiaPortrait/></span>
        <strong>Clementia</strong>
        <Link href="/assistant" aria-label="Open Clementia full screen"><Maximize2 size={18}/></Link>
        <button ref={closeRef} type="button" aria-label="Close Clementia" onClick={close}><X size={20}/></button>
      </header>
      <div className="clementia-panel-body"><AssistantPage /></div>
    </section>}
  </>;
}
