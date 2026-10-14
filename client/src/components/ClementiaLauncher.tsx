import { useEffect, useRef, useState } from "react";
import { X, Maximize2, Minimize2 } from "lucide-react";
import AssistantPage from "@/pages/AssistantPage";
import { consumeClementiaPanelRestore } from "@/lib/clementiaWindow";
import "./ClementiaLauncher.css";

function ClementiaPortrait() { return <svg viewBox="0 0 193 207" role="img" aria-label="Clementia illustrated assistant" width="64" height="64"><image href="/premium-clementia.svg" width="193" height="207" /></svg>; }

/** The existing assistant owns all reads, drafts, and confirmation-sensitive actions. */
export function ClementiaLauncher({ hidden }: { hidden: boolean }) {
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const resizeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (hidden) {
      setOpen(false);
      setMaximized(false);
    } else if (consumeClementiaPanelRestore()) {
      // Users who maximized using the older /assistant navigation can now
      // minimize back into the floating assistant instead of getting stuck.
      setOpen(true);
      setMaximized(false);
    }
  }, [hidden]);

  useEffect(() => {
    if (open && !hidden) closeRef.current?.focus();
  }, [open, hidden]);

  useEffect(() => {
    if (!open || hidden) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (maximized) {
          setMaximized(false);
          resizeRef.current?.focus();
        } else {
          close();
        }
      }
      // A maximized panel behaves like a modal dialog: keyboard focus must
      // remain inside it until the user minimizes or closes the assistant.
      if (event.key === "Tab" && maximized && panelRef.current) {
        const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter((element) => element.getClientRects().length > 0);
        if (focusable.length) {
          const first = focusable[0], last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, hidden, maximized]);

  const close = () => {
    setOpen(false);
    setMaximized(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  if (hidden) return null;
  return <>
    <button ref={triggerRef} type="button" className="clementia-launcher" aria-label="Let Clementia assist you" aria-expanded={open} aria-controls="clementia-assistant-panel" onClick={() => setOpen(true)} hidden={open}>
      <span className="clementia-avatar" aria-hidden="true"><ClementiaPortrait/></span>
      <span className="clementia-launcher-copy"><strong className="clementia-launcher-label">Let Clementia<br/>assist you</strong><small>Ask questions, get guidance,<br/>or learn how to use Tallybook.</small></span><span className="clementia-launcher-arrow" aria-hidden="true">→</span>
    </button>
    {open && <section ref={panelRef} id="clementia-assistant-panel" className={`clementia-panel${maximized ? " clementia-panel-maximized" : ""}`} role="dialog" aria-modal={maximized} aria-label="Clementia assistant">
      <header className="clementia-panel-header">
        <span className="clementia-avatar" aria-hidden="true"><ClementiaPortrait/></span>
        <strong>Clementia</strong>
        <button ref={resizeRef} type="button" aria-label={maximized ? "Minimize Clementia" : "Maximize Clementia"} aria-pressed={maximized} onClick={() => setMaximized(!maximized)}>{maximized ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}</button>
        <button ref={closeRef} type="button" aria-label="Close Clementia" onClick={close}><X size={20}/></button>
      </header>
      <div className="clementia-panel-body"><AssistantPage /></div>
    </section>}
  </>;
}
