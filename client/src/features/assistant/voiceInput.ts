/**
 * Tallybook Assistant — voice input.
 *
 * Uses the browser's built-in speech recognition (Chrome, Edge and Safari). The words are turned into text on the device or by the
 * browser's speech service, then go through exactly the same path as typed text: nothing is saved without the owner's confirmation.
 *
 * Honest limits: in most browsers recognition needs an internet connection even though the rest of the Assistant works offline,
 * and some installed-app (PWA) modes block it. When it can't work, the owner is told why instead of seeing a button that does nothing.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** The parts of the (still non-standard) SpeechRecognition API this app uses. */
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }>;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function getSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const scope = window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

/** Languages worth offering. Browsers support more, but these are the ones TallyBook's owners are most likely to speak. */
export const VOICE_LANGUAGES = [
  { code: "en-GH", label: "English (Ghana)" },
  { code: "en-NG", label: "English (Nigeria)" },
  { code: "en-KE", label: "English (Kenya)" },
  { code: "en-ZA", label: "English (South Africa)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "en-US", label: "English (US)" },
  { code: "fr-FR", label: "Français" },
] as const;

const STORAGE_KEY = "tallybook.assistant.voiceLanguage";

export function defaultVoiceLanguage(): string {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && VOICE_LANGUAGES.some((language) => language.code === saved)) return saved;
  } catch { /* storage can be blocked; fall through */ }
  const browser = typeof navigator !== "undefined" ? navigator.language : "";
  return VOICE_LANGUAGES.find((language) => language.code.toLowerCase() === browser.toLowerCase())?.code ?? "en-GH";
}

export function rememberVoiceLanguage(code: string) {
  try { window.localStorage.setItem(STORAGE_KEY, code); } catch { /* not essential */ }
}

/** Plain-language reasons for the error codes browsers report. */
export function describeVoiceError(code: string): string | null {
  switch (code) {
    case "aborted": return null;
    case "no-speech": return "I didn't hear anything. Tap the microphone and speak after it starts listening.";
    case "audio-capture": return "I couldn't find a working microphone on this device.";
    case "not-allowed": return "Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again.";
    case "service-not-allowed": return "This browser or installed app won't allow voice typing here. You can use the microphone key on your phone's keyboard instead.";
    case "network": return "Voice typing needs an internet connection, because the browser sends your voice to its speech service. You can still type.";
    case "language-not-supported": return "This browser doesn't support that language for voice typing. Try a different language.";
    default: return `Voice typing stopped (${code}). You can still type your message.`;
  }
}

export interface VoiceResult { text: string; /** 0 to 1. 0 means the browser did not report a confidence. */ confidence: number }
export type VoiceStatus = "idle" | "starting" | "listening";

export interface UseVoiceInputOptions {
  language: string;
  /** Called once with the final words when the owner stops speaking. */
  onResult: (result: VoiceResult) => void;
}

export function useVoiceInput({ language, onResult }: UseVoiceInputOptions) {
  const [supported] = useState(() => getSpeechRecognition() !== undefined);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const stop = useCallback(() => { recognitionRef.current?.stop(); }, []);

  const start = useCallback(() => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) { setError("This browser can't do voice typing. You can use the microphone key on your phone's keyboard instead."); return; }
    if (typeof navigator !== "undefined" && navigator.onLine === false) { setError(describeVoiceError("network")); return; }
    recognitionRef.current?.abort();

    const recognition = new Recognition();
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalText = "";
    let lastHeard = "";
    let confidence = 0;
    let failed = false;

    const isCurrent = () => recognitionRef.current === recognition;
    recognition.onstart = () => { if (isCurrent()) setStatus("listening"); };
    recognition.onresult = (event) => {
      if (!isCurrent()) return;
      // `results` holds every result of this session, so rebuild from the start
      // each time. Accumulating from `resultIndex` duplicates words on Android
      // Chrome, which re-delivers earlier final results with resultIndex 0.
      const finals: string[] = [];
      let interimText = "";
      let finalConfidence = 0;
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const best = result?.[0];
        if (!best) continue;
        if (result.isFinal) { finals.push(best.transcript.trim()); finalConfidence = best.confidence || finalConfidence; }
        else interimText += best.transcript;
      }
      finalText = finals.filter(Boolean).join(" ");
      if (finals.length) confidence = finalConfidence;
      lastHeard = `${finalText} ${interimText}`.trim();
      setInterim(lastHeard);
    };
    recognition.onerror = (event) => {
      if (!isCurrent()) return;
      failed = true;
      const message = describeVoiceError(event.error);
      if (message) setError(message);
    };
    recognition.onend = () => {
      if (!isCurrent()) return;
      recognitionRef.current = null;
      setStatus("idle");
      setInterim("");
      if (failed) return;
      const text = finalText.trim();
      if (text && text === lastHeard) { onResultRef.current({ text, confidence }); return; }
      // iOS Safari, and a session stopped mid-phrase, can end without marking the
      // words final. Keep what the owner saw being heard, as unconfirmed (0) so
      // it waits in the box to be checked rather than being sent.
      if (lastHeard) { onResultRef.current({ text: lastHeard, confidence: 0 }); return; }
      setError(describeVoiceError("no-speech"));
    };

    recognitionRef.current = recognition;
    setError(null); setInterim(""); setStatus("starting");
    try { recognition.start(); }
    catch { recognitionRef.current = null; setStatus("idle"); setError(describeVoiceError("service-not-allowed")); }
  }, [language]);

  useEffect(() => () => { const recognition = recognitionRef.current; recognitionRef.current = null; recognition?.abort(); }, []);

  return { supported, status, listening: status !== "idle", interim, error, start, stop, clearError: () => setError(null) };
}
