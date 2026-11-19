/** Regression: a stale pre-unlock refresh finishing late must not re-lock the visible session. */
import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ releaseFirst: null as null | (() => void), calls: 0, unlocked: false }));
vi.mock("@/contexts/BusinessProfileContext", () => ({
  useBusinessProfile: () => ({ activeCompanyId: "primary", profile: { id: "primary", name: "T", currency: "GHS", country: "Ghana" } }),
}));
vi.mock("@/features/staff/staff", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/staff/staff")>();
  const owner = { id: "o1", businessProfileId: "primary", name: "Owner", role: "owner" };
  return {
    ...real,
    listStaff: async () => [owner],
    requirePermission: async () => {
      const n = ++mock.calls;
      if (n === 1) {
        // Mount-time read decides "locked" now, but its slow storage read resolves only later.
        await new Promise<void>(r => { mock.releaseFirst = r; });
        throw new Error("locked");
      }
      if (!mock.unlocked) throw new Error("locked");
      return owner;
    },
    currentStaffId: () => (mock.unlocked ? "o1" : undefined),
    listClosedShiftsForReview: async () => [],
    previewShiftCash: async () => { throw new Error("none"); },
  };
});

it("ignores an older refresh that completes after a newer post-unlock refresh", async () => {
  const { default: StaffPage } = await import("./StaffPage");
  const { STAFF_SESSION_CHANGED } = await import("@/features/staff/staff");
  render(<StaffPage />);
  // Unlock while the first refresh is still waiting; this triggers refresh #2, which completes first.
  await act(async () => { mock.unlocked = true; window.dispatchEvent(new Event(STAFF_SESSION_CHANGED)); await new Promise(r => setTimeout(r, 50)); });
  expect(await screen.findByRole("button", { name: "Lock this session" })).toBeTruthy();
  // Now the stale first refresh finishes (it read state before unlock): it must be discarded.
  await act(async () => { mock.releaseFirst?.(); await new Promise(r => setTimeout(r, 50)); });
  expect(screen.queryByRole("button", { name: "Lock this session" })).not.toBeNull();
});
