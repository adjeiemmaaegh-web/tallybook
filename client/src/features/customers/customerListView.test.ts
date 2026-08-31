import { describe, expect, it } from "vitest";
import { customerListViewFromSearch, customerListViewHref } from "@/features/customers/customerListView";

describe("customer debtor-list navigation", () => {
  it("uses a refresh-safe URL for the owing-only customer list", () => {
    expect(customerListViewHref("owing")).toBe("/customers?view=owing");
    expect(customerListViewFromSearch("?view=owing")).toBe("owing");
  });

  it("uses the full customer list for absent or unsupported view values", () => {
    expect(customerListViewHref("all")).toBe("/customers");
    expect(customerListViewFromSearch("")).toBe("all");
    expect(customerListViewFromSearch("?view=archived")).toBe("all");
  });
});
