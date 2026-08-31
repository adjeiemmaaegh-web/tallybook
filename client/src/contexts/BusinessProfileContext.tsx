/** Tactile Ledger design reminder: the active company is local workspace state, not an account or cloud identity. */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useDatabase } from "@/contexts/DatabaseContext";
import { db } from "@/db/TallybookDB";
import { getLastBackupCompanyId } from "@/features/backup/backup";
import { createBusinessProfile, saveBusinessProfile, type BusinessProfile, type BusinessProfileInput } from "@/features/business/businessProfile";
import { clearCompanyData, getActiveBusinessProfileId, getLocalCompanyProfiles, loadActiveBusinessProfileId, persistActiveBusinessProfileId } from "@/features/business/activeCompany";

interface BusinessProfileContextValue {
  profile: BusinessProfile | null;
  companies: BusinessProfile[];
  activeCompanyId: string;
  lastBackupCompanyId: string | null;
  status: "waiting" | "loading" | "ready" | "error";
  error: string | null;
  refresh: () => Promise<void>;
  save: (values: BusinessProfileInput) => Promise<BusinessProfile>;
  createCompany: (values: BusinessProfileInput) => Promise<BusinessProfile>;
  switchCompany: (companyId: string) => Promise<void>;
  clearCompany: (companyId: string, confirmation: string) => Promise<void>;
}

const BusinessProfileContext = createContext<BusinessProfileContextValue | undefined>(undefined);

export function BusinessProfileProvider({ children }: { children: ReactNode }) {
  const { status: databaseStatus } = useDatabase();
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [companies, setCompanies] = useState<BusinessProfile[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState(getActiveBusinessProfileId());
  const [lastBackupCompanyId, setLastBackupCompanyId] = useState<string | null>(null);
  const [status, setStatus] = useState<BusinessProfileContextValue["status"]>("waiting");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (databaseStatus !== "ready") {
      setStatus(databaseStatus === "error" ? "error" : "waiting");
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const [activeId, allCompanies, backupCompanyId] = await Promise.all([loadActiveBusinessProfileId(db), getLocalCompanyProfiles(db), getLastBackupCompanyId(db)]);
      setActiveCompanyId(activeId);
      setLastBackupCompanyId(backupCompanyId);
      setCompanies(allCompanies);
      setProfile(allCompanies.find((company) => company.id === activeId) ?? null);
      setStatus("ready");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "We could not read your saved companies.");
    }
  }, [databaseStatus]);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback(async (values: BusinessProfileInput) => {
    const saved = await saveBusinessProfile(values);
    await refresh();
    return saved;
  }, [refresh]);

  const createCompany = useCallback(async (values: BusinessProfileInput) => {
    const created = await createBusinessProfile(values);
    await persistActiveBusinessProfileId(created.id, db);
    await refresh();
    return created;
  }, [refresh]);

  const switchCompany = useCallback(async (companyId: string) => {
    const company = await db.businessProfiles.get(companyId);
    if (!company) throw new Error("That company is no longer available on this device.");
    await persistActiveBusinessProfileId(company.id, db);
    await refresh();
  }, [refresh]);

  const clearCompany = useCallback(async (companyId: string, confirmation: string) => {
    const company = await db.businessProfiles.get(companyId);
    if (!company || company.id !== activeCompanyId) throw new Error("Open the company you want to clear before continuing.");
    if (confirmation.trim() !== company.name.trim()) throw new Error("Type the company name exactly to confirm clearing.");
    if (lastBackupCompanyId !== companyId) throw new Error("Make a fresh backup for this company before clearing it.");
    await clearCompanyData(companyId, db);
    await refresh();
  }, [activeCompanyId, lastBackupCompanyId, refresh]);

  const value = useMemo(() => ({ profile, companies, activeCompanyId, lastBackupCompanyId, status, error, refresh, save, createCompany, switchCompany, clearCompany }), [profile, companies, activeCompanyId, lastBackupCompanyId, status, error, refresh, save, createCompany, switchCompany, clearCompany]);
  return <BusinessProfileContext.Provider value={value}>{children}</BusinessProfileContext.Provider>;
}

export function useBusinessProfile() {
  const context = useContext(BusinessProfileContext);
  if (!context) throw new Error("useBusinessProfile must be used within BusinessProfileProvider.");
  return context;
}
