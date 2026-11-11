import {beforeEach,describe,expect,it,vi} from "vitest";
import {confirmSharedDeviceHandover,inspectSharedDeviceHandover,summarizeHandoverQueues} from "./sharedDeviceHandover";
const mock=vi.hoisted(()=>({companies:vi.fn(),queue:vi.fn(),confirm:vi.fn()}));
vi.mock("./secureStorage",()=>({outboxCompanyIdsForUser:mock.companies}));
vi.mock("./shopOutbox",()=>({readOutbox:mock.queue}));
vi.mock("@/lib/confirmAction",()=>({confirmAction:mock.confirm}));
beforeEach(()=>{
 vi.clearAllMocks();
 mock.companies.mockResolvedValue(["biz-1","biz-2"]);
 mock.queue.mockResolvedValue([]);
 mock.confirm.mockResolvedValue(true);
});
describe("shared device cashier-scoped handover",()=>{
 it("counts unresolved and in-flight sales, not only queued ones",()=>{
  expect(summarizeHandoverQueues([[{status:"queued"},{status:"sending"}],[{status:"rejected"},{status:"needs-review"}]])).toEqual({
   checkedBusinesses:2,unconfirmed:2,needsReview:2,
  });
 });
 it("reads only the outgoing employee's durable outboxes across stores",async()=>{
  mock.queue.mockImplementation(async (scope:{userId:string;companyId:string})=>
    scope.companyId==="biz-1"?[{status:"queued"}]:[{status:"rejected"}]);
  expect(await inspectSharedDeviceHandover("staff-a")).toEqual({checkedBusinesses:2,unconfirmed:1,needsReview:1});
  expect(mock.companies).toHaveBeenCalledWith("staff-a");
  expect(mock.queue).toHaveBeenNthCalledWith(1,{userId:"staff-a",companyId:"biz-1"});
  expect(mock.queue).toHaveBeenNthCalledWith(2,{userId:"staff-a",companyId:"biz-2"});
 });
 it("does not prompt when all known saved sales are already confirmed",async()=>{
  expect(await confirmSharedDeviceHandover("staff-a")).toBe(true);
  expect(mock.confirm).not.toHaveBeenCalled();
 });
 it("warns and permits the employee to cancel an unfinished handover",async()=>{
  mock.queue.mockResolvedValue([{status:"queued"}]);
  mock.confirm.mockResolvedValue(false);
  expect(await confirmSharedDeviceHandover("staff-a")).toBe(false);
  expect(mock.confirm).toHaveBeenCalledOnce();
  expect(mock.confirm.mock.calls[0][0]).toContain("next employee cannot send them");
 });
 it("does not interpret a storage failure as an empty queue",async()=>{
  mock.companies.mockRejectedValue(Error("IndexedDB unavailable"));
  mock.confirm.mockResolvedValue(false);
  expect(await confirmSharedDeviceHandover("staff-a")).toBe(false);
  expect(mock.confirm.mock.calls[0][0]).toContain("could not inspect");
 });
});
