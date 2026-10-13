import { describe, expect, it } from "vitest";
import { loadAlertPreferences, saveAlertPreferences } from "./alertPreferences";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    data,
  };
}
describe("company-scoped stock alert preferences", () => {
  it("defaults to both severities and keeps company filters separate", () => {
    const storage = memoryStorage();
    expect(loadAlertPreferences("a", storage)).toEqual({ showLowStock: true, showOutOfStock: true });
    saveAlertPreferences("a", { showLowStock: false, showOutOfStock: true }, storage);
    expect(loadAlertPreferences("a", storage).showLowStock).toBe(false);
    expect(loadAlertPreferences("b", storage).showLowStock).toBe(true);
  });
  it("rejects damaged records without overwriting them", () => {
    const storage = memoryStorage();
    storage.setItem("tallybook:stock-alert-preferences:v1:a", "not-json");
    expect(() => loadAlertPreferences("a", storage)).toThrow("damaged");
    expect(storage.getItem("tallybook:stock-alert-preferences:v1:a")).toBe("not-json");
  });
  it("rejects silent storage failures", () => {
    expect(() => saveAlertPreferences("a", { showLowStock: false, showOutOfStock: true }, {
      setItem: () => undefined, getItem: () => null,
    })).toThrow("verify");
  });
});
