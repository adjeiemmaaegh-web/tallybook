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
/** International dialling codes for the countries Tallybook offers at setup. */
const CALLING_CODES: Record<string, string> = {
  Ghana: "233",
  Kenya: "254",
  Nigeria: "234",
  Rwanda: "250",
  "South Africa": "27",
  Tanzania: "255",
  Uganda: "256",
  Zambia: "260",
  Zimbabwe: "263",
};

/**
 * Turns a saved customer phone number into the digits WhatsApp's wa.me link
 * needs (country code first, no "+", spaces or leading zero). Returns null when
 * the number cannot be made safe to dial, so the caller opens WhatsApp without
 * a recipient and the owner picks the contact. A wrong number would send a
 * customer's balance to a stranger, so guessing is never an option.
 */
export function normalizeWhatsAppNumber(phone: string | null | undefined, country?: string | null): string | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null;
  if (/[^\d+\s().-]/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  let international: string | null = null;
  if (raw.startsWith("+")) international = digits;
  else if (digits.startsWith("00")) international = digits.slice(2);
  else if (digits.startsWith("0")) {
    const code = country ? CALLING_CODES[country] : undefined;
    if (code) international = code + digits.slice(1);
  }
  if (!international || !/^[1-9]\d{7,14}$/.test(international)) return null;
  return international;
}

export function buildWhatsAppUrl(text: string, phone?: string | null, country?: string | null): string {
  const number = normalizeWhatsAppNumber(phone, country);
  return `https://wa.me/${number ?? ""}?text=${encodeURIComponent(text)}`;
}

/** Opens WhatsApp with the message prefilled. Nothing is sent until the owner presses send there. */
export function openWhatsAppShare(text: string, phone?: string | null, country?: string | null): boolean {
  if (typeof window === "undefined" || typeof window.open !== "function") return false;
  const opened = window.open(buildWhatsAppUrl(text, phone, country), "_blank", "noopener,noreferrer");
  return opened !== null;
}
