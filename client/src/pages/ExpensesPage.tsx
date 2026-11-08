import { DeviceBusinessSetup } from "@/components/DeviceBusinessSetup";
/** Tallybook Africa Stage 8 design reminder: expenses are a compact, local-only owner record; completed entries are shown as immutable history and never change stock, purchases, sales, collections, or debt. */
import { ArrowLeft, BarChart3, ClipboardList, Plus, ReceiptText, Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { Link } from "wouter";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { expenseCategories, expenseCategoryLabels, createExpense, listExpenses, localExpenseDate, type Expense, type ExpenseCategory } from "@/features/expenses/expenses";
import { formatMinorAmount } from "@/features/inventory/inventory";

const expenseDateLabel = (expenseDate: string) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${expenseDate}T12:00:00`));

export default function ExpensesPage() {
  const { profile, activeCompanyId } = useBusinessProfile();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>("transport");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => localExpenseDate());
  const [note, setNote] = useState("");
  const submissionKey = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try { setExpenses(await listExpenses()); }
    catch (error) { toast.error(error instanceof Error ? error.message : "We could not read saved expenses."); }
    finally { setLoading(false); }
  }, [activeCompanyId, profile]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { setExpenses([]); }, [activeCompanyId]);
  useEffect(() => {
    const update = () => { void refresh(); };
    window.addEventListener("focus", update); window.addEventListener("pageshow", update);
    return () => { window.removeEventListener("focus", update); window.removeEventListener("pageshow", update); };
  }, [refresh]);

  const saveExpense = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile || saving) return;
    setSaving(true);
    try {
      submissionKey.current ??= nanoid(18);
      const saved = await createExpense({ category, amount, expenseDate, note, currency: profile.currency, submissionKey: submissionKey.current });
      submissionKey.current = null;
      setAmount(""); setExpenseDate(localExpenseDate()); setNote(""); setCategory("transport");
      toast.success(`${formatMinorAmount(saved.amountMinor, profile.currency)} was saved as ${expenseCategoryLabels[saved.category].toLowerCase()}.`);
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "We could not save this expense."); }
    finally { setSaving(false); }
  };

  if (!profile) return <DeviceBusinessSetup description="Choose your business currency to begin recording expenses." />;

  return <div className="expenses-page">
    <section className="expenses-hero"><p className="eyebrow"><span className="eyebrow-dot" />Money spent on your business</p><span className="workspace-marker">EXP</span><h1>Keep spending <em>clear.</em></h1><p>Record ordinary costs on this device so you can see where money goes. Saved expenses do not change stock, supplier purchases, sales, or customer balances.</p><div className="expenses-hero-actions"><Link href="/business-health" className="primary-action"><BarChart3 className="h-4 w-4" aria-hidden="true" />Business Health</Link><Link href="/reports" className="secondary-action">Open reports</Link></div></section>
    <p className="expenses-boundary"><ClipboardList className="h-4 w-4" aria-hidden="true" /><span><strong>Saved as a local history.</strong> Once saved, an expense stays read-only in this stage. Record only money you spent; a supplier purchase remains separate stock history.</span></p>
    <div className="expenses-grid">
      <section className="expense-sheet" aria-labelledby="record-expense-title"><div className="expense-sheet-head"><div><p className="ledger-kicker">01 · Record money spent</p><h2 id="record-expense-title">Add an expense</h2></div><Plus className="h-5 w-5 text-baobab" aria-hidden="true" /></div><form className="expense-form" onSubmit={(event) => void saveExpense(event)} noValidate><label><span>Expense category</span><select value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)}>{expenseCategories.map((value) => <option key={value} value={value}>{expenseCategoryLabels[value]}</option>)}</select></label><label><span>Amount ({profile.currency})</span><Input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label><label><span>Date</span><Input required type="date" max={localExpenseDate()} value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} /></label><label><span>Short note <em>Optional</em></span><Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={240} placeholder="For example, delivery to the market" /></label><div className="expense-form-footer"><span>Saved on this device</span><button className="primary-action" type="submit" disabled={saving}><Save className="h-4 w-4" aria-hidden="true" />{saving ? "Saving…" : "Save expense"}</button></div></form></section>
      <section className="expense-sheet" aria-labelledby="expense-history-title"><div className="expense-sheet-head"><div><p className="ledger-kicker">02 · Read-only history</p><h2 id="expense-history-title">Saved expenses</h2></div><span>{expenses.length}</span></div>{loading ? <p className="inventory-loading">Reading saved expenses…</p> : expenses.length ? <div className="expense-history-list">{expenses.map((expense) => <article key={expense.id}><div><strong>{expenseCategoryLabels[expense.category]}</strong><span>{expenseDateLabel(expense.expenseDate)}{expense.note ? ` · ${expense.note}` : ""}</span></div><b>{formatMinorAmount(expense.amountMinor, profile.currency)}</b></article>)}</div> : <div className="expense-empty"><ReceiptText className="h-7 w-7 text-baobab" aria-hidden="true" /><h3>No expenses saved yet.</h3><p>Add transport, rent, utilities, supplies, repairs, or another business cost when you spend it.</p></div>}</section>
    </div>
    <Link href="/reports" className="secondary-action expenses-back"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to reports</Link>
  </div>;
}
