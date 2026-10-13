/** Device-local preferences only. Never modifies authoritative stock records. */
export interface AlertPreferences {
  showLowStock: boolean;
  showOutOfStock: boolean;
}
export const DEFAULT_ALERT_PREFERENCES: AlertPreferences = { showLowStock: true, showOutOfStock: true };
const KEY_PREFIX = "tallybook:stock-alert-preferences:v1:";

function storageKey(companyId: string) {
  if (!companyId || companyId.trim() !== companyId) throw new Error("Select a valid business before saving alert preferences.");
  return KEY_PREFIX + encodeURIComponent(companyId);
}
export function loadAlertPreferences(companyId: string, storage: Pick<Storage, "getItem"> = localStorage): AlertPreferences {
  const raw = storage.getItem(storageKey(companyId));
  if (raw === null) return { ...DEFAULT_ALERT_PREFERENCES };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Saved alert preferences are damaged. They have not been overwritten."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Saved alert preferences are invalid.");
  const value = parsed as Record<string, unknown>;
  if (value.version !== 1 || typeof value.showLowStock !== "boolean" || typeof value.showOutOfStock !== "boolean") {
    throw new Error("Saved alert preferences use an unsupported format.");
  }
  return { showLowStock: value.showLowStock, showOutOfStock: value.showOutOfStock };
}
export function saveAlertPreferences(companyId: string, preferences: AlertPreferences, storage: Pick<Storage, "setItem" | "getItem"> = localStorage): void {
  if (typeof preferences.showLowStock !== "boolean" || typeof preferences.showOutOfStock !== "boolean") throw new Error("Invalid alert preferences.");
  const key = storageKey(companyId);
  const encoded = JSON.stringify({ version: 1, ...preferences });
  storage.setItem(key, encoded);
  if (storage.getItem(key) !== encoded) throw new Error("Unable to verify saved alert preferences. Your previous settings may still apply.");
}
