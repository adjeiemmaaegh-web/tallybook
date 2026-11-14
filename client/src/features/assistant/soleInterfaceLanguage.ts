/**
 * Safe, deterministic conversational wrappers for the local Clementia engine.
 *
 * This is NOT an LLM or a new permission boundary. It removes words about how
 * a user addresses Clementia, never words in the business command itself.
 * Business services, role guards, entity matching, previews and confirmation
 * remain the sole authorities for whether a request may be executed.
 */
import {sanitizeInput} from "./text";

/** A true explanation request must remain a question, not become a write. */
const EXPLANATION = /^(?:how|why|what|where|when|who|which|is there|do you|does|tell me how|tell me why|teach me|explain|what steps|what is the easiest way|can you (?:show|tell|explain|teach|walk)|could you (?:show|tell|explain|teach|walk)|please (?:explain|teach))\b/i;
const ADDRESSED_PREFACE = /^(?:when you can|what i need is this|tell me this|i am new:|i only want to chat)/i;
const SELF_ACTION = /^(?:can|could|should|may|might|will|do|did|have)\s+(?:i|we)\b/i;
const COMMUNICATIVE_QUESTION = /\b(?:how to|how do i|how can i|how i can|which (?:page|screen|section)|where (?:can|do|is)|show me how|tell me how|teach me|walk me through|steps (?:to|for)|is there a way|can i)\b/i;
const POLITE_COMMAND = /^(?:(?:can|could|would|will) you|please|kindly|pls|i (?:would like|want|need) you to|i'd like you to)\s+/i;
const MESSAGE_PREFIXES = [
  /^(?:as a (?:new|first[- ]time) user|as a beginner),?\s*(?:please\s+)?/i,
  /^(?:without (?:browsing|opening|using) (?:screens|menus)|i do not want to (?:open|tap|use|browse) menus|i am relying only on clementia)[.!,;:\s]+/i,
  /^(?:for my (?:business|shop)(?: today)?|quick request|what i need is this|tell me this|help me|please answer clearly|when you can|now please)[,:\s]+/i,
  /^(?:i am new|i only want to chat)[.!:,\\s]+/i,
  /^(?:clementia|tallybook assistant)[,!:;\s]+/i,
];

const COMMAND_START = /^(?:i|we|correct|adjust|update|sell|record|add|create|receive|recount|count|open|show|view|check|find|list|compare|simulate|undo|reverse|cancel|transfer|change|delete|apply|refund|reset|restore|export|send|email|publish|fulfill|set|sign|close|collect|charge|how|what|where|which|who|when|why|is|do|are|can|could)\b/i;

/**
 * Normalize only text addressed TO the assistant, never a question ABOUT
 * how something works. Keep the business phrase and its original case intact
 * (e.g. supplier names, SKU, amounts and dates).
 */
export function normalizeSoleInterfaceRequest(raw: string): string {
  const input=sanitizeInput(raw);
  if(!input || (EXPLANATION.test(input) && !ADDRESSED_PREFACE.test(input)) || SELF_ACTION.test(input)) return input;
  let current=input;
  let removed=false;
  for(let n=0;n<4;n++){
    let next=current;
    for(const pattern of MESSAGE_PREFIXES)next=next.replace(pattern,"");
    if(!COMMUNICATIVE_QUESTION.test(next))next=next.replace(POLITE_COMMAND,"");
    next=next.trim();
    if(next===current || !next)break;
    current=next;
    removed=true;
  }
  if(!removed || !COMMAND_START.test(current)) return input;
  if(SELF_ACTION.test(current))return input;
  // A real explanation request wrapped in a preface remains a question.
  if(EXPLANATION.test(current)||COMMUNICATIVE_QUESTION.test(current))return current;
  // Only physical counts with BOTH an observed and previous quantity can
  // be rewritten to the already-supported audited recount command. Ordinary
  // "change stock" requests remain unsupported.
  const counted=/^(?:correct|adjust|update)\\s+(?:the\\s+)?([A-Za-z][A-Za-z\\s-]{0,35}?)\\s+(?:stock|inventory|count)\\s+to\\s+(\\d{1,7})\\s+from\\s+(\\d{1,7})\\s+(?:physically\\s+)?counted[.!?]?$/i.exec(current);
  if(counted)return `I counted ${counted[2]} ${counted[1].trim()} but we have ${counted[3]}`;
  // A polite question directed at Clementia may contain a concrete request.
  // Remove only its question-mark terminator; never do this for a question
  // about the application's capabilities.
  return current.replace(/\s*\?\s*$/,"").trim();
}
