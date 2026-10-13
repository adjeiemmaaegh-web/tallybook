import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { createBusiness, getCurrentBusiness, type CloudBusiness } from "./businessIdentity";

/** Account identity only. Creating a cloud business does not claim local data. */
export function CloudBusinessPanel() {
  const [userId, setUserId] = useState<string | null>(null);
  const [business, setBusiness] = useState<CloudBusiness | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    const client = getSupabaseClient();
    const refresh = async () => {
      const started = ++revision.current;
      setUserId(null); setBusiness(null); setError(null); setBusy(true);
      try {
        const { data: { user }, error: authError } = await client.auth.getUser();
        if (!active || started !== revision.current) return;
        if (authError || !user) { setBusy(false); return; }
        setUserId(user.id);
        const result = await getCurrentBusiness();
        if (active && started === revision.current) setBusiness(result);
      } catch (cause) {
        if (active && started === revision.current) setError(cause instanceof Error ? cause.message : "Could not check your cloud business.");
      } finally {
        if (active && started === revision.current) setBusy(false);
      }
    };
    // Defer async auth work outside the Supabase auth callback lock.
    const { data: { subscription } } = client.auth.onAuthStateChange(() => {
      revision.current++;
      setUserId(null); setBusiness(null);
      setTimeout(() => { if (active) void refresh(); }, 0);
    });
    void refresh();
    return () => { active = false; revision.current++; subscription.unsubscribe(); };
  }, []);

  const create = async () => {
    if (!userId || inFlight.current || !name.trim()) return;
    inFlight.current = true;
    const started = revision.current;
    setBusy(true); setError(null);
    try {
      const { data: { user }, error: authError } = await getSupabaseClient().auth.getUser();
      if (authError || user?.id !== userId || started !== revision.current) throw new Error("Your account changed. Check your sign-in and try again.");
      const key = `tallybook.cloud.create.v1:${import.meta.env.VITE_SUPABASE_URL}:${userId}:${encodeURIComponent(name.trim())}`;
      // Persist before the request so a lost response/reload can safely retry.
      if (!navigator.locks) throw new Error("This browser cannot safely prepare a cloud business. Use an updated browser.");
      const requestId = await navigator.locks.request("tallybook.cloud.create", () => {
        const id = localStorage.getItem(key) ?? crypto.randomUUID();
        localStorage.setItem(key, id);
        return id;
      });
      if (started !== revision.current) throw new Error("Your account changed. Check your sign-in and try again.");
      const result = await createBusiness(name, requestId);
      if (started === revision.current && result.owner_id === userId) setBusiness(result);
    } catch (cause) {
      if (started === revision.current) setError(cause instanceof Error ? cause.message : "Could not create the cloud business.");
    } finally {
      inFlight.current = false;
      if (started === revision.current) setBusy(false);
    }
  };

  return <section className="rounded border p-4 space-y-3" aria-label="Cloud business account">
    <h2 className="font-semibold">Cloud business account</h2>
    <p className="text-sm">Prepare your business account for cloud services. Local sales, stock and customer records are not uploaded or linked by this step.</p>
    {!isSupabaseConfigured ? <p>Cloud account access has not been configured.</p> : busy ? <p role="status">Checking your cloud business…</p> : !userId ? <Link href="/account" className="underline">Sign in to prepare your cloud business</Link> : business ? <div role="status"><p className="font-semibold">{business.name}</p><p className="text-sm">{business.owner_id === userId ? "You own this cloud business." : "You are a member of this cloud business."} Record synchronization is not active yet.</p></div> : <form className="space-y-2" onSubmit={event => { event.preventDefault(); void create(); }}>
      <label className="block" htmlFor="cloud-business-name">Cloud business name</label>
      <input className="w-full rounded border p-2" id="cloud-business-name" value={name} onChange={event => setName(event.target.value)} required maxLength={80} />
      <button className="rounded border px-4 py-2" type="submit" disabled={!name.trim()}>Create cloud business</button>
    </form>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
