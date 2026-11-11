/** Ask: plain questions about the shop, answered from its own numbers. Read-only; see shopAssistant.ts. */
import { type FormEvent, useRef, useState } from "react";
import { dayRange } from "./salesFilters";
import { getDailyReport, getProfitReport, permissionsOf, type ShopOverview } from "./shopClient";
import { answerShopQuestion, EXAMPLES, parseShopQuestion, type Answer, type AskContext, type PurchaseDraft } from "./shopAssistant";

interface Turn { id: number; question: string; answer: Answer }
interface Props { companyId: string; overview: ShopOverview; online: boolean; onDraft?: (draft: PurchaseDraft) => void }

export function SharedShopAsk({ companyId, overview, online, onDraft }: Props) {
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const next = useRef(1);
  const owner = overview.role === "owner";
  const ctx: AskContext = {
    role: owner ? "owner" : "attendant", currency: overview.currency ?? "GHS",
    products: overview.products, stores: overview.stores, stock: overview.stock,
    // Customers' balances only for people allowed to handle credit.
    customers: owner || permissionsOf(overview).canCredit ? overview.customers ?? [] : undefined,
    loadReport: period => getDailyReport(companyId, dayRange(period) as { from: string; to: string }),
    loadProfit: period => getProfitReport(companyId, dayRange(period) as { from: string; to: string }),
  };
  const ask = async (raw: string) => {
    const question = raw.trim().slice(0, 200);
    if (!question || busy) return;
    setBusy(true);
    let answer: Answer;
    try { answer = await answerShopQuestion(parseShopQuestion(question), ctx); }
    catch { answer = { text: online ? "I couldn't get that just now. Try again in a moment." : "I need an internet connection for sales and profit. Stock, prices and balances work offline." }; }
    setTurns(t => [{ id: next.current++, question, answer }, ...t].slice(0, 8));
    setText(""); setBusy(false);
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void ask(text); };
  const examples = owner ? EXAMPLES : EXAMPLES.filter(e => !/order|owes/i.test(e));
  return <section className="shop-card shop-ask" aria-label="Ask about your shop">
    <h2>Ask</h2>
    <p className="shop-muted">Ask in plain words, like “What is low on stock?” or “What did I sell today?”. I only read your shop's numbers; I never change anything.</p>
    <form className="shop-inline-form" onSubmit={submit}>
      <label className="shop-field">Your question
        <input value={text} onChange={e => setText(e.target.value)} maxLength={200} autoComplete="off" placeholder="What is low on stock?" /></label>
      <button className="primary-action" disabled={busy || !text.trim()}>{busy ? "Looking…" : "Ask"}</button>
    </form>
    <div className="shop-chips" role="group" aria-label="Examples">
      {examples.map(e => <button key={e} type="button" className="shop-chip" disabled={busy} onClick={() => void ask(e)}>{e}</button>)}
    </div>
    <ul className="shop-ask-turns" aria-live="polite">{turns.map(t => <li key={t.id}>
      <p className="shop-muted"><strong>You:</strong> {t.question}</p>
      <p>{t.answer.text}</p>
      {t.answer.rows && <ul className="shop-report-list">{t.answer.rows.map((r, i) => <li key={i}><span>{r}</span></li>)}</ul>}
      {t.answer.draft && onDraft && <button type="button" className="secondary-action" onClick={() => onDraft(t.answer.draft!)}>Open this draft on Purchasing</button>}
      {t.answer.suggestions?.map(s => <button key={s} type="button" className="shop-chip" disabled={busy} onClick={() => void ask(s)}>{s}</button>)}
    </li>)}</ul>
  </section>;
}
