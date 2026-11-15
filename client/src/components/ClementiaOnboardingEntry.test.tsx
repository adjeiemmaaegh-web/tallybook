import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {render,screen,waitFor,cleanup} from "@testing-library/react";
import {AppShell} from "./AppShell";
import {db,initializeDatabase} from "@/db/TallybookDB";

vi.mock("@/auth/deviceEntry",()=>({requiresCloudOwner:()=>false}));
vi.mock("@/contexts/BusinessProfileContext",()=>({
  useBusinessProfile:()=>({profile:null,companies:[],status:"ready",activeCompanyId:"primary"}),
}));
vi.mock("@/components/DatabaseStatus",()=>({DatabaseStatus:()=>null}));
vi.mock("@/components/BrandMark",()=>({BrandMark:()=>null}));

describe("Clementia sole-interface empty-device access boundary",()=>{
  beforeEach(async()=>{
    await initializeDatabase(db);
    await db.staffMembers.clear();
    await db.businessProfiles.clear();
  });
  afterEach(()=>{
    cleanup();
    window.history.pushState({},"","/");
  });
  it("mounts only empty-company onboarding chat without requiring a nonexistent staff PIN",async()=>{
    window.history.pushState({},"","/assistant");
    render(<AppShell><h1>First business chat setup</h1></AppShell>);
    expect(await screen.findByRole("heading",{name:"First business chat setup"})).toBeInTheDocument();
  });
  it("does not unlock arbitrary inventory routes on a new standalone device",async()=>{
    window.history.pushState({},"","/inventory");
    render(<AppShell><h1>Private inventory data</h1></AppShell>);
    await waitFor(()=>expect(screen.getByRole("heading",{name:"Set up this device"})).toBeInTheDocument());
    expect(screen.queryByText("Private inventory data")).not.toBeInTheDocument();
    expect(screen.getByRole("link",{name:"Set up with Clementia"})).toHaveAttribute("href","/assistant");
  });
});
