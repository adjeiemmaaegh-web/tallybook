import {beforeEach,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {BusinessTypeEditor} from "./BusinessTypeEditor";
const backend=vi.hoisted(()=>({read:vi.fn(),save:vi.fn()}));
vi.mock("./businessClassification",async original=>({
 ...(await original<object>()),readBusinessType:backend.read,saveBusinessType:backend.save
}));
beforeEach(()=>{
 vi.clearAllMocks();
 backend.read.mockResolvedValue("retail");
 backend.save.mockResolvedValue(undefined);
});
it("displays verified stored type and saves a new type only after server confirmation",async()=>{
 render(<BusinessTypeEditor companyId="11111111-1111-4111-8111-111111111111"/>);
 expect(await screen.findByRole("status")).toHaveTextContent("Verified saved type: Retail shop.");
 fireEvent.change(screen.getByLabelText("Business category"),{target:{value:"manufacturing"}});
 expect(screen.queryByText(/Verified saved type: Manufacturing/)).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Save business type"}));
 await waitFor(()=>expect(backend.save).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111","manufacturing"));
 expect(await screen.findByText("Verified saved type: Manufacturing.")).toBeInTheDocument();
});
it("does not claim a saved business type when the owner write is refused",async()=>{
 backend.save.mockRejectedValue(new Error("Only the owner may update this business"));
 render(<BusinessTypeEditor companyId="11111111-1111-4111-8111-111111111111"/>);
 await screen.findByText("Verified saved type: Retail shop.");
 fireEvent.change(screen.getByLabelText("Business category"),{target:{value:"food"}});
 fireEvent.click(screen.getByRole("button",{name:"Save business type"}));
 expect(await screen.findByRole("alert")).toHaveTextContent("Only the owner");
 expect(screen.queryByText("Verified saved type: Food and hospitality.")).toBeNull();
});
it("never presents missing schema as an empty company setting",async()=>{
 backend.read.mockRejectedValue(new Error("Business classification is unavailable"));
 render(<BusinessTypeEditor companyId="11111111-1111-4111-8111-111111111111"/>);
 expect(await screen.findByRole("alert")).toHaveTextContent("Business classification is unavailable");
 expect(screen.queryByRole("button",{name:"Save business type"})).toBeNull();
});
