import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AuthGate } from "./AuthGate";
const mock = vi.hoisted(() => ({
  path: "/",
  status: "signed-out",
  userId: null as string | null,
}));
vi.mock("wouter", () => ({
  useLocation: () => [mock.path, vi.fn()],
  Redirect: () => <span>Sign-in required</span>,
}));
vi.mock("./useRun4CloudSession", () => ({
  useRun4CloudSession: () => ({
    state: { status: mock.status, userId: mock.userId },
    retry: vi.fn(),
  }),
}));
vi.mock("./WorkspaceOnboarding", () => ({
  WorkspaceOnboarding: () => <span>Authorized setup required</span>,
}));
const renderGate = (enabled = true) =>
  render(
    <AuthGate
      enabled={enabled}
      signIn={<span>Account screen</span>}
      passwordRecovery={<span>Recovery screen</span>}
    >
      <span>Business records</span>
    </AuthGate>
  );
beforeEach(() => {
  mock.path = "/";
  mock.status = "signed-out";
  mock.userId = null;
});
afterEach(cleanup);
it.each([
  "/",
  "/sales",
  "/inventory",
  "/reports",
  "/backup",
  "/business",
  "/assistant",
  "/staff",
  "/stores",
])("denies anonymous direct navigation to %s", path => {
  mock.path = path;
  renderGate();
  expect(screen.queryByText("Business records")).toBeNull();
  expect(screen.getByText("Sign-in required")).toBeTruthy();
});
it("ignores the obsolete bypass flag", () => {
  renderGate(false);
  expect(screen.queryByText("Business records")).toBeNull();
});
it("does not grant local data merely because cloud identity verified", () => {
  mock.status = "signed-in";
  mock.userId = "verified-owner";
  renderGate();
  expect(screen.getByText("Authorized setup required")).toBeTruthy();
  expect(screen.queryByText("Business records")).toBeNull();
});
it.each(["offline", "checking", "error", "disabled"])(
  "fails closed while %s",
  status => {
    mock.status = status;
    renderGate();
    expect(screen.queryByText("Business records")).toBeNull();
    if (status === "offline")
      expect(
        screen.getByText(
          "An internet connection is required to create or verify your Tallybook account for the first time."
        )
      ).toBeTruthy();
  }
);
it.each(["/signin", "/account", "/reset-password"])(
  "keeps %s outside local database providers",
  path => {
    mock.path = path;
    renderGate();
    expect(screen.queryByText("Business records")).toBeNull();
    expect(
      screen.getByText(
        path === "/reset-password" ? "Recovery screen" : "Account screen"
      )
    ).toBeTruthy();
  }
);
