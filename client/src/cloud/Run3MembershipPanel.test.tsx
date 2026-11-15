import {beforeEach,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {Run3MembershipPanel} from "./Run3MembershipPanel";

const mocks=vi.hoisted(()=>({accept:vi.fn(),invite:vi.fn(),list:vi.fn(),revoke:vi.fn(),revokeInvite:vi.fn()}));
vi.mock("./run3MembershipClient",()=>({
 acceptCloudInvitation:mocks.accept,inviteCloudAttendant:mocks.invite,
 listCloudMembers:mocks.list,revokeCloudAttendant:mocks.revoke,
 revokeCloudInvitation:mocks.revokeInvite
}));
const id="12345678-1234-4123-8123-123456789abc";
const privateCode="v1."+"A".repeat(43);
beforeEach(()=>{
 vi.clearAllMocks();
 mocks.invite.mockResolvedValue({invitationId:"inv1",inviteToken:privateCode});
 mocks.accept.mockResolvedValue({companyId:"biz",userId:"staff"});
 mocks.list.mockResolvedValue([]);
});
it("requires the complete private invitation format before invoking the server",async()=>{
 render(<Run3MembershipPanel userId="staff" companyId={null} isOwner={false}/>);
 const submit=screen.getByRole("button",{name:"Join business"});
 expect(submit).toBeDisabled();
 fireEvent.change(screen.getByLabelText("Invitation code"),{target:{value:"12345678"}});
 expect(submit).toBeDisabled();
 expect(mocks.accept).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText("Invitation code"),{target:{value:privateCode}});
 expect(submit).toBeEnabled();
 fireEvent.click(submit);
 await waitFor(()=>expect(mocks.accept).toHaveBeenCalledWith(privateCode));
});
it("prevents owner from inviting an email or personal ID instead of a targeted UUID",async()=>{
 render(<Run3MembershipPanel userId="owner" companyId="biz" isOwner={true}/>);
 const field=screen.getByLabelText("Employee account ID (UUID)");
 fireEvent.change(field,{target:{value:"employee@example.com"}});
 fireEvent.click(screen.getByRole("button",{name:"Create targeted invitation"}));
 expect(await screen.findByRole("status")).toHaveTextContent(/Enter the intended employee account UUID/);
 expect(mocks.invite).not.toHaveBeenCalled();
 fireEvent.change(field,{target:{value:id}});
 fireEvent.click(screen.getByRole("button",{name:"Create targeted invitation"}));
 await waitFor(()=>expect(mocks.invite).toHaveBeenCalledWith("biz",id));
 expect(await screen.findByLabelText("Private invitation token")).toHaveTextContent(privateCode);
 expect(screen.getByRole("button",{name:"Copy private code"})).toBeInTheDocument();
});
it("does not apply an invitation response after switching the signed-in user",async()=>{
 let finish!:(value:{companyId:string;userId:string})=>void;
 mocks.accept.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const accepted=vi.fn();
 const view=render(<Run3MembershipPanel userId="staff" companyId={null} isOwner={false} onAccepted={accepted}/>);
 fireEvent.change(screen.getByLabelText("Invitation code"),{target:{value:privateCode}});
 fireEvent.click(screen.getByRole("button",{name:"Join business"}));
 await waitFor(()=>expect(mocks.accept).toHaveBeenCalled());
 view.rerender(<Run3MembershipPanel userId="another-account" companyId={null} isOwner={false} onAccepted={accepted}/>);
 await waitFor(()=>expect(screen.getByRole("button",{name:"Join business"})).toBeDisabled());
 finish({companyId:"biz",userId:"staff"});
 await waitFor(()=>expect(accepted).not.toHaveBeenCalled());
 expect(screen.queryByText(/Invitation accepted/)).not.toBeInTheDocument();
});
it("does not expose owner-issued invitation controls to an employee",()=>{
 render(<Run3MembershipPanel userId="staff" companyId="biz" isOwner={false}/>);
 expect(screen.queryByLabelText("Employee account ID (UUID)")).toBeNull();
 expect(screen.queryByRole("button",{name:"Refresh cloud membership list"})).toBeNull();
 expect(mocks.list).not.toHaveBeenCalled();
});
