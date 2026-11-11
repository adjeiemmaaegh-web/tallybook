import { useState } from "react";
import { filterHelp, HELP_TOPICS } from "./shopHelpContent";

/** A searchable guide, opened from the foot of the shop page. Works offline: it is part of the app. */
export function ShopHelp({ role = "all" }: { role?: "owner" | "attendant" | "all" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<"mine" | "all">(role === "all" ? "all" : "mine");
  const topics = filterHelp(HELP_TOPICS, query, only === "mine" ? role : "all");
  const sections = [...new Set(topics.map(t => t.section))];
  if (!open) return <button type="button" className="shop-link-button" onClick={() => setOpen(true)}>Help and questions</button>;
  return <section className="shop-card shop-help" aria-label="Help and questions">
    <div className="shop-card-head"><h2>Help and questions</h2>
      <button type="button" className="secondary-action" onClick={() => setOpen(false)}>Close</button></div>
    <label className="shop-field">Search
      <input type="search" value={query} onChange={e => setQuery(e.target.value)} maxLength={60} autoComplete="off" placeholder="e.g. refund, stock, offline" aria-label="Search help" /></label>
    {role !== "all" && <div className="shop-chips" role="group" aria-label="Show">
      <button type="button" className="shop-chip" aria-pressed={only === "mine"} onClick={() => setOnly("mine")}>For me</button>
      <button type="button" className="shop-chip" aria-pressed={only === "all"} onClick={() => setOnly("all")}>Everything</button></div>}
    {!topics.length && <p className="shop-muted" role="status">Nothing matches “{query}”. Try one word, like “stock” or “refund”, or use Report a problem to ask.</p>}
    {sections.map(section => <div key={section}>
      <h3>{section}</h3>
      {topics.filter(t => t.section === section).map(t => <details key={t.id}>
        <summary>{t.question}{t.audience !== "everyone" && only === "all" && role !== "all" ? <small className="shop-muted"> ({t.audience === "owner" ? "owner" : "attendant"})</small> : null}</summary>
        {t.answer.map((p, i) => <p key={i}>{p}</p>)}</details>)}
    </div>)}
  </section>;
}
