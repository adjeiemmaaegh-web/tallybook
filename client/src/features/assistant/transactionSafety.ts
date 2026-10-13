/** Conservative guard for compound ledger writes that the single-item parser cannot represent.
 * It deliberately asks for clarification rather than saving only the first item.
 */
import { extractItem } from "./intentParser";
import { prepareText } from "./text";

const TRANSACTION = /\b(?:sell|sold|selling|record(?:ed)?(?:\s+a)?\s+sale|receive|received|restock|restocked|bought|purchase|purchased)\b/;
const NEXT_ITEM = /\b(?:and|plus|along with|together with)\s+(?:another\s+)?\d+(?:\.\d+)?\s+/g;
const NEXT_COMMAND = /\b(?:and|then)\s+(?:sell|sold|receive|received|record|log)\b/;

/** Returns a user-facing clarification, or null when a single transaction is safe to parse. */
export function compoundItemWarning(input: string): string | null {
  const text = prepareText(input);
  if (!TRANSACTION.test(text) || /\?\s*$/.test(input.trim())) return null;
  // Dedicated batch support already handles explicitly separated commands.
  if (NEXT_COMMAND.test(text) || /[;\n\r]/.test(input)) return null;
  for (const match of text.matchAll(NEXT_ITEM)) {
    const tail = text.slice((match.index ?? 0) + match[0].length);
    // Recognise an actual second product rather than an amount/discount or free-form comment.
    const item = extractItem(text.slice(match.index ?? 0).replace(/^(?:and|plus|along with|together with)\s+/, ""));
    if (item?.product && tail && !/^(?:percent|%|off|discount|cash|cedis|ghs|dollars?|naira|shillings?|total|more)\b/.test(tail)) {
      return "I see more than one product in that transaction. To avoid leaving an item out, please put each sale or stock receipt on its own line, with its quantity, customer and payment details. I'll show a confirmation preview before saving anything.";
    }
  }
  return null;
}
