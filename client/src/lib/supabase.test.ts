import { describe, expect, it } from "vitest";
import { isSupabaseConfigured, supabaseConfigStatus } from "./supabase";

describe("Supabase configuration", () => {
  it("reports configuration without exposing credentials", () => {
    expect(supabaseConfigStatus.configured).toBe(isSupabaseConfigured);
    expect(typeof supabaseConfigStatus.hasUrl).toBe("boolean");
    expect(typeof supabaseConfigStatus.hasPublishableKey).toBe("boolean");
    expect(supabaseConfigStatus).not.toHaveProperty("url");
    expect(supabaseConfigStatus).not.toHaveProperty("publishableKey");
    expect(supabaseConfigStatus).not.toHaveProperty("secretKey");
  });
});
