import {describe,expect,it} from "vitest";
import {summarizeHandoverQueues} from "./sharedDeviceHandover";

describe("shared device sale handover",()=>{
 it("treats unconfirmed and in-flight sales as unfinished and keeps review items visible",()=>{
  expect(summarizeHandoverQueues([[{status:"queued"},{status:"sending"}],[{status:"rejected"},{status:"needs-review"}]])).toEqual({
   checkedBusinesses:2,unconfirmed:2,needsReview:2,
  });
 });
 it("counts only the supplied user's sale scopes and does not infer another user's queue",()=>{
  expect(summarizeHandoverQueues([[{status:"queued"}]])).toEqual({checkedBusinesses:1,unconfirmed:1,needsReview:0});
  expect(summarizeHandoverQueues([])).toEqual({checkedBusinesses:0,unconfirmed:0,needsReview:0});
 });
});
