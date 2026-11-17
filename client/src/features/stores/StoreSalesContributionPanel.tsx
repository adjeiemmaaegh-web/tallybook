import { useEffect, useState } from "react";
import { getStoreFinancialReport } from "./storeFinancialReport";
import { formatMinorAmount } from "@/features/inventory/inventory";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";

export function StoreFinancialReport({ companyId }: { companyId: string }) {
  const [period, setPeriod] = useState<"today" | "month" | "year">("month");
  const [report, setReport] =
    useState<Awaited<ReturnType<typeof getStoreFinancialReport>>>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setReport(undefined);
    setError("");
    void getStoreFinancialReport(period)
      .then(value => {
        if (active && companyId === getActiveBusinessProfileId())
          setReport(value);
      })
      .catch(cause => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Financial report unavailable."
          );
      });
    return () => {
      active = false;
    };
  }, [companyId, period]);
  const money = (value: number | undefined) =>
    value === undefined
      ? "Unavailable"
      : formatMinorAmount(value, report!.currency);
  return (
    <section
      className="space-y-3 rounded border p-4"
      aria-label="Reconciled store sales"
    >
      <h2 className="text-lg font-semibold">Reconciled store sales</h2>
      <p className="text-sm">
        Saved sales and returns on this device, attributed to the original
        selling store. Contribution is sales less recorded tax and verified
        cost, before company expenses. It is not cash collected or net profit.
      </p>
      <label>
        Period{" "}
        <select
          className="rounded border p-2"
          value={period}
          onChange={event => setPeriod(event.target.value as typeof period)}
        >
          <option value="today">Today</option>
          <option value="month">This month</option>
          <option value="year">This year</option>
        </select>
      </label>
      {error ? (
        <p role="alert">{error}</p>
      ) : !report ? (
        <p role="status">Reconciling saved records…</p>
      ) : (
        <>
          <ul className="space-y-2">
            {report.rows.map(row => (
              <li
                className="rounded border p-3"
                key={row.storeId ?? "historical"}
              >
                <h3 className="font-semibold">{row.name}</h3>
                <p>
                  {row.saleCount} sales · Net sales: {money(row.netSalesMinor)}{" "}
                  · Recorded tax: {money(row.recordedTaxMinor)}
                </p>
                <p>
                  Cost of goods: {money(row.cogsMinor)} · Contribution before
                  expenses: {money(row.contributionMinor)}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-sm">
            Company expenses: {money(report.companyExpensesMinor)}. Expenses and
            pooled inventory costs are not allocated to stores without source
            evidence. Missing historical tax or cost evidence leaves
            contribution unavailable.
          </p>
        </>
      )}
    </section>
  );
}
