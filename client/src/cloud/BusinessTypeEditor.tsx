import {useEffect,useRef,useState} from "react";
import {BUSINESS_TYPES,readBusinessType,saveBusinessType,type BusinessType} from "./businessClassification";

/** Verified owner-only presentation; RLS + business_type-only UPDATE grant enforce access. */
export function BusinessTypeEditor({companyId}:{companyId:string}){
  const [type,setType]=useState<BusinessType|"">("");
  const [saved,setSaved]=useState<BusinessType|null>(null);
  const [busy,setBusy]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [error,setError]=useState("");
  const revision=useRef(0);
  useEffect(()=>{
    const request=++revision.current;
    setType("");setLoaded(false);setSaved(null);setError("");
    void readBusinessType(companyId).then(value=>{
      if(request!==revision.current)return;
      setType(value??"");setSaved(value);setLoaded(true);
    }).catch(cause=>{
      if(request===revision.current)setError(cause instanceof Error?cause.message:"Business classification unavailable.");
    });
    return()=>{revision.current++;};
  },[companyId]);
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(busy||!loaded||!type||type===saved)return;
    const request=revision.current;setBusy(true);setError("");
    try{
      await saveBusinessType(companyId,type);
      if(request===revision.current)setSaved(type);
    }catch(cause){
      if(request===revision.current)setError(cause instanceof Error?cause.message:"Could not update business type.");
    }finally{if(request===revision.current)setBusy(false);}
  };
  return <section className="tb-business-type-editor" aria-label="Business type settings">
    <h2>Business type</h2>
    <p>Tell us what you do. This is a descriptive setting; it does not change staff permissions, stock rules, or refund policy.</p>
    {!loaded&&!error&&<p role="status">Checking saved business type…</p>}
    {loaded&&<form onSubmit={e=>void save(e)}>
      <label htmlFor="business-type-editor">Business category</label>
      <select id="business-type-editor" value={type} disabled={busy}
        onChange={e=>setType(e.target.value as BusinessType|"")}>
        <option value="">Not specified</option>
        {BUSINESS_TYPES.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}
      </select>
      <button type="submit" className="secondary-action" disabled={busy||!type||type===saved}>
        {busy?"Saving…":"Save business type"}
      </button>
      {saved&&<p role="status">Verified saved type: {BUSINESS_TYPES.find(x=>x.id===saved)?.label}.</p>}
    </form>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
