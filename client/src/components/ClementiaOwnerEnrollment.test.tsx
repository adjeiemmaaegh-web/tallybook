import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {db,initializeDatabase} from "@/db/TallybookDB";
import ClementiaOwnerEnrollment from "./ClementiaOwnerEnrollment";

const {createStaff,unlockStaff}=vi.hoisted(()=>({
  createStaff:vi.fn(),
  unlockStaff:vi.fn(),
}));
vi.mock("@/features/staff/staff",()=>({createStaff,unlockStaff}));
vi.mock("@/contexts/BusinessProfileContext",()=>({
  useBusinessProfile:()=>({activeCompanyId:"primary",profile:{id:"primary",name:"First Shop",staffGovernanceEnabled:undefined}}),
}));
const fill=(name:string,pin:string,confirm=pin)=>{
  fireEvent.change(screen.getByRole("textbox",{name:"Owner display name"}),{target:{value:name}});
  fireEvent.change(screen.getByLabelText("Owner PIN"),{target:{value:pin}});
  fireEvent.change(screen.getByLabelText("Confirm owner PIN"),{target:{value:confirm}});
};
describe("Clementia first-owner enrollment stays outside chat/permission bypass",()=>{
  beforeEach(async()=>{
    createStaff.mockReset();unlockStaff.mockReset();
    createStaff.mockResolvedValue({id:"owner-1"});
    unlockStaff.mockResolvedValue(undefined);
    await initializeDatabase(db);
    await db.staffMembers.clear();
    await db.businessProfiles.clear();
    await db.businessProfiles.put({
      id:"primary",name:"First Shop",country:"Ghana",currency:"GHS",
      businessType:"Retail shop",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
    });
  });
  afterEach(async()=>{await db.staffMembers.clear();await db.businessProfiles.clear();});
  it("requires an explicit owner name, matching numeric PIN, then uses protected staff services",async()=>{
    render(<ClementiaOwnerEnrollment/>);
    expect(screen.getByLabelText("Owner PIN")).toHaveAttribute("type","password");
    expect(screen.getByLabelText("Confirm owner PIN")).toHaveAttribute("type","password");
    fill("Ama Serwaa","12345");
    fireEvent.click(screen.getByRole("button",{name:"Create and unlock owner"}));
    expect(screen.getByRole("alert")).toHaveTextContent("matching 6–12 digit PIN");
    expect(createStaff).not.toHaveBeenCalled();
    fill("Ama Serwaa","123456","654321");
    fireEvent.click(screen.getByRole("button",{name:"Create and unlock owner"}));
    expect(createStaff).not.toHaveBeenCalled();
    fill("Ama Serwaa","123456","123456");
    fireEvent.click(screen.getByRole("button",{name:"Create and unlock owner"}));
    await waitFor(()=>expect(createStaff).toHaveBeenCalledTimes(1));
    expect(createStaff).toHaveBeenCalledWith("Ama Serwaa","owner","123456",db);
    expect(unlockStaff).toHaveBeenCalledWith("owner-1","123456",db);
    expect(await screen.findByRole("heading",{name:"Your owner account is ready"})).toBeInTheDocument();
    expect(screen.queryByDisplayValue("123456")).not.toBeInTheDocument();
  });
  it("never reopens owner enrollment for a protected company with missing staff",async()=>{
    await db.businessProfiles.update("primary",{staffGovernanceEnabled:true});
    render(<ClementiaOwnerEnrollment/>);
    fill("Malicious Owner","123456");
    fireEvent.click(screen.getByRole("button",{name:"Create and unlock owner"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Owner enrollment is unavailable");
    expect(createStaff).not.toHaveBeenCalled();
    expect(unlockStaff).not.toHaveBeenCalled();
  });
  it("rejects duplicate owner creation when a member already exists",async()=>{
    await db.staffMembers.put({id:"existing",businessProfileId:"primary",name:"Owner",role:"owner",
      salt:"fixture",pinHash:"fixture",createdAt:new Date().toISOString()});
    render(<ClementiaOwnerEnrollment/>);
    fill("Another Owner","123456");
    fireEvent.click(screen.getByRole("button",{name:"Create and unlock owner"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Owner enrollment is unavailable");
    expect(createStaff).not.toHaveBeenCalled();
  });
  it("fails closed on protected service errors; it never unlocks a rejected account",async()=>{
    createStaff.mockRejectedValueOnce(new Error("Permission denied"));
    render(<ClementiaOwnerEnrollment/>);
    fill("Ama Serwaa","123456");
    fireEvent.click(screen.getByRole("button",{name:"Create and unlock owner"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Permission denied");
    expect(unlockStaff).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("123456")).not.toBeInTheDocument();
  });
});
