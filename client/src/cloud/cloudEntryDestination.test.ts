import {describe, expect, it} from "vitest";
import {cloudEntryDestination} from "./cloudEntryDestination";

describe("verified role home routing", () => {
  it("takes an authorized owner to the owner dashboard", () => {
    expect(cloudEntryDestination("owner")).toBe("/shop?view=dashboard");
  });
  it("takes an authorized attendant to the separate home screen", () => {
    expect(cloudEntryDestination("attendant")).toBe("/shop?view=home");
  });
});
