/**
 * Clementia staff shift actions. Only the native permissioned staff services
 * may calculate shift cash or open a shift. There is intentionally NO chat
 * close-shift operation or automatic reconciliation.
 */
import { nanoid } from "nanoid";
import type { TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { formatMinorAmount, parseAmountToMinor } from "@/features/inventory/inventory";
import { activeStaffShift, currentStaffId, currentStaffSessionGeneration, openShift, previewShiftCash, requirePermission } from "@/features/staff/staff";
import { recordAudit } from "./audit";
import { answer, failure, info, question } from "./replies";
import { sanitizeInput } from "./text";
import type { AssistantReply, ReplyDetail } from "./types";

const OPEN = /^(?:(?:please|kindly)\s+)?(?:open|start|begin)\s+(?:(?:a|my|the|new|staff|cashier|work)\s+)*shift\b/i;
const STATUS = [
  /^(?:(?:please|kindly)\s+)?(?:show|check|review|view|display)\s+(?:(?:me|my|the|current|open|staff|cashier)\s+)*(?:shift|drawer)\s*(?:status|cash|balance|summary|details|float|position)?(?:\s+now)?[?.!]?$/i,
  /^(?:what(?:'s| is)|how much(?: is| should be))\s+(?:(?:my|the|our|current|expected|tracked|recorded)\s+)*(?:shift cash|cash in (?:my|the) drawer|drawer cash|expected cash)(?:\s+(?:for|in) (?:my|the) shift)?[?.!]?$/i,
  /^(?:(?:my|current|open)\s+)?shift (?:status|cash|summary|balance|float)\s*[?.!]?$/i,
];
const CANCEL = /^(?:cancel|stop|discard|never ?mind|forget it|no|not now)$/i;
const CURRENCIES = /\b(?:GHS|USD|NGN|KES|AED|EUR|GBP|RWF|TZS|UGX|cedis?|naira|dollars?)\b|₵|\$/ig;

export const isShiftOpenRequest = (text: string): boolean => OPEN.test(sanitizeInput(text));
export const isShiftCashStatusRequest = (text: string): boolean =>
  STATUS.some((pattern) => pattern.test(sanitizeInput(text)));

function currencyMismatch(text: string, currency: string): boolean {
  const mentioned = Array.from(text.matchAll(CURRENCIES), (match) => {
    const value = match[0].toUpperCase();
    return /^(?:CEDI|CEDIS|₵)$/.test(value) ? "GHS" : value === "NAIRA" ? "NGN"
      : /^(?:DOLLAR|DOLLARS|\$)$/.test(value) ? "USD" : value;
  });
  return mentioned.some((code) => code !== currency);
}

function openingFloat(text: string, currency: string, followUp: boolean): { amount?: number; error?: string } {
  const rest = followUp ? text : text.replace(OPEN, "").trim();
  const hasAmountContext = followUp || /\b(?:with|float|cash|drawer|amount)\b/i.test(rest);
  if (!hasAmountContext) return {};
  // Never discard a minus sign or accounting parentheses and reinterpret
  // a negative cash declaration as positive.
  if (/[-\u2212\u2013\u2014]\s*\d|\(\s*\d+(?:[.,]\d+)?\s*\)/.test(rest))
    return { error: "Opening cash float cannot be negative. Enter 0 or a positive amount." };
  const numbers = Array.from(rest.matchAll(/\b\d+(?:[.,]\d+)*\b/g), (match) => match[0]);
  if (numbers.length !== 1) {
    return numbers.length ? { error: "Please give one opening cash amount only." } : {};
  }
  if (currencyMismatch(rest, currency)) return { error: "Use your company's currency, " + currency + ". No FX conversion is performed." };
  const value = numbers[0];
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) return { error: "Enter one nonnegative opening float with at most two decimals." };
  try { return { amount: parseAmountToMinor(value, currency) }; }
  catch { return { error: "Enter a nonnegative opening cash float in " + currency + " within the supported money limits." }; }
}

/** Staff-scoped tracked cash estimate. It is NOT a physical cash count. */
export async function shiftCashStatusReply(raw: string, database: TallybookDB, currency: string): Promise<AssistantReply | null> {
  if (!isShiftCashStatusRequest(raw)) return null;
  const companyId = getActiveBusinessProfileId();
  try {
    const member = await requirePermission("sell", database, companyId);
    if (!member || currentStaffId(companyId) !== member.id)
      return failure("Unlock your staff account in Staff before reviewing your shift.");
    const shift = await activeStaffShift(member, database);
    if (!shift) return answer("There is no open shift for your currently unlocked staff account.", {
      link: { label: "Open Staff", href: "/staff" },
      moreText: "This is a status check only; it did not open or close any shift.",
    });
    const [cash, profile] = await Promise.all([previewShiftCash(shift.id, database), database.businessProfiles.get(companyId)]);
    if (getActiveBusinessProfileId() !== companyId || currentStaffId(companyId) !== member.id ||
        !profile || profile.currency !== currency)
      return failure("Staff session, company or currency changed during the shift review. Ask again.");
    return answer("Your shift is open. The saved transactions currently indicate " +
      formatMinorAmount(cash.expectedCashMinor, currency) + " expected drawer cash (not a physical count).", {
      details: [
        { label: "Staff", value: member.name },
        { label: "Shift opened", value: shift.openedAt },
        { label: "Opening float", value: formatMinorAmount(shift.openingFloatMinor, currency) },
        { label: "Tracked cash sales", value: formatMinorAmount(cash.cashSalesMinor, currency) },
        { label: "Tracked cash repayments", value: formatMinorAmount(cash.cashRepaymentsMinor, currency) },
        { label: "Tracked prepaid cash", value: formatMinorAmount(cash.prepaidCashMinor, currency) },
        { label: "Tracked full-sale reversals", value: formatMinorAmount(cash.cashReversalsMinor, currency) },
        { label: "Tracked partial cash refunds", value: formatMinorAmount(cash.cashPartialRefundsMinor, currency) },
        { label: "Expected drawer cash", value: formatMinorAmount(cash.expectedCashMinor, currency) },
      ],
      moreText: "Read-only calculation from tracked shift-linked movements. Expenses, unrecorded petty cash, physical counts, external settlement and unexplained cash movements are not reconciled. Closing a shift still requires the protected Staff workflow.",
      link: { label: "Review Staff shifts", href: "/staff" },
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "The shift review could not be completed.");
  }
}

type ShiftDraft = {
  companyId: string; staffId: string; unlockEpoch: number; currency: string;
  request: string; amountMinor?: number; token?: string; rows?: ReplyDetail[];
};

export function createShiftAssistantSession(database: TallybookDB, currency: string, now: () => Date = () => new Date()) {
  let draft: ShiftDraft | null = null;
  const clear = () => { draft = null; };
  const hasDraft = () => draft !== null;
  const token = () => draft?.token ?? null;

  async function handle(raw: string): Promise<AssistantReply | null> {
    const text = sanitizeInput(raw);
    if (!draft && !isShiftOpenRequest(text)) return null;
    if (draft && CANCEL.test(text)) { clear(); return info("Opening the shift was cancelled. Nothing was changed."); }
    if (draft?.token) return info("Use the Confirm shift button or Cancel. Typed confirmation cannot open a shift.");
    if (draft && isShiftOpenRequest(text)) clear();
    const companyId = getActiveBusinessProfileId();
    if (draft && (draft.companyId !== companyId || currentStaffId(companyId) !== draft.staffId ||
                  currentStaffSessionGeneration(companyId) !== draft.unlockEpoch)) {
      clear();
      return failure("The company or staff unlock changed. Start a fresh shift request.");
    }
    try {
      const member = await requirePermission("sell", database, companyId);
      if (!member || currentStaffId(companyId) !== member.id) { clear(); return failure("Unlock an authorized staff member in Staff first."); }
      const profile = await database.businessProfiles.get(companyId);
      if (!profile || profile.currency !== currency || getActiveBusinessProfileId() !== companyId) {
        clear(); return failure("The active business or currency changed. Start again.");
      }
      if (await activeStaffShift(member, database)) {
        clear(); return failure("You already have an open shift. Review it in Staff or ask for Shift status; no new shift was opened.");
      }
      if (!draft) draft = { companyId, staffId: member.id, unlockEpoch: currentStaffSessionGeneration(companyId), currency, request: text };
      const parsed = openingFloat(text, currency, !isShiftOpenRequest(text));
      if (parsed.error) return question(parsed.error, [{ type: "cancel", label: "Cancel" }]);
      if (parsed.amount !== undefined) draft.amountMinor = parsed.amount;
      if (draft.amountMinor === undefined)
        return question("What is the opening cash float in " + currency + "? Reply 0 if the drawer starts empty.", [{ type: "cancel", label: "Cancel" }]);
      if (currentStaffId(companyId) !== member.id || currentStaffSessionGeneration(companyId) !== draft.unlockEpoch ||
          getActiveBusinessProfileId() !== companyId) {
        clear(); return failure("Staff session or business changed before the shift preview. Nothing was opened.");
      }
      const rows: ReplyDetail[] = [
        { label: "Business", value: profile.name },
        { label: "Staff", value: member.name },
        { label: "Opening float", value: formatMinorAmount(draft.amountMinor, currency) },
      ];
      draft.rows = rows;
      draft.token = "shift-" + nanoid(16);
      return { kind: "preview", text: "Review the shift opening. No shift has been opened yet.",
        preview: { token: draft.token, kind: "shift_open", title: "Open staff shift", rows,
          notes: ["Opens a shift for the currently unlocked staff member only.", "The opening float is declared cash, not independently verified money. Closing and cash reconciliation remain in Staff."],
          confirmLabel: "Confirm shift opening" },
        actions: [{ type: "confirm", label: "Confirm shift opening", token: draft.token }, { type: "cancel", label: "Cancel" }] };
    } catch (error) {
      clear();
      return failure(error instanceof Error ? error.message : "Shift preparation failed; no shift was opened.");
    }
  }

  async function confirm(actionToken: string): Promise<AssistantReply> {
    if (!draft?.token || draft.token !== actionToken) return failure("The shift preview is not current. No shift was opened.");
    const current = draft;
    clear(); // The preview cannot be replayed after success OR failure.
    if (getActiveBusinessProfileId() !== current.companyId ||
        currentStaffId(current.companyId) !== current.staffId ||
        currentStaffSessionGeneration(current.companyId) !== current.unlockEpoch)
      return failure("The business or staff session changed. Nothing was opened.");
    try {
      const profile = await database.businessProfiles.get(current.companyId);
      if (!profile || profile.currency !== current.currency)
        return failure("The company currency changed. Nothing was opened.");
      const shift = await openShift(current.amountMinor!, database); // Authoritative permissioned write.
      const summary = "Staff shift opened with declared float " + formatMinorAmount(current.amountMinor!, currency) + ".";
      await recordAudit(database, {
        businessProfileId: current.companyId, action: "shift_open", outcome: "saved",
        summary, request: current.request, details: current.rows ?? [], recordId: shift.id,
      }, now());
      return { kind: "success", text: summary, details: current.rows, recordId: shift.id,
        link: { label: "Open Staff", href: "/staff" } };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to open the shift.";
      await recordAudit(database, { businessProfileId: current.companyId, action: "shift_open",
        outcome: "failed", summary: message, request: current.request, details: current.rows ?? [] }, now());
      return failure(message + " Review Staff before trying again; a delayed opening may have succeeded.");
    }
  }
  return { handle, confirm, hasDraft, token, clear };
}
