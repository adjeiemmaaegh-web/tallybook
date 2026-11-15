/**
 * First-time, conversation-only local business setup.
 *
 * Deliberately uses the SAME validated BusinessProfileContext.save write path
 * as /business. No bypass of staff permissions, cloud-auth gates, or identity.
 * No write occurs until the owner confirms the complete preview.
 */
import { useRef, useState, type FormEvent } from "react";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { businessTypes, countries, type BusinessProfileInput } from "@/features/business/businessProfile";

type Phase = "name" | "country" | "type" | "review" | "saving";
const suggestions = [
  "Retail shop", "Clothing or fashion", "Salon or barber",
  "Food or restaurant", "Mechanic or repair", "Professional service",
  "Market trader", "Wholesale", "Home-based business", "Other",
] as const;

function countryFrom(text: string) {
  const lower=text.toLowerCase();
  const matched=countries.filter(item=>new RegExp(`\\b${item.value.toLowerCase()}\\b`).test(lower));
  return matched.length===1?matched[0]:null;
}
function businessTypeFrom(text: string) {
  const lower=text.toLowerCase().trim();
  const exact=businessTypes.find(item=>item.toLowerCase()===lower);
  if(exact)return exact;
  const tokens:[RegExp, typeof businessTypes[number]][]=[
    [/\b(retail|provision|grocery|convenience)\b/i,"Retail shop"],
    [/\b(cloth|fashion|apparel|boutique)\b/i,"Clothing or fashion"],
    [/\b(salon|barber|hairdress)\b/i,"Salon or barber"],
    [/\b(food|restaurant|catering|eatery)\b/i,"Food or restaurant"],
    [/\b(mechanic|repair|garage)\b/i,"Mechanic or repair"],
    [/\b(professional|consult|agency)\b/i,"Professional service"],
    [/\b(market|stall|trader)\b/i,"Market trader"],
    [/\b(wholesale|distributor)\b/i,"Wholesale"],
    [/\b(home based|home-based|from home)\b/i,"Home-based business"],
  ];
  const matches=tokens.filter(([pattern])=>pattern.test(lower));
  return matches.length===1?matches[0][1]:null;
}

