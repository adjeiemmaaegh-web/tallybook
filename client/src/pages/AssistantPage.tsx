/** Tallybook Africa design reminder: this is a shortcut into TallyBook's existing ledger, not a chatbot — every figure it shows must trace back to a real saved record, and nothing is written until the owner taps Confirm. */
import { ArrowLeft, CircleAlert, CircleCheck, MessageCircleQuestion, Mic, Minimize2, Send } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { useBusinessProfile } from "@/contexts/BusinessProfileContext";
import { useDatabase } from "@/contexts/DatabaseContext";
import { createAssistant, deleteStoredAlias, deleteStoredWorkflow, listAssistantHistory, listPersistentWorkflows, listStoredAliases, saveStoredAlias, type Assistant, type AssistantAction, type AssistantReply } from "@/features/assistant";
import { VOICE_LANGUAGES, defaultVoiceLanguage, rememberVoiceLanguage, useVoiceInput } from "@/features/assistant/voiceInput";
import { requestClementiaPanelRestore } from "@/lib/clementiaWindow";

interface Turn { id: number; from: "user" | "assistant"; reply?: AssistantReply; text?: string }

const STARTERS = ["How much does Adwoa owe?", "How many crates of eggs are left?", "Show today's sales", "Record 2 crates of eggs sold to walk-in customer, paid cash"];

function replyIcon(kind: AssistantReply["kind"]) {
  if (kind === "success") return <CircleCheck className="h-4 w-4 shrink-0 text-baobab" aria-hidden="true" />;
  if (kind === "error" || kind === "unsupported") return <CircleAlert className="h-4 w-4 shrink-0 text-clay" aria-hidden="true" />;
  return null;
}

