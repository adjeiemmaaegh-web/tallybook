import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { MessageCircleQuestion, X, Maximize2 } from "lucide-react";
import AssistantPage from "@/pages/AssistantPage";
import "./ClementiaLauncher.css";

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
        setOpen(false);
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
      <span className="clementia-avatar" aria-hidden="true"><MessageCircleQuestion size={22}/></span>
      <span>Let Clementia assist you</span>
    </button>
    {open && <section ref={panelRef} id="clementia-assistant-panel" className="clementia-panel" role="dialog" aria-modal="false" aria-label="Clementia assistant">
      <header className="clementia-panel-header">
        <span className="clementia-avatar" aria-hidden="true"><MessageCircleQuestion size={20}/></span>
        <strong>Clementia</strong>
        <Link href="/assistant" aria-label="Open Clementia full screen"><Maximize2 size={18}/></Link>
        <button ref={closeRef} type="button" aria-label="Close Clementia" onClick={close}><X size={20}/></button>
      </header>
      <div className="clementia-panel-body"><AssistantPage /></div>
    </section>}
  </>;
}
