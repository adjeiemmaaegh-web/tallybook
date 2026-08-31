/** Tactile Ledger design reminder: even a missing route gives the owner a clear, calm route back to work. */
import { ArrowLeft, MapPinOff } from "lucide-react";
import { Link } from "wouter";

export default function AppNotFound() {
  return <section className="placeholder-page"><MapPinOff className="h-8 w-8 text-clay" strokeWidth={1.6} aria-hidden="true" /><p className="eyebrow mt-7"><span className="eyebrow-dot" />Route not found</p><h1>This page is not in your ledger.</h1><p>Return to the foundation screen to keep moving through the approved build stages.</p><Link href="/" className="secondary-action mt-7"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Return to foundation</Link></section>;
}
