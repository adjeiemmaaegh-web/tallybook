const BUILT_IN_ALIASES: Array<[RegExp, string]> = [
  // Specific everyday shop phrasing comes before broad word replacements.
  [/\bwhat tins? (?:dey )?finish\b/g, "what is running low"],
  [/\bwhat tins? (?:dey|is) left\b/g, "what is left"],
  [/\bhow much (.+?) dey owe(?: me)?\b/g, "how much $1 owes"],
  [/\bwetin (?:i|we) sell today\b/g, "what did we sell today"],
  [/\bhow sales dey today\b/g, "how are sales today"],
  [/\bsales?\s+for\s+yestaday\b/g, "sales yesterday"],
  [/\bwetin dey low(?: for (?:the )?shop)?\b/g, "what is running low"],
  [/\bstock wey remain\b/g, "what stock is remaining"],
  [/\bwho dey buy (.+?) most\b/g, "which customers bought $1"],
  [/\bwho buy (.+?)(?:\s+this\s+month|\s+today|\s+last\s+month)?\b/g, "which customers bought $1"],
  [/\bwhich customer buy (.+)\b/g, "which customers bought $1"],
  [/\bmake i know who owe pass\b/g, "who owes us the most"],
  [/\bshow me wetin assistant do today\b/g, "what did the assistant record today"],
  [/\bhow i fit record (?:a )?sale\b/g, "how do i record a sale"],
  [/\bhow i go (.+)\b/g, "how do i $1"],
  [/\bi want to add (?:a )?customer\b/g, "add customer"],
  [/\bi want to add (?:a )?supplier\b/g, "add supplier"],
  [/\bi want to add (?:a )?product\b/g, "add product"],
  [/\babeg\s+show\s+me\b/g, "show me"],
  [/\bwhich product no dey move\b/g, "which products are slow-moving"],
  [/\bwhat if i sell\b/g, "what happens if i sell"],
  [/\bundo am\b/g, "reverse last sale"],
  [/\btake me go\b/g, "take me to"],
  [/\bi wan\s+/g, "i want to "],
  [/\babeg\b/g, "please"],
  // Shorthand payment requests remain confirmation-gated by the normal flow.
  [/\b(\w+(?:\s+\w+)?)\s+don pay me\s+(\d+(?:\.\d+)?)\b/g, "$1 paid $2"],
  [/\b(\w+(?:\s+\w+)?)\s+pay\s+(\d+(?:\.\d+)?)\b/g, "$1 paid $2"],
  // Common shop-message typos.
  [/\byestaday\b/g, "yesterday"],
  [/\bcustmer\b/g, "customer"],
  [/\bsuplier\b/g, "supplier"],
  [/\bsupplir\b/g, "supplier"],
  [/\binventry\b/g, "inventory"],
  [/\binventori\b/g, "inventory"],
  [/\bexpence\b/g, "expense"],
  [/\bwetin\b/g, "what"],
  [/\bdey\b/g, "is"],
  [/\bwey\b/g, "that"],
  [/\bhow mch\b/g, "how much"],
  [/\bwhat tins? (?:dey )?finish\b/g, "what is running low"],
  [/\bdey finish\b/g, "is running low"],
  [/\bdey almost finish\b/g, "is running low"],
  [/\bwhat tins? (?:dey|is) left\b/g, "what is left"],
  [/\bpls\b/g, "please"],
];

export interface CustomAlias { phrase: string; canonicalValue: string; enabled?: boolean }

export function applyLocalAliases(text: string): string {
  return BUILT_IN_ALIASES.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
}

export function applyCustomAliases(text: string, aliases: CustomAlias[]): string {
  return aliases.filter((alias) => alias.enabled !== false && alias.phrase.trim()).reduce((current, alias) => current.replace(new RegExp(`\\b${alias.phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), alias.canonicalValue), text);
}

export function listBuiltInAliases(): Array<{ phrase: string; replacement: string }> {
  return BUILT_IN_ALIASES.map(([pattern, replacement]) => ({ phrase: pattern.source, replacement }));
}
