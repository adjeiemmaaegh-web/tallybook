import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AuthGate } from "./AuthGate";
vi.mock("./useRun4CloudSession", () => ({
  useRun4CloudSession: () => ({
    state: { status: "signed-out", userId: null },
    retry: vi.fn(),
  }),
}));
afterEach(cleanup);
it.each(["/", "/sales", "/inventory", "/reports", "/backup"])(
  "redirects signed-out direct URL %s to sign-in",
  path => {
    const location = memoryLocation({ path, record: true });
    render(
      <Router hook={location.hook}>
        <AuthGate signIn={<p>Sign in here</p>}>
          <p>Ledger content</p>
        </AuthGate>
      </Router>
    );
    expect(screen.queryByText("Ledger content")).toBeNull();
    expect(location.history.at(-1)).toBe("/signin");
  }
);
