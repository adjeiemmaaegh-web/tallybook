import { beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CloudBusinessPanel } from "./CloudBusinessPanel";
const mock = vi.hoisted(() => ({ getUser: vi.fn(), lookup: vi.fn(), create: vi.fn(), unsubscribe: vi.fn(), callback: null as null | (() => void) }));
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true, getSupabaseClient: () => ({ auth: { getUser: mock.getUser, onAuthStateChange: (callback: () => void) => { mock.callback = callback; return { data: { subscription: { unsubscribe: mock.unsubscribe } } }; } } }) }));
vi.mock("./businessIdentity", () => ({ createBusiness: mock.create }));
vi.mock("./cloudMembership", () => ({ listVerifiedCloudBusinesses: async () => { const result = await mock.lookup(); return result ? [result] : []; } }));
beforeEach(() => {
  cleanup(); vi.clearAllMocks(); localStorage.clear();
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: async (_name: string, callback: () => unknown) => callback() } });
  mock.getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
  mock.lookup.mockResolvedValue(null);
});
it("does not contact business tables for a signed-out visitor", async () => {
  mock.getUser.mockResolvedValue({ data: { user: null }, error: null });
  render(<CloudBusinessPanel />);
  expect(await screen.findByText("Sign in to prepare your cloud business")).toBeTruthy();
  expect(mock.lookup).not.toHaveBeenCalled();
});
it("reuses the persisted request ID after a failed creation and remount", async () => {
  mock.create.mockRejectedValueOnce(new Error("Connection lost"));
  const view = render(<CloudBusinessPanel />);
  fireEvent.click(await screen.findByRole("button",{name:"I own a business"}));
  fireEvent.change(await screen.findByLabelText("Business name"), { target: { value: "Shop" } });
  fireEvent.click(screen.getByText("Create business"));
  await screen.findByText("Connection lost");
  const firstId = mock.create.mock.calls[0][1];
  view.unmount();
  mock.create.mockImplementation(async () => {
    mock.lookup.mockResolvedValue({ id: "cloud", owner_id: "owner", name: "Shop", role: "owner" });
    return { id: "cloud", owner_id: "owner", name: "Shop" };
  });
  render(<CloudBusinessPanel />);
  fireEvent.click(await screen.findByRole("button",{name:"I own a business"}));
  fireEvent.change(await screen.findByLabelText("Business name"), { target: { value: "Shop" } });
  fireEvent.click(screen.getByText("Create business"));
  await screen.findByText("Shop");
  expect(mock.create).toHaveBeenLastCalledWith("Shop", firstId);
  expect(mock.unsubscribe).toHaveBeenCalled();
});
it("discards a previous account's delayed business lookup after sign-out", async () => {
  let resolve!: (value: unknown) => void;
  mock.lookup.mockReturnValue(new Promise(done => { resolve = done; }));
  render(<CloudBusinessPanel />);
  await waitFor(() => expect(mock.lookup).toHaveBeenCalled());
  mock.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mock.callback?.();
  await screen.findByText("Sign in to prepare your cloud business");
  resolve({ id: "old", name: "Old private shop", owner_id: "owner" });
  await waitFor(() => expect(screen.queryByText("Old private shop")).toBeNull());
});

it("does not present a successful creation receipt without fresh verified owner membership", async () => {
  mock.create.mockResolvedValue({ id: "cloud", owner_id: "owner", name: "Shop" });
  render(<CloudBusinessPanel />);
  fireEvent.click(await screen.findByRole("button",{name:"I own a business"}));
  fireEvent.change(await screen.findByLabelText("Business name"), { target: { value: "Shop" } });
  fireEvent.click(screen.getByText("Create business"));
  await screen.findByText("Cloud business ownership could not be verified.");
  expect(screen.queryByText("Verified cloud owner membership.")).toBeNull();
});
it("sends an attendant to the shared shop without promoting to owner or opening the local ledger", async () => {
  mock.getUser.mockResolvedValue({data:{user:{id:"attendant"}},error:null});
  mock.lookup.mockResolvedValue({id:"cloud",name:"Shop",owner_id:"owner",role:"attendant"});
  render(<CloudBusinessPanel accountOnly />);
  expect(await screen.findByText(/Record sales at your assigned store/)).toBeTruthy();
  expect(screen.getByRole("link",{name:"Open attendant home"}).getAttribute("href")).toBe("/shop?view=home");
  expect(screen.queryByRole("link",{name:/ledger/})).toBeNull();
});

it('shows invitation instructions without a creation form for employee setup',async()=>{
  render(<CloudBusinessPanel/>);
  fireEvent.click(await screen.findByRole('button',{name:'I work for someone else'}));
  expect(screen.getByText(/Ask your employer to create an invitation/)).toBeTruthy();
  expect(screen.getByLabelText('Invitation code')).toBeTruthy();
  expect(screen.getByLabelText('Your Tallybook account ID')).toHaveValue('owner');
  expect(screen.getByRole('button',{name:'Copy my account ID'})).toBeInTheDocument();
  expect(screen.getByText(/Email alone cannot grant shop access/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Business name')).toBeNull();
  expect(mock.create).not.toHaveBeenCalled();
});
it('withholds setup options after a failed membership lookup',async()=>{
  mock.lookup.mockRejectedValueOnce(Error('Membership unavailable'));
  render(<CloudBusinessPanel/>);
  await screen.findByText('Membership unavailable');
  expect(screen.queryByRole('button',{name:'I own a business'})).toBeNull();
});
it('greets the verified Google user by first name and shows the profile',async()=>{
  mock.getUser.mockResolvedValue({data:{user:{id:'owner',user_metadata:{full_name:'Isaac Newton'}}},error:null});
  render(<CloudBusinessPanel accountOnly/>);
  expect(await screen.findByText('Hi, Isaac')).toBeTruthy();
  expect(screen.getByLabelText('What should we call you?')).toHaveValue('Isaac Newton');
});

it('presents role selection before the collapsed profile on a new verified account', async () => {
  render(<CloudBusinessPanel accountOnly />);
  const heading = await screen.findByRole('heading', { name: 'What will your role be?', level: 1 });
  const employee = screen.getByRole('button', { name: 'I work for someone else' });
  const profile = screen.getByText('My profile').closest('details')!;
  expect(heading.compareDocumentPosition(employee) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(employee.compareDocumentPosition(profile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(profile.open).toBe(false);
});

it('resumes owner setup after remount only for the same verified account', async () => {
  sessionStorage.clear();
  const first = render(<CloudBusinessPanel accountOnly />);
  fireEvent.click(await screen.findByRole('button', {name: 'I own a business'}));
  await screen.findByLabelText('Business name');
  first.unmount();
  const resumed = render(<CloudBusinessPanel accountOnly />);
  await screen.findByLabelText('Business name');
  expect(mock.create).not.toHaveBeenCalled();
  resumed.unmount();
  mock.getUser.mockResolvedValue({data:{user:{id:'other-user'}},error:null});
  render(<CloudBusinessPanel accountOnly />);
  await screen.findByRole('button', {name: 'I own a business'});
  expect(screen.queryByLabelText('Business name')).toBeNull();
  sessionStorage.clear();
});

it('gives a verified owner one dashboard entry', async () => {
  mock.lookup.mockResolvedValue({id:'cloud', name:'Shop', owner_id:'owner', role:'owner'});
  render(<CloudBusinessPanel accountOnly />);
  expect(await screen.findByRole('link',{name:'Open owner dashboard'})).toHaveAttribute('href','/shop?view=dashboard');
  expect(screen.queryByRole('link',{name:'Open POS'})).toBeNull();
});
