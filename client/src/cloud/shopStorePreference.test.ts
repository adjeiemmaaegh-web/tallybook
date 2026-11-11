import {describe,expect,it} from "vitest";
import {authorizedStoreChoice,shopStorePreferenceKey} from "./shopStorePreference";
const stores=[{id:"one",status:"active" as const},{id:"two",status:"active" as const},{id:"closed",status:"archived" as const}];
describe("per-attendant store choice",()=>{
 it("does not share remembered store keys across staff on one device",()=>{
  expect(shopStorePreferenceKey("staff-a","biz")).not.toBe(shopStorePreferenceKey("staff-b","biz"));
 });
 it("refuses an out-of-scope or archived remembered store",()=>{
  expect(authorizedStoreChoice(stores,"two")).toBe("two");
  expect(authorizedStoreChoice(stores,"unassigned")).toBe("one");
  expect(authorizedStoreChoice(stores,"closed")).toBe("one");
  expect(authorizedStoreChoice([],"one")).toBe("");
 });
});
