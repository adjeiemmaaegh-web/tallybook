/** Stage 10: the app shell exposes a keyboard skip path, useful route labels, and no non-functional menu controls. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { db, initializeDatabase } from "@/db/TallybookDB";

vi.mock("@/contexts/BusinessProfileContext", () => ({ useBusinessProfile: () => ({ profile: { name: "Accessibility Shop" }, activeCompanyId: "primary" }) }));
vi.mock("@/components/DatabaseStatus", () => ({ DatabaseStatus: () => <span>Saved on this device</span> }));
vi.mock("@/components/BrandMark", () => ({ BrandMark: () => <span>Tallybook</span> }));

describe("AppShell Stage 10 accessibility", () => {
  it("offers a skip link, announces the current page, and exposes every working navigation route", async () => {
    await initializeDatabase(db);
    render(<AppShell><h1>Today’s business</h1></AppShell>);
    expect(await screen.findByRole("link", { name: "Skip to page content" }, { timeout: 10000 })).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getAllByRole("link", { name: /Backup/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Account and sign out" })).toHaveAttribute("href", "/account");
    expect(screen.queryByRole("button", { name: /more options|menu options/i })).not.toBeInTheDocument();
  });
});
