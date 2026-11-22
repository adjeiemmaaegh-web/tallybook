import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CcPlatformStatus, CcTrack, CcTrackState } from "./platform";

const m = vi.hoisted(() => ({ get: vi.fn(), grant: vi.fn(), revoke: vi.fn(), flag: vi.fn(), verify: vi.fn() }));
vi.mock("./platform", async importOriginal => ({ ...(await importOriginal<typeof import("./platform")>()),
  getCcStatus: m.get, grantCcConsent: m.grant, revokeCcConsent: m.revoke, setCcFlag: m.flag, submitCcVerification: m.verify }));
import { CcError } from "./platform";
import { sha256Hex } from "./consentTexts";
import { SharedShopConnectedCommerce } from "./SharedShopConnectedCommerce";

const TRACKS: CcTrack[] = ["discover", "network", "supply", "clementia", "passport"];
const track = (t: CcTrack, over: Partial<CcTrackState> = {}): CcTrackState => ({ track: t, consent: "none", consentVersion: null, currentConsentVersion: null,
  currentConsentSha256: null, flagEnabled: false, flagVersion: 0, killed: false, effective: false, ...over });
const status = (over: Partial<Record<CcTrack, Partial<CcTrackState>>> = {}, verification: Partial<CcPlatformStatus["verification"]> = {}): CcPlatformStatus => ({
  tracks: Object.fromEntries(TRACKS.map(t => [t, track(t, over[t])])) as CcPlatformStatus["tracks"],
  verification: { status: "none", label: "Not submitted", externallyVerified: false, declaredName: null, version: 0, ...verification }, publicationDefault: "off" });
const TEXT = { version: "v1", title: "Discover terms", body: "You choose what to list.\nNothing is published until you turn it on." };
const hash = () => sha256Hex(`${TEXT.title}\n\n${TEXT.body}`);
const texts = { discover: [TEXT] } as const;
const ui = (props: Partial<Parameters<typeof SharedShopConnectedCommerce>[0]> = {}) => render(<SharedShopConnectedCommerce companyId="co1" online texts={texts} {...props} />);
beforeEach(() => { for (const f of Object.values(m)) f.mockReset(); });

