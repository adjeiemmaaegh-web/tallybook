/** Premium local staff workspace. The existing staff services remain the only authority for access and writes. */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Activity, BadgeCheck, CircleAlert, Clock3, Fingerprint, KeyRound, LockKeyhole,
  Plus, ShieldCheck, ShieldOff, UsersRound, Wallet, ChevronRight,
} from "lucide-react";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import {
  STAFF_SESSION_CHANGED, createStaff, listStaff, unlockStaff, lockStaff,
  openShift, closeShift, currentStaffId, changeStaffStatus, previewShiftCash,
  changeStaffRole, setStaffPermissions, resetStaffPin, enrollStaffAuthenticator,
  unlockStaffWithAuthenticator, revokeStaffAuthenticator, rolePermissions,
  type StaffDirectoryEntry, type StaffShift, type StaffAudit, type StaffPermission,
} from "@/features/staff/staff";
import { db } from "@/db/TallybookDB";
import "./SettingsWorkspace.css";

type StaffRoleChoice = "owner" | "supervisor" | "cashier";

const PERMISSION_NAMES: Record<StaffPermission, string> = {
  sell: "Make sales",
  refund: "Process refunds",
  discount: "Apply discounts",
  inventory: "Manage inventory",
  reports: "View reports",
  staff: "Manage staff",
};
const PERMISSION_HELP: Record<StaffPermission, string> = {
  sell: "Create sales and use cashier shifts",
  refund: "Process returns allowed by this business",
  discount: "Apply approved discounts",
  inventory: "Work with products and stock",
  reports: "Read business reports",
  staff: "Manage team access and permissions",
};

