import { describe, expect, it } from "vitest";
import { prepareOfflineBindingReview } from "./offlineBindingReview";

const companies = [{ id: "one", name: "Main Retail" }, { id: "two", name: "Catering" }];

describe("legacy offline account-binding review is non-authoritative", () => {
  it("requires exact selected company, verified account ID and explicit name", () => {
    expect(prepareOfflineBindingReview(companies, "one", "user-one", "Main Retail")).toEqual({
      companyId: "one", accountUserId: "user-one",
      confirmationRequired: true, cloudAccessGranted: false,
    });
  });
  it("rejects nonexistent, ambiguous or forged company IDs", () => {
    expect(() => prepareOfflineBindingReview(companies, "foreign", "user", "Main Retail")).toThrow();
    expect(() => prepareOfflineBindingReview([...companies, companies[0]], "one", "user", "Main Retail")).toThrow();
  });
  it("rejects account absence and wrong company confirmation", () => {
    expect(() => prepareOfflineBindingReview(companies, "one", null, "Main Retail")).toThrow();
    expect(() => prepareOfflineBindingReview(companies, "one", " ", "Main Retail")).toThrow();
    expect(() => prepareOfflineBindingReview(companies, "one", "user", "Catering")).toThrow();
    expect(() => prepareOfflineBindingReview(companies, "one", "user", "Main Retail ")).not.toThrow();
  });
  it("does not mutate existing company records", () => {
    const input = Object.freeze(companies.map(company => Object.freeze({ ...company })));
    const before = JSON.stringify(input);
    prepareOfflineBindingReview(input, "two", "user", "Catering");
    expect(JSON.stringify(input)).toBe(before);
  });
});
