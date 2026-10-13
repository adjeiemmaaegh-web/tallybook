import type { ParsedCommand } from "./types";

export interface LocalModelAdapter { id: string; available(): Promise<boolean>; parse(input: string): Promise<unknown> }
export interface LocalModelParseResult { intent: string; confidence: number; entities?: Record<string, unknown> }
let adapter: LocalModelAdapter | null = null;
export function registerLocalModelAdapter(next: LocalModelAdapter | null) { adapter = next; }
export function localModelAvailable(): boolean { return adapter !== null; }
export async function tryLocalModelFallback(input: string, deterministic: ParsedCommand): Promise<ParsedCommand> {
  if (!adapter || deterministic.confidence >= 0.45) return deterministic;
  if (!(await adapter.available())) return deterministic;
  const candidate = await adapter.parse(input);
  if (!candidate || typeof candidate !== "object") return deterministic;
  const result = candidate as Partial<LocalModelParseResult>;
  if (typeof result.intent !== "string" || typeof result.confidence !== "number" || result.confidence < 0 || result.confidence > 1) return deterministic;
  // The adapter may suggest a route, but the caller must still validate it against the deterministic intent list and records.
  return { ...deterministic, confidence: Math.min(0.74, result.confidence), alternatives: deterministic.alternatives };
}