export function ClementiaBusinessOnboarding() {
  const {save, activeCompanyId, status}=useBusinessProfile();
  const [phase,setPhase]=useState<Phase>("name");
  const [name,setName]=useState("");
  const [country,setCountry]=useState<typeof countries[number] | null>(null);
  const [businessType,setBusinessType]=useState<typeof businessTypes[number] | null>(null);
  const [input,setInput]=useState("");
  const [error,setError]=useState("");
  const [savedNotice,setSavedNotice]=useState("");
  const writing=useRef(false);
  const busy=phase==="saving"||status!=="ready";

  const reset=()=>{setPhase("name");setName("");setCountry(null);setBusinessType(null);setInput("");setError("");};
  const choose=(text:string)=>{
    if(busy)return;
    setError("");
    if(phase==="name"){
      const candidate=text.trim().replace(/^(?:my\s+(?:business|shop)\s+(?:is\s+)?(?:named\s+)?|it'?s\s+(?:called\s+)?|call\s+it\s+)/i,"").replace(/\s+/g," ");
      if(candidate.length<2||candidate.length>80){setError("Tell me your business name (2–80 characters).");return;}
      setName(candidate);setPhase("country");
    }else if(phase==="country"){
      const selected=countryFrom(text);
      if(!selected){setError("Please name one country from the supported choices. I won't guess your currency.");return;}
      setCountry(selected);setPhase("type");
    }else if(phase==="type"){
      const selected=businessTypeFrom(text);
      if(!selected){setError("Please describe the business type more specifically. I won't guess.");return;}
      setBusinessType(selected);setPhase("review");
    }
    setInput("");
  };
  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    if(busy)return;
    if(phase!=="review"){choose(input);return;}
    // A typed 'yes' or other generic affirmative does not count: the user
    // must type this exact confirmation phrase or press the explicit button.
    if(input.trim().toLowerCase()!=="confirm business setup"){
      setError("Please type “Confirm business setup” or press the confirmation button.");
      return;
    }
    await confirm();
  };
  const confirm=async()=>{
    if(writing.current||phase!=="review"||!country||!businessType||status!=="ready")return;
    writing.current=true;
    setPhase("saving");setError("");
    const values:BusinessProfileInput={
      name,country:country.value,currency:country.currency,
      businessType,preferredPaymentMethod:"cash",
      phone:"",email:"",address:"",
    };
    try{
      // Context.save rechecks the active company and the existing staff
      // permission gate inside the same coordinated write transaction.
      await save(values,activeCompanyId);
      setSavedNotice("Business saved. Opening your Clementia workspace.");
    }catch(cause){
      setError(cause instanceof Error?cause.message:"I couldn't save that business. Nothing was confirmed.");
      setPhase("review");
    }finally{writing.current=false;}
  };
  const previous=()=>{
    setError("");
    if(phase==="review")setPhase("type");
    else if(phase==="type")setPhase("country");
    else if(phase==="country")setPhase("name");
    setInput("");
  };
  const prompt=phase==="name"
    ?"Welcome to Clementia. What is your business name? I'll guide you through local setup right here."
    :phase==="country"?"Which country does "+name+" operate in? I'll choose its supported default currency."
    :phase==="type"?"What kind of business is "+name+"?"
    :phase==="review"?"Please review these details. Nothing has been saved yet."
    :"Saving your business with Tallybook's existing permission checks…";

  return <section className="assistant-page" aria-label="Clementia first-time business setup">
    <section className="assistant-hero">
      <span className="workspace-marker">ASK</span>
      <h1>Set up your business with Clementia</h1>
      <p>You can do the setup by chatting. I'll ask for your business name, country and type, then request explicit confirmation. Nothing is saved before that.</p>
    </section>
    <section className="assistant-thread" aria-live="polite">
      <div className="assistant-msg assistant-msg-bot"><p>{prompt}</p></div>
      {name&&<p><strong>Business:</strong> {name}</p>}
      {country&&<p><strong>Country:</strong> {country.value} · <strong>Currency:</strong> {country.currency}</p>}
      {businessType&&<p><strong>Type:</strong> {businessType}</p>}
      {phase==="country"&&<div className="assistant-chips">{countries.map(item=><button className="secondary-action assistant-chip" type="button" key={item.value} disabled={busy} onClick={()=>choose(item.value)}>{item.value}</button>)}</div>}
      {phase==="type"&&<div className="assistant-chips">{suggestions.map(item=><button className="secondary-action assistant-chip" type="button" key={item} disabled={busy} onClick={()=>choose(item)}>{item}</button>)}</div>}
      {phase==="review"&&<p role="status">Choose “Confirm business setup” to save this local business. You can go back and correct the details.</p>}
      {error&&<p role="alert">{error}</p>}
      {savedNotice&&<p role="status">{savedNotice}</p>}
    </section>
    <form className="assistant-composer" onSubmit={event=>void submit(event)}>
      <input
        className="input assistant-input" aria-label="Reply to Clementia setup"
        value={input} disabled={busy} maxLength={160} autoComplete="off"
        placeholder={phase==="name"?"Example: Ama's Store":phase==="country"?"Example: Ghana":phase==="type"?"Example: Retail shop":phase==="review"?"Confirm business setup":"Saving…"}
        onChange={event=>setInput(event.target.value)}/>
      <button type="submit" className="primary-action assistant-send" disabled={busy||!input.trim()}>{phase==="review"?"Confirm":"Send"}</button>
    </form>
    <div className="assistant-chips">
      {phase!=="name"&&phase!=="saving"&&<button type="button" className="secondary-action assistant-chip" onClick={previous}>Back</button>}
      {phase==="review"&&<button type="button" className="primary-action assistant-chip" disabled={busy} onClick={()=>void confirm()}>Confirm business setup</button>}
      {phase!=="name"&&phase!=="saving"&&<button type="button" className="secondary-action assistant-chip" onClick={reset}>Start over</button>}
    </div>
  </section>;
}