describe("Connected Commerce owner settings", () => {
  it("offline: explains it needs a connection and makes no server call", () => {
    ui({ online: false });
    expect(screen.getByRole("status").textContent).toMatch(/Connect to the internet/);
    expect(m.get).not.toHaveBeenCalled();
  });
  it("starts with every service Off; with no published terms nothing can be accepted or switched on", async () => {
    m.get.mockResolvedValue(status());
    ui();
    for (const t of TRACKS) expect((await screen.findByTestId(`cc-state-${t}`)).textContent).toBe("Off");
    expect(screen.getAllByText(/Not available yet/).length).toBe(5);
    expect(screen.queryByRole("button", { name: /Accept terms|Turn on|Read the terms/ })).toBeNull();
  });
  it("never calls self-entered details verified, and says so", async () => {
    m.get.mockResolvedValue(status({}, { status: "documents_submitted", label: "Documents submitted, review pending", declaredName: "Ama Stores" }));
    ui();
    expect((await screen.findByTestId("cc-verification-label")).textContent).toBe("Documents submitted, review pending");
    expect(screen.getByText(/not checked by Tallybook/i)).toBeTruthy();
  });
  it("shows the reviewed label only when the server says reviewed, without the disclaimer", async () => {
    m.get.mockResolvedValue(status({}, { status: "reviewed_verified", label: "Verified by Tallybook review", externallyVerified: true }));
    ui();
    expect((await screen.findByTestId("cc-verification-label")).textContent).toBe("Verified by Tallybook review");
    expect(screen.queryByText(/not checked by Tallybook/i)).toBeNull();
  });
  it("submits a trimmed name and optional reference; the button needs at least 2 characters", async () => {
    m.get.mockResolvedValue(status());
    m.verify.mockResolvedValue(status({}, { status: "documents_submitted", label: "Documents submitted, review pending" }));
    ui();
    const submit = await screen.findByRole("button", { name: "Submit for review" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Business name for verification"), { target: { value: "  Ama Stores  " } });
    fireEvent.change(screen.getByLabelText("Document reference"), { target: { value: " REG-123 " } });
    fireEvent.click(submit);
    await waitFor(() => expect(m.verify).toHaveBeenCalledWith("co1", "Ama Stores", "REG-123"));
    expect((await screen.findByRole("status")).textContent).toMatch(/not yet reviewed/);
  });
  it("accept needs the exact reviewed text, a ticked box, and sends the hash of the text it showed; then Turn on", async () => {
    const sha = await hash();
    m.get.mockResolvedValue(status({ discover: { currentConsentVersion: "v1", currentConsentSha256: sha } }));
    m.grant.mockResolvedValue(status({ discover: { currentConsentVersion: "v1", currentConsentSha256: sha, consent: "granted", consentVersion: "v1", flagVersion: 0 } }));
    m.flag.mockResolvedValue(status({ discover: { currentConsentVersion: "v1", currentConsentSha256: sha, consent: "granted", consentVersion: "v1", flagEnabled: true, flagVersion: 1, effective: true } }));
    ui();
    fireEvent.click(await screen.findByRole("button", { name: "Read the terms" }));
    expect(screen.getByTestId("cc-terms-discover").textContent).toContain("Nothing is published until you turn it on.");
    const accept = screen.getByRole("button", { name: "Accept terms" }) as HTMLButtonElement;
    expect(accept.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(accept);
    await waitFor(() => expect(m.grant).toHaveBeenCalledWith("co1", "discover", "v1", sha));
    expect((await screen.findByText(/still off until you turn it on/)).textContent).toBeTruthy();
    expect((await screen.findByTestId("cc-state-discover")).textContent).toBe("Off");
    fireEvent.click(await screen.findByRole("button", { name: "Turn on" }));
    await waitFor(() => expect(m.flag).toHaveBeenCalledWith("co1", "discover", true, 0));
    await waitFor(() => expect(screen.getByTestId("cc-state-discover").textContent).toBe("On"));
  });
  it("if the bundled text does not hash to the server's published hash, accept is unavailable", async () => {
    m.get.mockResolvedValue(status({ discover: { currentConsentVersion: "v1", currentConsentSha256: "f".repeat(64) } }));
    ui();
    expect((await screen.findAllByText(/cannot be shown in this version of the app/)).length).toBe(1);
    expect(screen.queryByRole("button", { name: /Read the terms|Accept terms/ })).toBeNull();
  });
  it("a newer consent version voids old acceptance in the UI and offers a review, not a switch", async () => {
    const sha = await hash();
    m.get.mockResolvedValue(status({ discover: { currentConsentVersion: "v1", currentConsentSha256: sha, consent: "granted", consentVersion: "v0" } }));
    ui();
    expect(await screen.findByRole("button", { name: "Review the updated terms" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Turn on" })).toBeNull();
  });
  it("an enabled service can be turned off and consent withdrawn", async () => {
    const on = { currentConsentVersion: "v1", currentConsentSha256: "a".repeat(64), consent: "granted" as const, consentVersion: "v1", flagEnabled: true, flagVersion: 4, effective: true };
    m.get.mockResolvedValue(status({ discover: on }));
    m.flag.mockResolvedValue(status({ discover: { ...on, flagEnabled: false, flagVersion: 5, effective: false } }));
    m.revoke.mockResolvedValue(status({ discover: { ...on, consent: "revoked", consentVersion: null, flagEnabled: false, effective: false } }));
    ui();
    expect((await screen.findByTestId("cc-state-discover")).textContent).toBe("On");
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(m.flag).toHaveBeenCalledWith("co1", "discover", false, 4));
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw consent" }));
    await waitFor(() => expect(m.revoke).toHaveBeenCalledWith("co1", "discover"));
  });
  it("a platform kill switch shows 'temporarily switched off' and still lets the owner turn an enabled service off", async () => {
    m.get.mockResolvedValue(status({ supply: { killed: true }, passport: { killed: true, flagEnabled: true, currentConsentVersion: "v1" } }));
    ui();
    expect((await screen.findAllByText(/Temporarily switched off by Tallybook/)).length).toBe(1);
    expect(screen.getAllByRole("button", { name: "Turn off" }).length).toBe(1);
  });
  it("a server refusal is shown in plain words and the screen reloads the truth", async () => {
    const sha = await hash();
    m.get.mockResolvedValue(status({ discover: { currentConsentVersion: "v1", currentConsentSha256: sha, consent: "granted", consentVersion: "v1" } }));
    m.flag.mockRejectedValue(new CcError("STALE_VERSION", "This changed elsewhere. Reload and review the latest version."));
    ui();
    fireEvent.click(await screen.findByRole("button", { name: "Turn on" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/changed elsewhere/);
    await waitFor(() => expect(m.get.mock.calls.length).toBeGreaterThanOrEqual(2));
  });
  it("a load failure is announced, not silently empty", async () => {
    m.get.mockRejectedValue(new CcError("NOT_AUTHORIZED", "Only the business owner can change Connected Commerce settings."));
    ui();
    expect((await screen.findByRole("alert")).textContent).toMatch(/Only the business owner/);
  });
});
