/** Expand a narrowly defined two-or-more product sale into explicit previewable sale lines.
 * These preview lines are committed as one atomic sale by executeCompoundSale. No writes happen here.
 * Uncertain splits must remain with compoundItemWarning instead of losing items.
 */
import { extractItem } from "./intentParser";
import { prepareText } from "./text";

const LEAD = /^(?:(?:i|we)\s+)?(?:sell|sold)\s+/i;
const ITEM_BOUNDARY = /\s+(?:and|plus|along with|together with)\s+(?=(?:another\s+)?\d+(?:\.\d+)?\s+)/gi;
const TAIL_START = /\s+(?=to\s+|(?:paid\s+)?(?:cash|credit|momo|card)\b)/i;

/** Returns normalized commands only when each item is unambiguous and uses the same sale terms. */
export function expandCompoundSale(raw: string): string[] | null {
  const text = prepareText(raw).trim();
  if (!LEAD.test(text) || /[;\n\r?]/.test(raw)) return null;
  // Numeric payment amounts or per-product prices cannot safely be apportioned.
  if (/\b(?:paid|payment|deposit|total|price|each|per|discount|at|for)\s+(?:\w+\s+)?\d|\b\d+(?:\.\d+)?\s*(?:ghs|cedis|usd|dollars|naira)\b/i.test(text)) return null;
  const body = text.replace(LEAD, "");
  const match = TAIL_START.exec(body);
  if (!match) return null; // require an explicit shared customer/payment marker
  const itemsText = body.slice(0, match.index).trim();
  const shared = body.slice(match.index).trim();
  const items = itemsText.split(ITEM_BOUNDARY).map((s) => s.replace(/^another\s+/i, "").trim());
  if (items.length < 2 || items.length > 10) return null;
  if (!/^(?:to\s+\S+|(?:paid\s+)?(?:cash|credit|momo|card)\b)/i.test(shared)) return null;
  // An item's entire text must be understood, not merely its first quantity.
  for (const item of items) {
    const parsed = extractItem(item);
    if (!parsed?.product || !parsed.quantity || parsed.span.trim() !== item) return null;
  }
  return items.map((item) => `Sell ${item} ${shared}`);
}
