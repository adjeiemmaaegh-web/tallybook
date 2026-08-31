import { Building2, ChevronDown } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";

export function CompanySwitcher({ compact = false }: { compact?: boolean }) {
  const { profile, companies = [], activeCompanyId, switchCompany } = useBusinessProfile();

  const onChange = async (companyId: string) => {
    if (companyId === activeCompanyId) return;
    try {
      await switchCompany(companyId);
      toast.success("Company changed. The next screens use only that company’s saved records.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "We could not change company.");
    }
  };

  if (!profile) return <Link href="/business" className="company-switcher-empty"><Building2 className="h-4 w-4" aria-hidden="true" />Set up a company</Link>;
  return <div className={`company-switcher ${compact ? "company-switcher-compact" : ""}`}>
    <Building2 className="company-switcher-icon" aria-hidden="true" />
    <label className="sr-only" htmlFor={compact ? "company-switcher-mobile" : "company-switcher-desktop"}>Active company</label>
    <select id={compact ? "company-switcher-mobile" : "company-switcher-desktop"} value={activeCompanyId} onChange={(event) => void onChange(event.target.value)} aria-label="Active company">
      {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
    </select>
    <ChevronDown className="company-switcher-chevron" aria-hidden="true" />
    {!compact ? <Link href="/business?view=companies" className="company-switcher-manage">Manage</Link> : null}
  </div>;
}
