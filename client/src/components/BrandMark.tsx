/** Tallybook Africa visual reminder: a simple local-business mark anchors the prototype-style operating workspace. */
export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" aria-label="Tallybook Africa">
      <svg className="h-10 w-10 shrink-0 text-baobab" viewBox="0 0 48 48" role="img" aria-label="Tallybook ledger-fold symbol" fill="none">
        <path d="M8 10v26l8-8V6L8 10Z" fill="currentColor" />
        <path d="M19 6v22l5-5V3l-5 3Z" fill="currentColor" opacity="0.92" />
        <path d="M27 4v19l5-5V1l-5 3Z" fill="currentColor" opacity="0.82" />
        <path d="M8 36 24 45l16-9-7-4-9 5-9-5-7 4Z" fill="currentColor" opacity="0.96" />
      </svg>
      {!compact ? <div className="leading-none"><p className="font-display text-[1.35rem] font-semibold tracking-[-0.045em] text-ink">Tallybook Africa</p><p className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-ink-soft">Simple business tools</p></div> : null}
    </div>
  );
}