function numberInMinorUnits(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function readableDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function StaffStatus({ active }: { active: boolean }) {
  return <span className={active ? "settings-tag settings-tag-success" : "settings-tag settings-tag-muted"}>
    <span className="settings-tag-dot" aria-hidden="true" />{active ? "Active" : "Disabled"}
  </span>;
}

export default function StaffPage() {
  const { activeCompanyId } = useBusinessProfile();
  // Remount on business changes so PINs, staff cards and pending UI actions never cross companies.
  return <StaffWorkspace key={activeCompanyId} companyId={activeCompanyId} />;
}

function StaffWorkspace({ companyId }: { companyId: string }) {
  const [people, setPeople] = useState<StaffDirectoryEntry[]>([]);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [audit, setAudit] = useState<StaffAudit[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const loadGeneration = useRef(0);

  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRoleChoice>("cashier");
  const [newPin, setNewPin] = useState("");
  const [unlockPin, setUnlockPin] = useState("");
  const [chosen, setChosen] = useState("");
  const [resetPins, setResetPins] = useState<Record<string, string>>({});
  const [confirmDisable, setConfirmDisable] = useState<string | null>(null);
  const [confirmRoleChange, setConfirmRoleChange] = useState<string | null>(null);
  const [float, setFloat] = useState("0");
  const [count, setCount] = useState("");
  const [cashPreview, setCashPreview] = useState<{ expectedCashMinor: number; movementMinor: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  const refresh = useCallback(async () => {
    const generation = ++loadGeneration.current;
    try {
      const [members, allShifts] = await Promise.all([
        listStaff(),
        db.staffShifts.where("businessProfileId").equals(companyId).toArray(),
      ]);
      if (generation !== loadGeneration.current) return;
      const actor = members.find((member) => member.id === currentStaffId(companyId) && !member.disabledAt);
      // No staff-audit reads are needed for a locked cashier or a nonmanager.
      const privileged = actor?.role === "owner" || actor?.role === "supervisor";
      const logs = privileged
        ? await db.staffAudits.where("businessProfileId").equals(companyId).toArray()
        : [];
      if (generation !== loadGeneration.current) return;
      setPeople(members);
      setShifts(allShifts.sort((a, b) => b.openedAt.localeCompare(a.openedAt)));
      setUnlocked(Boolean(actor));
      setAudit(privileged ? logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 40) : []);
      setLoadState("ready");
    } catch {
      if (generation !== loadGeneration.current) return;
      setPeople([]);
      setShifts([]);
      setAudit([]);
      setUnlocked(false);
      setLoadState("error");
    }
  }, [companyId]);

  useEffect(() => {
    void refresh();
    const onSession = () => { setAudit([]); setUnlockPin(""); setNewPin(""); setResetPins({}); void refresh(); };
    window.addEventListener(STAFF_SESSION_CHANGED, onSession);
    return () => {
      ++loadGeneration.current;
      window.removeEventListener(STAFF_SESSION_CHANGED, onSession);
    };
  }, [refresh]);

  const ownId = currentStaffId(companyId);
  const activeMember = unlocked ? people.find((person) => person.id === ownId && !person.disabledAt) : undefined;
  const isOwner = activeMember?.role === "owner";
  const currentShift = shifts.find((shift) => shift.staffId === ownId && !shift.closedAt);
  const myShifts = shifts.filter((shift) => shift.staffId === ownId).slice(0, 10);
  const activeCount = people.filter((person) => !person.disabledAt).length;
  const validNewPin = /^\d{6,12}$/.test(newPin);
  const validUnlockPin = /^\d{6,12}$/.test(unlockPin);
  const openingMinor = numberInMinorUnits(float);
  const countedMinor = numberInMinorUnits(count);

  useEffect(() => {
    let current = true;
    setCashPreview(null);
    if (currentShift && unlocked) {
      void previewShiftCash(currentShift.id).then((value) => {
        if (current) setCashPreview(value);
      }).catch(() => {
        if (current) setCashPreview(null);
      });
    }
    return () => { current = false; };
  }, [currentShift?.id, companyId, unlocked]);

  const run = async (action: () => Promise<unknown>, success = "Staff changes saved.") => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await refresh();
      toast.success(success);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Staff operation failed.");
    } finally {
      setBusy(false);
    }
  };

  const addMember = () => {
    if (!name.trim() || !validNewPin) return;
    const selectedRole: StaffRoleChoice = people.length === 0 ? "owner" : role;
    void run(async () => {
      await createStaff(name, selectedRole, newPin);
      setName("");
      setNewPin("");
    }, people.length === 0 ? "Owner account created. Unlock to continue." : "Staff member added.");
  };
  const unlockWithPin = () => {
    if (!chosen || !validUnlockPin) return;
    void run(async () => {
      await unlockStaff(chosen, unlockPin);
      setUnlockPin("");
    }, "Staff session unlocked.");
  };
  const updateResetPin = (id: string, value: string) => {
    setResetPins((current) => ({ ...current, [id]: value }));
  };

  return <main className="settings-workspace staff-settings-page">
    <section className="settings-hero" aria-labelledby="staff-settings-title">
      <div className="settings-hero-main">
        <p className="settings-eyebrow">SETTINGS <ChevronRight size={14} aria-hidden="true" /> TEAM ACCESS</p>
        <h1 id="staff-settings-title">Staff &amp; permissions</h1>
        <p>Organize your team, keep access in the right hands, and manage daily cashier shifts.</p>
        <div className="settings-hero-note"><ShieldCheck size={19} aria-hidden="true" />
          <span><strong>Device-local protection.</strong> Staff PINs and permissions work on this device. They do not provide cloud identities, remote revocation, or protection against direct browser database access.</span>
        </div>
      </div>
      <div className="settings-hero-symbol" aria-hidden="true"><UsersRound size={63} strokeWidth={1.35}/></div>
    </section>

    <div className="settings-stats settings-stats-three">
      <div className="settings-stat"><span className="settings-stat-icon"><UsersRound size={20}/></span><span className="settings-stat-label">Team members</span><strong>{activeCount.toLocaleString()}</strong><span className="settings-stat-help">Active local accounts</span></div>
      <div className="settings-stat"><span className="settings-stat-icon"><LockKeyhole size={20}/></span><span className="settings-stat-label">Session</span><strong>{unlocked ? "Unlocked" : "Locked"}</strong><span className="settings-stat-help">{activeMember?.name ?? "Staff verification required"}</span></div>
      <div className="settings-stat"><span className="settings-stat-icon"><Clock3 size={20}/></span><span className="settings-stat-label">Your cashier shift</span><strong>{currentShift ? "Open" : "Not open"}</strong><span className="settings-stat-help">Cash tracked in minor units</span></div>
    </div>

    {loadState === "error" && <div className="settings-warning" role="alert">
      <CircleAlert size={20} aria-hidden="true" />
      <div><strong>Staff records could not be loaded.</strong><p>Your saved data was not changed. Retry before changing access or shifts.</p></div>
      <button type="button" className="settings-btn settings-btn-outline" onClick={() => void refresh()}>Retry</button>
    </div>}
    {loadState === "loading" && <p role="status" className="settings-loading">Checking staff records on this device…</p>}

    <div className="settings-panel-grid">
      <section className="settings-card" aria-labelledby="staff-access-heading">
        <div className="settings-card-header"><span className="settings-card-icon"><KeyRound size={21}/></span>
          <div><p className="settings-overline">SECURE ACCESS</p><h2 id="staff-access-heading">Staff session</h2><p>Unlock the right account before working with business records.</p></div>
        </div>
        {unlocked ? <div className="settings-card-body">
          <div className="settings-identity"><span className="settings-avatar">{activeMember?.name.slice(0, 1).toUpperCase() ?? "✓"}</span><div><strong>{activeMember?.name ?? "Verified staff"}</strong><span>{activeMember?.role ?? "Staff"} · Signed in on this device</span></div><StaffStatus active /></div>
          <button type="button" className="settings-btn settings-btn-outline" onClick={() => { lockStaff(companyId); setUnlocked(false); setAudit([]); setNewPin(""); setUnlockPin(""); setResetPins({}); }} disabled={busy}><LockKeyhole size={16}/>Lock this session</button>
          <div className="settings-inline-actions">
            <button type="button" className="settings-btn settings-btn-subtle" disabled={busy} onClick={() => void run(() => enrollStaffAuthenticator(), "Device unlock registered.")}><Fingerprint size={17}/>Register device unlock</button>
            {activeMember?.hasAuthenticator && <button type="button" className="settings-btn settings-btn-subtle" disabled={busy} onClick={() => void run(() => revokeStaffAuthenticator(activeMember.id), "Device unlock removed.")}>Remove device unlock</button>}
          </div>
        </div> : <div className="settings-card-body settings-stack">
          {people.length === 0 ? <p className="settings-empty-note">Start by creating the first owner account below. You can unlock it here afterwards.</p> : <>
            <label className="settings-field"><span>Staff member</span><select aria-label="Staff member" value={chosen} onChange={(event) => setChosen(event.target.value)} disabled={busy}>{<option value="">Choose your account</option>}{people.filter((person) => !person.disabledAt).map((person) => <option key={person.id} value={person.id}>{person.name} ({person.role})</option>)}</select></label>
            <label className="settings-field"><span>Staff PIN</span><input aria-label="Staff PIN" type="password" inputMode="numeric" autoComplete="off" placeholder="Enter 6–12 digits" value={unlockPin} onChange={(event) => setUnlockPin(event.target.value)} disabled={busy}/></label>
            <div className="settings-inline-actions">
              <button type="button" className="settings-btn settings-btn-primary" disabled={busy || !chosen || !validUnlockPin} onClick={unlockWithPin}><KeyRound size={17}/>Unlock with PIN</button>
              <button type="button" className="settings-btn settings-btn-outline" disabled={busy || !chosen || !people.find((person) => person.id === chosen)?.hasAuthenticator} onClick={() => void run(async () => { await unlockStaffWithAuthenticator(chosen); setUnlockPin(""); }, "Staff session unlocked.")}><Fingerprint size={17}/>Use device unlock</button>
            </div>
          </>}
        </div>}
        <p className="settings-card-footnote">Device unlock uses supported biometrics or security keys in a secure browser context. The PIN remains available.</p>
      </section>

      <section className="settings-card" aria-labelledby="staff-add-heading">
        <div className="settings-card-header"><span className="settings-card-icon"><Plus size={21}/></span>
          <div><p className="settings-overline">YOUR TEAM</p><h2 id="staff-add-heading">{people.length === 0 ? "Create your first owner" : "Add a staff member"}</h2><p>{people.length === 0 ? "An owner must be set up first to protect staff access." : "Create an account with a role and a private PIN."}</p></div>
        </div>
        <div className="settings-card-body settings-stack">
          <label className="settings-field"><span>Full name</span><input aria-label="Staff name" value={name} maxLength={80} autoComplete="off" placeholder="Staff member’s name" onChange={(event) => setName(event.target.value)} disabled={busy} /></label>
          <div className="settings-fields-two">
            <label className="settings-field"><span>Role</span><select aria-label="Staff role" value={people.length === 0 ? "owner" : role} disabled={busy || people.length === 0} onChange={(event) => setRole(event.target.value as StaffRoleChoice)}><option value="owner" disabled={people.length > 0}>Owner</option><option value="supervisor">Supervisor</option><option value="cashier">Cashier</option></select></label>
            <label className="settings-field"><span>New staff PIN</span><input aria-label="New staff PIN" type="password" inputMode="numeric" autoComplete="new-password" placeholder="6–12 digits" value={newPin} onChange={(event) => setNewPin(event.target.value)} disabled={busy}/></label>
          </div>
          <button type="button" className="settings-btn settings-btn-primary" disabled={busy || loadState !== "ready" || !name.trim() || !validNewPin || (people.length > 0 && !isOwner)} onClick={addMember}><Plus size={17}/>{people.length === 0 ? "Create owner account" : "Add team member"}</button>
          {people.length > 0 && !isOwner && <p className="settings-field-hint">Unlock an owner session to add or manage staff accounts.</p>}
        </div>
      </section>
    </div>

    <section className="settings-card settings-directory" aria-labelledby="staff-directory-title">
      <div className="settings-card-header settings-card-header-split"><span className="settings-card-icon"><UsersRound size={21}/></span>
        <div><p className="settings-overline">DIRECTORY</p><h2 id="staff-directory-title">Your team</h2><p>Review roles and active access for this company.</p></div>
        <span className="settings-count-pill">{people.length} total</span>
      </div>
      <div className="settings-team-list">
        {people.length === 0 ? <p className="settings-empty-note">No staff accounts yet. Create your first owner using the form above.</p> : people.map((person) => {
          const editable = isOwner && person.role !== "owner";
          const permissions = person.permissions ?? [...rolePermissions(person.role)];
          const resetValue = resetPins[person.id] ?? "";
          return <article className="settings-team-member" key={person.id}>
            <div className="settings-team-head"><span className="settings-avatar">{person.name.slice(0, 1).toUpperCase()}</span>
              <div className="settings-team-person"><strong>{person.name}</strong><span>{person.role.charAt(0).toUpperCase() + person.role.slice(1)} · {person.hasAuthenticator ? "Device unlock enrolled" : "PIN sign-in"}</span></div>
              <StaffStatus active={!person.disabledAt}/>
            </div>
            {editable && <div className="settings-team-editor">
              <div className="settings-team-actions">
                {person.disabledAt ? <button type="button" className="settings-btn settings-btn-outline" disabled={busy} onClick={() => void run(() => changeStaffStatus(person.id, false), person.name + " enabled.")}>Enable account</button> :
                  confirmDisable === person.id ? <><span className="settings-confirm-text">Disable {person.name}?</span>
                    <button type="button" className="settings-btn settings-btn-danger" disabled={busy} onClick={() => { setConfirmDisable(null); void run(() => changeStaffStatus(person.id, true), person.name + " disabled."); }}>Confirm disable</button>
                    <button type="button" className="settings-btn settings-btn-subtle" onClick={() => setConfirmDisable(null)}>Cancel</button></> :
                  <button type="button" className="settings-btn settings-btn-outline" disabled={busy} onClick={() => setConfirmDisable(person.id)}><ShieldOff size={16}/>Disable account</button>}
                {confirmRoleChange === person.id ? <>
                  <span className="settings-confirm-text">Change {person.name} to {person.role === "cashier" ? "supervisor" : "cashier"}? This resets custom permissions to the new role defaults.</span>
                  <button type="button" className="settings-btn settings-btn-primary" disabled={busy} onClick={() => {
                    setConfirmRoleChange(null);
                    void run(() => changeStaffRole(person.id, person.role === "cashier" ? "supervisor" : "cashier"), "Staff role updated.");
                  }}>Confirm role change</button>
                  <button type="button" className="settings-btn settings-btn-subtle" onClick={() => setConfirmRoleChange(null)}>Cancel</button>
                </> : <button type="button" className="settings-btn settings-btn-subtle" disabled={busy} onClick={() => setConfirmRoleChange(person.id)}>
                  {person.role === "cashier" ? "Promote to supervisor" : "Change to cashier"}
                </button>}
              </div>
              <details className="settings-team-details"><summary><ShieldCheck size={16}/>Role permissions <ChevronRight size={15} aria-hidden="true"/></summary>
                <p className="settings-field-hint">Permissions can only be reduced or restored within this person's role. Changes take effect on this device.</p>
                <div className="settings-permission-grid">{rolePermissions(person.role).map((permission) =>
                  <label key={permission} className="settings-permission-row">
                    <input type="checkbox" checked={permissions.includes(permission)} disabled={busy || Boolean(person.disabledAt)} onChange={(event) => {
                      const next = event.target.checked ? [...permissions, permission] : permissions.filter((value) => value !== permission);
                      void run(() => setStaffPermissions(person.id, next), "Permissions updated.");
                    }} />
                    <span><strong>{PERMISSION_NAMES[permission]}</strong><small>{PERMISSION_HELP[permission]}</small></span>
                  </label>
                )}</div>
              </details>
              <details className="settings-team-details"><summary><KeyRound size={16}/>Reset staff PIN <ChevronRight size={15} aria-hidden="true"/></summary>
                <div className="settings-inline-actions settings-pin-reset">
                  <label className="settings-field"><span>New PIN for {person.name}</span><input type="password" inputMode="numeric" autoComplete="new-password" aria-label={"New PIN for " + person.name} placeholder="6–12 digits" value={resetValue} disabled={busy} onChange={(event) => updateResetPin(person.id, event.target.value)}/></label>
                  <button type="button" className="settings-btn settings-btn-outline" disabled={busy || !/^\d{6,12}$/.test(resetValue)} onClick={() => void run(async () => {
                    await resetStaffPin(person.id, resetValue);
                    setResetPins((current) => ({ ...current, [person.id]: "" }));
                  }, "Staff PIN reset.")}>Save new PIN</button>
                </div>
              </details>
            </div>}
          </article>;
        })}
      </div>
    </section>

    <div className="settings-panel-grid settings-lower-grid">
      <section className="settings-card" aria-labelledby="staff-shift-title">
        <div className="settings-card-header"><span className="settings-card-icon"><Wallet size={21}/></span>
          <div><p className="settings-overline">CASHIER OPERATIONS</p><h2 id="staff-shift-title">Cashier shift</h2><p>Open a shift, review tracked cash, and reconcile at closing.</p></div>
        </div>
        <div className="settings-card-body settings-stack">
          {currentShift ? <>
            <div className="settings-shift-status"><BadgeCheck size={20}/><div><strong>Shift in progress</strong><span>Opened {readableDate(currentShift.openedAt)}</span></div></div>
            <div className="settings-shift-amount"><span>Expected tracked cash</span><strong>{cashPreview?.expectedCashMinor ?? "Unavailable"}</strong><small>Minor units · includes only attributed movements</small></div>
            <label className="settings-field"><span>Physically counted cash (minor units)</span><input value={count} onChange={(event) => setCount(event.target.value)} inputMode="numeric" placeholder="Enter counted cash" aria-label="Counted cash (minor units)" disabled={busy}/></label>
            <button type="button" className="settings-btn settings-btn-primary" disabled={busy || countedMinor === null || cashPreview === null} onClick={() => { if (countedMinor !== null) void run(async () => { await closeShift(currentShift.id, countedMinor); setCount(""); }, "Shift closed and variance recorded."); }}>Close shift &amp; record variance</button>
          </> : <>
            <label className="settings-field"><span>Opening float (minor units)</span><input value={float} onChange={(event) => setFloat(event.target.value)} inputMode="numeric" aria-label="Opening float (minor units)" disabled={busy}/></label>
            <button type="button" className="settings-btn settings-btn-primary" disabled={busy || !unlocked || openingMinor === null} onClick={() => { if (openingMinor !== null) void run(() => openShift(openingMinor), "Cashier shift opened."); }}><Clock3 size={17}/>Open cashier shift</button>
          </>}
          <p className="settings-field-hint">Expected cash includes only movements attributed to this shift. Reconcile actual cash; unrecorded petty cash and external settlements might not appear.</p>
        </div>
      </section>

      <section className="settings-card" aria-labelledby="staff-history-title">
        <div className="settings-card-header"><span className="settings-card-icon"><Activity size={21}/></span>
          <div><p className="settings-overline">YOUR ACTIVITY</p><h2 id="staff-history-title">Shift history</h2><p>Recent shifts for the currently verified staff member.</p></div>
        </div>
        <div className="settings-history">
          {myShifts.length === 0 ? <p className="settings-empty-note">No shifts for the current staff member yet.</p> :
            myShifts.map((shift) => <div className="settings-history-row" key={shift.id}>
              <div><strong>{readableDate(shift.openedAt)}</strong><span>{shift.closedAt ? "Closed" : "Open"} · Opening float: {shift.openingFloatMinor} minor units</span></div>
              <div><span>Expected: {shift.expectedCashMinor ?? "—"}</span><span>Counted: {shift.countedCashMinor ?? "—"} · Variance: {shift.varianceMinor ?? "—"}</span></div>
            </div>)}
        </div>
      </section>
    </div>

    {audit.length > 0 && <section className="settings-card" aria-labelledby="staff-audit-title">
      <div className="settings-card-header"><span className="settings-card-icon"><Activity size={21}/></span>
        <div><p className="settings-overline">MANAGER VIEW</p><h2 id="staff-audit-title">Recent staff activity</h2><p>The latest locally recorded staff actions, visible to authorized managers.</p></div>
      </div>
      <div className="settings-history">{audit.map((event) => <div className="settings-history-row" key={event.id}>
        <div><strong>{people.find((person) => person.id === event.staffId)?.name ?? "Former staff"}</strong><span>{readableDate(event.createdAt)}</span></div>
        <div><strong>{event.action}</strong><span>{event.details}</span></div>
      </div>)}</div>
    </section>}
  </main>;
}
