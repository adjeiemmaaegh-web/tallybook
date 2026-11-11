/** Explicit authenticated staff handover; the next employee cannot inherit prior POS drafts. */
import {useEffect,useState} from "react";
import {Link} from "wouter";
import {LogOut,UserRound,UsersRound} from "lucide-react";
import {getSupabaseClient} from "@/lib/supabase";
import {confirmSharedDeviceHandover} from "./sharedDeviceHandover";

interface Props {
 userId:string;
 role:"owner"|"attendant"|null;
 shopName:string|null;
 /** For test harnesses; normal use returns to the real login screen. */
 onSignedOut?:()=>void;
}
export function SharedShopAccountMenu({userId,role,shopName,onSignedOut}:Props){
 const [name,setName]=useState("");
 const [email,setEmail]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{
  let active=true;setName("");setEmail("");
  void getSupabaseClient().auth.getUser().then(({data,error:failure})=>{
   if(!active||failure||data.user?.id!==userId)return;
   const metadata=data.user.user_metadata??{};
   const display=[metadata.preferred_name,metadata.full_name,metadata.name]
     .find(value=>typeof value==="string"&&value.trim());
   setName(typeof display==="string"?display.trim().slice(0,80):"");
   setEmail(data.user.email??"");
  }).catch(()=>{ /* If identity can't be confirmed, no personal details are displayed. */ });
  return()=>{active=false;};
 },[userId]);
 const initials=(name||email||"Staff").split(/[ .@_-]+/).filter(Boolean).slice(0,2).map(part=>part.charAt(0).toUpperCase()).join("");
 const exit=async()=>{
  if(busy)return;setBusy(true);setError("");
  try{
   if(!await confirmSharedDeviceHandover(userId))return;
   const auth=getSupabaseClient().auth;
   const verified=await auth.getUser();
   if(verified.error||verified.data.user?.id!==userId)throw Error("This account changed. Check who is signed in before switching.");
   const result=await auth.signOut({scope:"local"});
   if(result.error)throw Error("Sign-out could not be confirmed. Try again before handing over this device.");
   if(onSignedOut)onSignedOut();else window.location.assign("/signin");
  }catch(cause){setError(cause instanceof Error?cause.message:"Could not switch employees.");}
  finally{setBusy(false);}
 };
 return <div className="tb-shop-account-wrap">
   <details className="tb-shop-account-menu">
     <summary aria-label="Account menu" title="Current employee and account options">
       <span className="tb-shop-account-avatar" aria-hidden="true">{initials||"S"}</span>
       <span className="tb-shop-account-label">Account</span>
     </summary>
     <div className="tb-shop-account-panel">
       <p className="tb-shop-account-name">{name||"Signed-in employee"}</p>
       {email&&<p className="tb-shop-account-email">{email}</p>}
       <p className="tb-shop-account-role">{role==="owner"?"Business owner":role==="attendant"?"Attendant":"Account"}{shopName?" · "+shopName:""}</p>
       <Link href="/settings"><UserRound aria-hidden="true"/>Profile & settings</Link>
       <button type="button" disabled={busy} onClick={()=>void exit()}><UsersRound aria-hidden="true"/>{busy?"Checking handover…":"Switch employee"}</button>
       <button type="button" className="tb-shop-account-signout" disabled={busy} onClick={()=>void exit()}><LogOut aria-hidden="true"/>Sign out</button>
       <p className="tb-shop-account-help">Each employee uses their own login. Unsent sales remain with the original cashier.</p>
     </div>
   </details>
   {error&&<p className="shop-alert tb-shop-account-error" role="alert">{error}</p>}
 </div>;
}