function ReplyBubble({ reply, onAction }: { reply: AssistantReply; onAction: (action: AssistantAction) => void }) {
  return (
    <div className={`assistant-msg assistant-msg-bot assistant-msg-${reply.kind}`}>
      {reply.notice && <p className="assistant-notice">{reply.notice}</p>}
      <p className="assistant-msg-text">{replyIcon(reply.kind)}<span>{reply.text}</span></p>
      {reply.context && <p className="assistant-more" aria-label="Assistant context">{reply.context}</p>}
      {reply.plan && (
        <div className="assistant-preview" aria-label={`Plan: ${reply.plan.goal}`}>
          <p className="assistant-preview-title">Plan: {reply.plan.goal}</p>
          <ol className="assistant-rows">{reply.plan.steps.map((step, index) => <li key={index}><div><strong>{index + 1}. {step.label}</strong></div></li>)}</ol>
          <p className="assistant-more">Read-only local check. Nothing will be saved.</p>
        </div>
      )}
      {reply.details && reply.details.length > 0 && (
        <dl className="assistant-details">{reply.details.map((detail) => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl>
      )}
      {reply.rows && reply.rows.length > 0 && (
        <ul className="assistant-rows">
          {reply.rows.map((row, index) => <li key={index}><div><strong>{row.primary}</strong>{row.secondary && <span>{row.secondary}</span>}</div>{row.amount && <b>{row.amount}</b>}</li>)}
        </ul>
      )}
      {reply.moreText && <p className="assistant-more">{reply.moreText}</p>}
      {reply.preview && (
        <div className="assistant-preview">
          <p className="assistant-preview-title">{reply.preview.title}</p>
          <dl className="assistant-details">{reply.preview.rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
          {reply.preview.notes.map((note, index) => <p key={index} className="assistant-more">{note}</p>)}
        </div>
      )}
      {reply.link && <Link href={reply.link.href} className="quiet-action assistant-link">{reply.link.label}</Link>}
      {reply.actions && reply.actions.length > 0 && (
        <div className="assistant-chips">
            {reply.actions.map((action, index) => action.type === "navigate" ? <Link key={index} href={action.href} className="secondary-action assistant-chip">{action.label}</Link> : <button key={index} type="button" className={action.type === "confirm" ? "primary-action assistant-chip" : "secondary-action assistant-chip"} onClick={() => onAction(action)}>{action.label}</button>)}
        </div>
      )}
    </div>
  );
}

export default function AssistantPage() {
  const { profile, activeCompanyId } = useBusinessProfile();
  const { status: databaseStatus } = useDatabase();
  const [location, setLocation] = useLocation();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState(defaultVoiceLanguage);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [aliases, setAliases] = useState<Array<{ id: string; phrase: string; canonicalValue: string }>>([]);
  const [history, setHistory] = useState<Array<{ id: string; input: string; createdAt: string; replayText: string }>>([]);
  const [aliasPhrase, setAliasPhrase] = useState("");
  const [aliasValue, setAliasValue] = useState("");
  const busyRef = useRef(false);
  const assistantRef = useRef<Assistant | null>(null);
  const nextId = useRef(0);
  const threadEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { assistantRef.current = null; setTurns([]); }, [activeCompanyId]);
  useEffect(() => {
    if (!activeCompanyId) return;
    const workflowsTask = typeof listPersistentWorkflows === "function" ? listPersistentWorkflows(activeCompanyId) : Promise.resolve([]);
    const aliasesTask = typeof listStoredAliases === "function" ? listStoredAliases(activeCompanyId) : Promise.resolve([]);
    const historyTask = typeof listAssistantHistory === "function" ? listAssistantHistory(activeCompanyId, 8) : Promise.resolve([]);
    void Promise.all([workflowsTask, aliasesTask, historyTask]).then(([savedWorkflows, savedAliases, savedHistory]) => {
      setWorkflows(savedWorkflows.map(({ id, name, description }) => ({ id, name, description })));
      setAliases(savedAliases.map(({ id, phrase, canonicalValue }) => ({ id, phrase, canonicalValue })));
      setHistory(savedHistory.map(({ id, input, createdAt, replayText }) => ({ id, input, createdAt, replayText })));
    });
  }, [activeCompanyId]);
  useLayoutEffect(() => { threadEnd.current?.scrollIntoView?.({ block: "end" }); }, [turns]);

  const ensureAssistant = useCallback((): Assistant | null => {
    if (!profile) return null;
    if (!assistantRef.current) assistantRef.current = createAssistant({ currency: profile.currency });
    return assistantRef.current;
  }, [profile]);

  const runAction = useCallback(async (label: string | null, task: (assistant: Assistant) => Promise<AssistantReply>) => {
    const assistant = ensureAssistant();
    if (!assistant || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    if (label) setTurns((current) => [...current, { id: nextId.current++, from: "user", text: label }]);
    try {
      const reply = await task(assistant);
      setTurns((current) => [...current, { id: nextId.current++, from: "assistant", reply }]);
    } catch {
      setTurns((current) => [...current, { id: nextId.current++, from: "assistant", reply: { kind: "error", text: "Something went wrong reading your local records. Nothing was changed." } }]);
    } finally { busyRef.current = false; setBusy(false); }
  }, [ensureAssistant]);

  /** Spoken words take the same path as typed ones. A confident transcript is sent straight away; anything shakier waits in the box to be checked. */
  const voice = useVoiceInput({
    language: voiceLanguage,
    onResult: ({ text, confidence }) => {
      if (confidence >= 0.8 && !busyRef.current) { setInput(""); setVoiceNote(null); void runAction(text, (assistant) => assistant.send(text)); return; }
      setInput(text);
      setVoiceNote(confidence > 0 ? "I'm not fully sure I heard that right. Check it, then tap Send." : "Check what I heard, then tap Send.");
    },
  });

  const handleSend = (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput(""); setVoiceNote(null);
    void runAction(text, (assistant) => assistant.send(text));
  };

  const handleAction = (action: AssistantAction) => { if (action.type === "navigate") { setLocation(action.href); return; } void runAction(action.type === "say" ? action.text : null, (assistant) => assistant.act(action)); };

  if (!profile) {
    return (
      <section className="reports-gate">
        <div className="reports-gate-sheet">
          <div className="reports-gate-brand"><strong>Tallybook</strong><span>Business ledger</span></div>
          <span className="workspace-marker">ASK</span>
          <p className="eyebrow"><span className="eyebrow-dot" />Assistant</p>
          <h1>Set up your business first.</h1>
          <p>The assistant answers from your saved records, so it needs a business set up before it has anything to read.</p>
          <Link href="/business" className="primary-action">Set up business</Link>
        </div>
      </section>
    );
  }

  const disabled = databaseStatus !== "ready" || busy;

  return (
    <div className="assistant-page">
      {location === "/assistant" && (
        <button className="secondary-action assistant-minimize" type="button"
          onClick={() => { requestClementiaPanelRestore(); setLocation("/"); }}
          aria-label="Minimize Clementia">
          <Minimize2 className="h-4 w-4" aria-hidden="true" /> Minimize Clementia
        </button>
      )}
      <section className="assistant-hero">
        <p className="eyebrow"><span className="eyebrow-dot" />Ask Tallybook</p>
        <span className="workspace-marker">ASK</span>
        <h1>Meet Clementia, your business assistant.</h1>
        <p>Ask about balances, stock, and sales, or describe a sale, a stock receipt, or a payment in plain language. Every answer comes from your saved records, works offline, and nothing is saved until you confirm.</p>
      </section>

      <section className="assistant-thread" aria-live="polite">
        {turns.length === 0 && (
          <div className="assistant-empty">
            <MessageCircleQuestion className="h-5 w-5 text-baobab" aria-hidden="true" />
            <p>Try one of these, or type your own question.</p>
            <div className="assistant-chips">{STARTERS.map((starter) => <button key={starter} type="button" className="secondary-action assistant-chip" onClick={() => void runAction(starter, (assistant) => assistant.send(starter))} disabled={disabled}>{starter}</button>)}</div>
          </div>
        )}
        {turns.map((turn) => turn.from === "user"
          ? <div key={turn.id} className="assistant-msg assistant-msg-user"><p>{turn.text}</p></div>
          : <ReplyBubble key={turn.id} reply={turn.reply!} onAction={handleAction} />)}
        {busy && <div className="assistant-msg assistant-msg-bot assistant-msg-thinking" aria-label="Thinking"><span /><span /><span /></div>}
        <div ref={threadEnd} />
      </section>

      <form className="assistant-composer" onSubmit={handleSend}>
<textarea
          className="input assistant-input"
          value={voice.listening && voice.interim ? voice.interim : input}
          rows={Math.min(6, Math.max(1, (voice.listening && voice.interim ? voice.interim : input).split("\n").length))}
          onChange={(event) => { setInput(event.target.value); setVoiceNote(null); }}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter starts a new line, so several transactions can be typed or pasted, one per line.
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
          }}
          placeholder={voice.listening ? "Listening\u2026 speak now" : "Ask Clementia something\u2026"}
          disabled={disabled}
          readOnly={voice.listening}
          aria-label="Message TallyBook's assistant"
        />
        {voice.supported && (
          <button
            type="button"
            className={voice.listening ? "primary-action assistant-send assistant-mic-live" : "secondary-action assistant-send"}
            onClick={voice.listening ? voice.stop : voice.start}
            disabled={databaseStatus !== "ready"}
            aria-pressed={voice.listening}
            aria-label={voice.listening ? "Stop listening" : "Speak your message"}
          >
            <Mic className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <button type="submit" className="primary-action assistant-send" disabled={disabled || voice.listening || !input.trim()} aria-label="Send"><Send className="h-4 w-4" aria-hidden="true" /></button>
      </form>
      {voice.supported && (
        <div className="assistant-voice-row">
          <p className={voice.error ? "assistant-voice-note assistant-voice-error" : "assistant-voice-note"} role={voice.error ? "alert" : "status"}>
            {voice.error ?? (voice.listening ? "Listening… tap the microphone when you finish." : voiceNote ?? "Tap the microphone and speak. Voice typing needs an internet connection.")}
          </p>
          <select className="assistant-voice-language" aria-label="Voice language" value={voiceLanguage} onChange={(event) => { setVoiceLanguage(event.target.value); rememberVoiceLanguage(event.target.value); }} disabled={voice.listening}>
            {VOICE_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}
          </select>
        </div>
      )}
      <section className="assistant-local-tools" aria-label="Local assistant tools">
        <details><summary>On-device workflows and memory</summary>
          <p className="assistant-more">These settings stay on this device and do not sync to a server.</p>
          <button type="button" className="secondary-action" onClick={() => assistantRef.current?.clearContext()}>Clear conversation context</button>
          <div className="assistant-details"><strong>Saved workflows</strong>{workflows.length ? workflows.map((workflow) => <div key={workflow.id}><span>{workflow.name}</span><button type="button" className="quiet-action" onClick={() => void runAction(workflow.name, (assistant) => assistant.send(workflow.name))}>Run</button><button type="button" className="quiet-action" onClick={() => { void deleteStoredWorkflow(workflow.id).then(() => setWorkflows((items) => items.filter((item) => item.id !== workflow.id))); }}>Delete</button></div>) : <span>None yet. Ask for a check, then say “save this as my morning check”.</span>}</div>
          <div className="assistant-details"><strong>Learned terms</strong>{aliases.length ? aliases.map((alias) => <div key={alias.id}><span>{alias.phrase} → {alias.canonicalValue}</span><button type="button" className="quiet-action" onClick={() => { void deleteStoredAlias(alias.id).then(() => setAliases((items) => items.filter((item) => item.id !== alias.id))); }}>Remove</button></div>) : <span>No custom terms yet.</span>}
            <form onSubmit={(event) => { event.preventDefault(); if (!aliasPhrase.trim() || !aliasValue.trim() || !activeCompanyId) return; void saveStoredAlias({ businessProfileId: activeCompanyId, phrase: aliasPhrase.trim(), canonicalValue: aliasValue.trim(), kind: "intent", confidence: 1, enabled: true }).then((saved) => { setAliases((items) => [...items, { id: saved.id, phrase: saved.phrase, canonicalValue: saved.canonicalValue }]); setAliasPhrase(""); setAliasValue(""); }); }}><Input aria-label="Learned term" value={aliasPhrase} onChange={(event) => setAliasPhrase(event.target.value)} placeholder="Term" /><Input aria-label="Term meaning" value={aliasValue} onChange={(event) => setAliasValue(event.target.value)} placeholder="Meaning" /><button type="submit" className="secondary-action">Save term</button></form>
          </div>
          <div className="assistant-details"><strong>Recent actions</strong>{history.length ? history.map((item) => <div key={item.id}><span>{item.input}</span><button type="button" className="quiet-action" onClick={() => void runAction("Repeat", (assistant) => assistant.send(item.replayText))}>Repeat</button></div>) : <span>No saved assistant actions yet.</span>}</div>
        </details>
      </section>
      <Link href="/" className="secondary-action assistant-back"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to Home</Link>
    </div>
  );
}
