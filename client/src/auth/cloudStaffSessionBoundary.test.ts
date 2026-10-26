import { describe, expect, it, vi } from "vitest";
import { createCloudStaffSessionBoundary } from "./cloudStaffSessionBoundary";

describe("cloud account changes and local staff sessions", () => {
  it("locks on account switch and sign-out without treating routine refresh as a new identity", () => {
    const lock = vi.fn();
    const onEvent = createCloudStaffSessionBoundary(lock);
    onEvent("INITIAL_SESSION", "owner-a");
    onEvent("TOKEN_REFRESHED", "owner-a");
    onEvent("SIGNED_IN", "owner-a");
    expect(lock).not.toHaveBeenCalled();
    onEvent("SIGNED_IN", "attendant-b");
    expect(lock).toHaveBeenCalledTimes(1);
    onEvent("SIGNED_OUT", null);
    expect(lock).toHaveBeenCalledTimes(2);
  });

  it("locks on a new login and user update", () => {
    const lock = vi.fn();
    const onEvent = createCloudStaffSessionBoundary(lock);
    onEvent("INITIAL_SESSION", null);
    onEvent("SIGNED_IN", "owner-a");
    onEvent("USER_UPDATED", "owner-a");
    expect(lock).toHaveBeenCalledTimes(2);
  });

  it("does not repeatedly lock a local-only cashier when cloud auth remains signed out", () => {
    const lock = vi.fn();
    const onEvent = createCloudStaffSessionBoundary(lock);
    onEvent("INITIAL_SESSION", null);
    onEvent("SIGNED_OUT", null);
    onEvent("USER_UPDATED", null);
    expect(lock).not.toHaveBeenCalled();
  });
});
