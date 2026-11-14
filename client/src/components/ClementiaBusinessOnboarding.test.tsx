import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {ClementiaBusinessOnboarding} from "./ClementiaBusinessOnboarding";

const {save}=vi.hoisted(()=>({save:vi.fn()}));
vi.mock("@/contexts/BusinessProfileContext",()=>({
  useBusinessProfile:()=>({save,activeCompanyId:"primary",status:"ready"}),
}));
function reply(text:string){
  const input=screen.getByRole("textbox",{name:"Reply to Clementia setup"});
  fireEvent.change(input,{target:{value:text}});
  fireEvent.submit(input.closest("form")!);
}
function toReview(){
  reply("Ama's Store");
  expect(screen.getByText(/Which country does/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Ghana"}));
  fireEvent.click(screen.getByRole("button",{name:"Retail shop"}));
  expect(screen.getByText(/Please review these details/)).toBeInTheDocument();
}
describe("Clementia conversational business onboarding",()=>{
  beforeEach(()=>{save.mockReset();save.mockResolvedValue({id:"primary"});});
  it("onboards through chat and calls the existing validated save only after explicit confirmation",async()=>{
    render(<ClementiaBusinessOnboarding/>);
    expect(screen.getByText(/What is your business name/)).toBeInTheDocument();
    toReview();
    expect(save).not.toHaveBeenCalled();
    reply("yes");
    expect(screen.getByRole("alert")).toHaveTextContent("Confirm business setup");
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Confirm business setup"}));
    await waitFor(()=>expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      name:"Ama's Store",country:"Ghana",currency:"GHS",
      businessType:"Retail shop",preferredPaymentMethod:"cash",
    }),"primary");
    expect(await screen.findByText(/Business saved/)).toBeInTheDocument();
  });
  it("rejects an invalid country and does not infer currency",()=>{
    render(<ClementiaBusinessOnboarding/>);
    reply("Clementia Supplies");
    reply("Atlantis");
    expect(screen.getByRole("alert")).toHaveTextContent("won't guess your currency");
    expect(save).not.toHaveBeenCalled();
    reply("I am in Kenya");
    expect(screen.getByText(/What kind of business/)).toBeInTheDocument();
    expect(screen.getByText(/Currency:/)).toBeInTheDocument();
    expect(document.body).toHaveTextContent("KES");
  });
  it("does not bypass an authorization error from the existing business-profile service",async()=>{
    save.mockRejectedValueOnce(new Error("Staff permission denied."));
    render(<ClementiaBusinessOnboarding/>);
    toReview();
    fireEvent.click(screen.getByRole("button",{name:"Confirm business setup"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Staff permission denied");
    expect(screen.getByText(/Please review these details/)).toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("lets the user revise or abandon their unconfirmed company details",()=>{
    render(<ClementiaBusinessOnboarding/>);
    toReview();
    fireEvent.click(screen.getByRole("button",{name:"Back"}));
    expect(screen.getByText(/What kind of business/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Start over"}));
    expect(screen.getByText(/What is your business name/)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});
