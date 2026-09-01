export type CustomerBalanceShareInput = {
  businessName: string;
  customerName: string;
  outstandingLabel: string;
};

export type PaymentConfirmationShareInput = {
  businessName: string;
  customerName: string;
  amountLabel: string;
  methodLabel: string;
  recordedAt: string;
  note?: string | null;
};

export type ShareBusinessTextInput = {
  title: string;
  text: string;
};

export type ShareBusinessTextResult =
  | "shared"
  | "copied"
  | "manual"
  | "cancelled";

export function formatCustomerBalanceShareText({
  businessName,
  customerName,
  outstandingLabel,
}: CustomerBalanceShareInput): string {
  return `Hello ${customerName},

Your current outstanding balance with ${businessName} is ${outstandingLabel}.

Thank you.`;
}

export function formatPaymentConfirmationShareText({
  businessName,
  customerName,
  amountLabel,
  methodLabel,
  recordedAt,
  note,
}: PaymentConfirmationShareInput): string {
  const recordedDate = new Date(recordedAt);

  const dateLabel = Number.isNaN(recordedDate.getTime())
    ? recordedAt
    : recordedDate.toLocaleString();

  const noteLine = note?.trim() ? `\n\nNote: ${note.trim()}` : "";

  return `${businessName} received your payment of ${amountLabel} by ${methodLabel} from ${customerName} on ${dateLabel}.${noteLine}

Thank you.`;
}

export async function shareBusinessText({
  title,
  text,
}: ShareBusinessTextInput): Promise<ShareBusinessTextResult> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        return "cancelled";
      }
    }
  }

  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return "copied";
    } catch {
      // Fall through to the manual-copy state.
    }
  }

  return "manual";
}