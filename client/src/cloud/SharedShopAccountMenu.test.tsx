import {beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor,cleanup} from "@testing-library/react";
import {SharedShopAccountMenu} from "./SharedShopAccountMenu";
const mocked=vi.hoisted(()=>({getUser:vi.fn(),signOut:vi.fn(),handover:vi.fn()}));
vi.mock("@/lib/supabase",()=>({getSupabaseClient:()=>({auth:{getUser:mocked.getUser,signOut:mocked.signOut}})}));
vi.mock("./sharedDeviceHandover",()=>({confirmSharedDeviceHandover:mocked.handover}));
vi.mock("wouter",()=>({Link:({children,href}:{children:unknown;href:string})=><a href={href}>{children as string}</a>}));
beforeEach(()=>{
 cleanup();vi.clearAllMocks();
 mocked.getUser.mockResolvedValue({data:{user:{id:"staff-a",email:"day@example.test",user_metadata:{full_name:"Day Attendant"}}},error:null});
 mocked.signOut.mockResolvedValue({error:null});mocked.handover.mockResolvedValue(true);
});
describe("shared device employee switch",()=>{
 it("shows only the verified current account and signs out locally",async()=>{
  const done=vi.fn();
  render(<SharedShopAccountMenu userId="staff-a" role="attendant" shopName="Branch" onSignedOut={done}/>);
  expect(await screen.findByText("day@example.test")).toBeTruthy();
  fireEvent.click(screen.getByText("Switch employee"));
  await waitFor(()=>expect(mocked.signOut).toHaveBeenCalledWith({scope:"local"}));
  expect(done).toHaveBeenCalledOnce();
  expect(mocked.handover).toHaveBeenCalledWith("staff-a");
 });
 it("keeps the current session if an unsent-sale handover was cancelled",async()=>{
  mocked.handover.mockResolvedValue(false);
  render(<SharedShopAccountMenu userId="staff-a" role="attendant" shopName="Branch" onSignedOut={vi.fn()}/>);
  fireEvent.click(screen.getByText("Switch employee"));
  await waitFor(()=>expect(mocked.handover).toHaveBeenCalled());
  expect(mocked.signOut).not.toHaveBeenCalled();
 });
 it("does not sign out another account when verified identity changes during handover",async()=>{
  mocked.getUser.mockResolvedValue({data:{user:{id:"staff-b",email:"night@example.test",user_metadata:{}}},error:null});
  const done=vi.fn();
  render(<SharedShopAccountMenu userId="staff-a" role="attendant" shopName="Branch" onSignedOut={done}/>);
  fireEvent.click(screen.getByText("Switch employee"));
  await screen.findByText(/This account changed/);
  expect(mocked.signOut).not.toHaveBeenCalled();
  expect(done).not.toHaveBeenCalled();
  expect(screen.queryByText("night@example.test")).toBeNull();
 });
});
