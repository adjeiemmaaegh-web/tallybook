/** Tallybook Africa design reminder: this focused receipt sheet stays solid, cobalt-led, touch-safe, and read-only; its actions never write local business data. */
import { Copy, Printer, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMinorAmount } from "@/features/inventory/inventory";
import { businessDateTimeLabel } from "@/features/business/businessCalendar.mjs";
import { formatReceiptShareText, receiptPaymentDescription, shareReceiptText, type ReceiptDetail } from "@/features/receipts/receiptDetail";

interface ReceiptDetailDialogProps {
  detail: ReceiptDetail | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manualCopyText?: string | null;
}

export function ReceiptDetailDialog({ detail, open, onOpenChange, manualCopyText }: ReceiptDetailDialogProps) {
  const [manualText, setManualText] = useState<string | null>(null);
  useEffect(() => { if (open) setManualText(manualCopyText ?? null); }, [manualCopyText, open]);
  const close = () => { setManualText(null); onOpenChange(false); };
  const share = async () => {
    if (!detail) return;
    const text = formatReceiptShareText(detail);
    const result = await shareReceiptText(text);
    if (result === "shared") { setManualText(null); toast.success("Receipt opened in your device share options."); }
    else if (result === "copied") { setManualText(null); toast.success("Receipt text copied. Paste it into your customer message."); }
    else if (result === "manual") { setManualText(text); toast.info("Copy the receipt text below into your customer message."); }
  };
  const print = () => {
    if (typeof window.print !== "function") return toast.info("Printing is not available in this browser.");
    window.print();
  };

  return <Dialog open={open && Boolean(detail)} onOpenChange={(nextOpen) => nextOpen ? onOpenChange(true) : close()}>
    <DialogContent className="receipt-dialog-content max-h-[calc(100vh-1.5rem)] overflow-y-auto border-0 p-0 sm:max-w-xl" showCloseButton={false} aria-describedby="receipt-detail-description">
      {detail ? <article className="receipt-detail" aria-label={`Receipt ${detail.receipt.receiptNumber}`}>
        <DialogHeader className="receipt-detail-header">
          <p className="ledger-kicker">Saved on this device</p>
          <DialogTitle>{detail.businessName}</DialogTitle>
          <DialogDescription id="receipt-detail-description">Receipt {detail.receipt.receiptNumber} · {businessDateTimeLabel(detail.receipt.issuedAt, detail.country)}</DialogDescription>
        </DialogHeader>
        <section className="receipt-detail-summary" aria-label="Receipt totals">
          <div><span>Total</span><strong>{formatMinorAmount(detail.sale.totalMinor, detail.currency)}</strong></div>
          <div><span>Settled</span><strong>{formatMinorAmount(detail.sale.amountPaidMinor, detail.currency)}</strong></div>
          {detail.sale.walletAppliedMinor ? <><div><span>Prepaid wallet applied</span><strong>{formatMinorAmount(detail.sale.walletAppliedMinor, detail.currency)}</strong></div><div><span>New money received</span><strong>{formatMinorAmount(detail.sale.amountPaidMinor - detail.sale.walletAppliedMinor, detail.currency)}</strong></div></> : null}
          <div><span>Remaining</span><strong>{formatMinorAmount(detail.sale.outstandingMinor, detail.currency)}</strong></div>
        </section>
        <section className="receipt-detail-meta" aria-label="Receipt information">
          <div><span>Customer</span><strong>{detail.customerName}</strong></div>
          <div><span>Payment</span><strong>{receiptPaymentDescription(detail)}</strong></div>
        </section>
        <section className="receipt-detail-items" aria-labelledby="receipt-items-title">
          <div className="receipt-detail-section-head"><h3 id="receipt-items-title">Items</h3><span>{detail.lines.length} line{detail.lines.length === 1 ? "" : "s"}</span></div>
          {detail.lines.map((line) => <div className="receipt-detail-line" key={line.id}><div><strong>{line.productName}</strong><span>{line.quantity} × {formatMinorAmount(line.unitPriceMinor, detail.currency)}</span></div><strong>{formatMinorAmount(line.lineTotalMinor, detail.currency)}</strong></div>)}
        </section>
        <section className="receipt-detail-calculation" aria-label="Receipt calculation">
          <div><span>Subtotal</span><strong>{formatMinorAmount(detail.sale.subtotalMinor, detail.currency)}</strong></div>
          {detail.sale.loyaltyRedeemedPoints ? <div><span>Loyalty redeemed ({detail.sale.loyaltyRedeemedPoints} pts)</span><strong>−{formatMinorAmount(detail.sale.loyaltyRedeemedMinor ?? 0, detail.currency)}</strong></div> : null}
          {detail.sale.discountMinor > (detail.sale.loyaltyRedeemedMinor ?? 0) ? <div><span>Other discounts</span><strong>−{formatMinorAmount(detail.sale.discountMinor - (detail.sale.loyaltyRedeemedMinor ?? 0), detail.currency)}</strong></div> : null}
          {detail.sale.tax?.ghana ? <>
            <div><span>Taxable value</span><strong>{formatMinorAmount(detail.sale.tax.ghana.taxableBaseMinor, detail.currency)}</strong></div>
            <div><span>VAT (15%)</span><strong>{formatMinorAmount(detail.sale.tax.ghana.vatMinor, detail.currency)}</strong></div>
            <div><span>NHIL (2.5%)</span><strong>{formatMinorAmount(detail.sale.tax.ghana.nhilMinor, detail.currency)}</strong></div>
            <div><span>GETFund (2.5%)</span><strong>{formatMinorAmount(detail.sale.tax.ghana.getFundMinor, detail.currency)}</strong></div>
            <div><span>Total VAT and levies</span><strong>{formatMinorAmount(detail.sale.tax.taxMinor, detail.currency)}</strong></div>
            <div><span>Zero-rated supplies (after discount)</span><strong>{formatMinorAmount(detail.sale.tax.ghana.zeroRatedMinor, detail.currency)}</strong></div>
            <div><span>Exempt supplies (after discount)</span><strong>{formatMinorAmount(detail.sale.tax.ghana.exemptMinor, detail.currency)}</strong></div>
            <p>Tax registration: {detail.sale.tax.policy.registrationNumber}</p>
            <p role="note">NOT A GRA-CERTIFIED E-VAT INVOICE. No official QR, signature, or certification is issued.</p>
          </> : detail.sale.tax ? <><div><span>{detail.sale.tax.policy.label} ({detail.sale.tax.policy.rateBasisPoints / 100}%, {detail.sale.tax.policy.priceMode})</span><strong>{formatMinorAmount(detail.sale.tax.taxMinor, detail.currency)}</strong></div><div><span>Before tax</span><strong>{formatMinorAmount(detail.sale.tax.taxableMinor, detail.currency)}</strong></div>{detail.sale.tax.policy.registrationNumber ? <p>Tax registration: {detail.sale.tax.policy.registrationNumber}</p> : null}</> : null}
          <div className="receipt-detail-total"><span>Total</span><strong>{formatMinorAmount(detail.sale.totalMinor, detail.currency)}</strong></div>
        </section>
        {manualText ? <section className="receipt-manual-copy" aria-live="polite"><div><Copy className="h-4 w-4" aria-hidden="true" /><strong>Copy receipt text</strong></div><p>Your browser could not open sharing or copy automatically. Select and copy this text into your customer message.</p><textarea aria-label="Receipt text for manual copy" readOnly value={manualText} /></section> : null}
        <DialogFooter className="receipt-detail-actions">
          <button className="secondary-action" type="button" onClick={() => void share()}><Share2 className="h-4 w-4" aria-hidden="true" />Share receipt</button>
          <button className="secondary-action receipt-print-action" type="button" onClick={print}><Printer className="h-4 w-4" aria-hidden="true" />Print</button>
          <button className="primary-action" type="button" onClick={close}>Done</button>
        </DialogFooter>
      </article> : null}
    </DialogContent>
  </Dialog>;
}
