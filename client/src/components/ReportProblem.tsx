import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildProblemReportText } from "@/lib/errorReporting";
import { openWhatsAppShare, shareBusinessText } from "@/features/sharing/businessSharing";

/**
 * Free, private problem reporting. Shows exactly what would be sent (scrubbed
 * error details plus the person's own note) and lets them send it themselves.
 * Nothing is uploaded by Tallybook.
 */
export function ReportProblem({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");
  const text = open ? buildProblemReportText(notes) : "";
  const support = import.meta.env.VITE_TALLYBOOK_SUPPORT_WHATSAPP?.trim() || null;

  const whatsApp = () => {
    setStatus(openWhatsAppShare(text, support)
      ? "WhatsApp opened. Press send there to deliver the report."
      : "WhatsApp could not open. Use Copy instead.");
  };
  const share = async () => {
    const result = await shareBusinessText({ title: "Tallybook problem report", text });
    setStatus(result === "shared" ? "Opened in your share options."
      : result === "copied" ? "Report copied. Paste it into a message."
      : result === "cancelled" ? "" : "Select the text above and copy it.");
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setStatus("Report copied. Paste it into a message."); }
    catch { setStatus("Select the text above and copy it."); }
  };

  return <>
    <button type="button" className={className ?? "shop-link"} onClick={() => { setStatus(""); setOpen(true); }}>Report a problem</button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[calc(100vh-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Report a problem</DialogTitle>
          <DialogDescription>
            This message has technical details only. It does not include sales, customers, prices or stock. Read it, then send it to the person who looks after Tallybook.
          </DialogDescription>
        </DialogHeader>
        <label className="block text-sm">What were you doing?
          <textarea value={notes} onChange={e => setNotes(e.target.value.slice(0, 500))} rows={3} maxLength={500}
            className="mt-1 w-full rounded border p-2" placeholder="Example: I pressed Pay and the screen went blank. Please do not type customer details." />
        </label>
        <textarea readOnly rows={9} value={text} aria-label="Report to send" onFocus={e => e.currentTarget.select()}
          className="w-full rounded border p-2 font-mono text-xs" />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="primary-action" onClick={whatsApp}>Send on WhatsApp</button>
          <button type="button" className="secondary-action" onClick={() => void share()}>Share</button>
          <button type="button" className="secondary-action" onClick={() => void copy()}>Copy</button>
        </div>
        {status && <p role="status" className="text-sm">{status}</p>}
      </DialogContent>
    </Dialog>
  </>;
}
