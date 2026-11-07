/**
 * Voice input on the Assistant page. The browser's speech engine is replaced by a fake that behaves like Chrome's: it must be configured with
 * `lang` (not `language`), reports interim then final results, can fail with the same error codes, and always fires `onend`.
 * The real page and the real useVoiceInput hook run against it.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantReply } from "@/features/assistant";

const send = vi.fn<(text: string) => Promise<AssistantReply>>();
const actFn = vi.fn<(action: unknown) => Promise<AssistantReply>>();

vi.mock("@/contexts/BusinessProfileContext", () => ({ useBusinessProfile: () => ({ profile: { id: "primary", name: "Kwaku Provision Store", country: "Ghana", currency: "GHS" }, activeCompanyId: "primary" }) }));
vi.mock("@/contexts/DatabaseContext", () => ({ useDatabase: () => ({ status: "ready" }) }));
vi.mock("@/features/assistant", async (importOriginal) => ({ ...(await importOriginal<object>()), createAssistant: () => ({ send, act: actFn, pendingToken: () => null }) }));

import AssistantPage from "@/pages/AssistantPage";

type Handler<T> = ((event: T) => void) | null;
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = ""; continuous = true; interimResults = false; maxAlternatives = 0; processLocally?: boolean;
  started = 0; stopped = 0; aborted = 0;
  onstart: Handler<undefined> = null; onresult: Handler<unknown> = null; onerror: Handler<{ error: string }> = null; onend: Handler<undefined> = null;
  constructor() { FakeRecognition.instances.push(this); }
  start() { this.started += 1; this.onstart?.(undefined); }
  stop() { this.stopped += 1; this.onend?.(undefined); }
  abort() { this.aborted += 1; }
  /** What the browser does when the owner speaks. */
  hear(...parts: Array<{ transcript: string; confidence?: number; isFinal: boolean }>) {
    this.onresult?.({ resultIndex: 0, results: parts.map((part) => Object.assign([{ transcript: part.transcript, confidence: part.confidence ?? 0 }], { isFinal: part.isFinal })) });
  }
  fail(code: string) { this.onerror?.({ error: code }); this.onend?.(undefined); }
  finish() { this.onend?.(undefined); }
}
const current = () => FakeRecognition.instances[FakeRecognition.instances.length - 1];
const input = () => screen.getByLabelText("Message TallyBook's assistant") as HTMLInputElement;
const mic = () => screen.getByRole("button", { name: /Speak your message|Stop listening/ });

beforeEach(() => {
  FakeRecognition.instances = [];
  (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = FakeRecognition;
  window.localStorage.clear();
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  send.mockReset(); actFn.mockReset();
  send.mockResolvedValue({ kind: "answer", text: "Done." });
});
afterEach(() => { delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition; delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition; });

describe("voice input — availability", () => {
  it("shows the microphone when the browser supports speech recognition", () => {
    render(<AssistantPage />);
    expect(mic()).toBeInTheDocument();
    expect(screen.getByLabelText("Voice language")).toBeInTheDocument();
  });

  it("also works with the standard (unprefixed) API", () => {
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = FakeRecognition;
    render(<AssistantPage />);
    fireEvent.click(mic());
    expect(current().started).toBe(1);
  });

  it("hides the microphone, rather than showing a dead button, when the browser can't do it", () => {
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    render(<AssistantPage />);
    expect(screen.queryByRole("button", { name: /Speak your message/ })).not.toBeInTheDocument();
    expect(input()).toBeInTheDocument(); // typing is unaffected
  });
});

describe("voice input — listening", () => {
  it("starts the engine configured correctly", () => {
    render(<AssistantPage />);
    fireEvent.change(screen.getByLabelText("Voice language"), { target: { value: "en-GH" } });
    fireEvent.click(mic());
    const engine = current();
    expect(engine.started).toBe(1);
    expect(engine.lang).toBe("en-GH");
    expect(engine.interimResults).toBe(true);
    expect(engine.continuous).toBe(false);
    expect(mic()).toHaveAccessibleName("Stop listening");
    expect(mic()).toHaveAttribute("aria-pressed", "true");
  });

  it("shows what is being heard while the owner is still speaking", () => {
    render(<AssistantPage />);
    fireEvent.click(mic());
    act(() => current().hear({ transcript: "sell two", isFinal: false }));
    expect(input().value).toBe("sell two");
    act(() => current().hear({ transcript: "sell two eggs to Kwame", isFinal: false }));
    expect(input().value).toBe("sell two eggs to Kwame");
    expect(send).not.toHaveBeenCalled();
  });

  it("tapping the microphone again stops listening", () => {
    render(<AssistantPage />);
    fireEvent.click(mic());
    fireEvent.click(mic());
    expect(current().stopped).toBe(1);
  });

  it("remembers the chosen language", () => {
    const { unmount } = render(<AssistantPage />);
    fireEvent.change(screen.getByLabelText("Voice language"), { target: { value: "fr-FR" } });
    unmount();
    render(<AssistantPage />);
    expect((screen.getByLabelText("Voice language") as HTMLSelectElement).value).toBe("fr-FR");
    fireEvent.click(mic());
    expect(current().lang).toBe("fr-FR");
  });

  it("can't change language mid-listen", () => {
    render(<AssistantPage />);
    fireEvent.click(mic());
    expect(screen.getByLabelText("Voice language")).toBeDisabled();
  });
});

describe("voice input — what happens to the words", () => {
  const speak = (transcript: string, confidence?: number) => {
    fireEvent.click(mic());
    act(() => { current().hear({ transcript, confidence, isFinal: true }); current().finish(); });
  };

  it("a confident transcript is sent straight to the assistant, exactly as if typed", async () => {
    render(<AssistantPage />);
    speak("I counted 25 eggs but we have 37", 0.93);
    expect(send).toHaveBeenCalledWith("I counted 25 eggs but we have 37");
    expect(await screen.findByText("Done.")).toBeInTheDocument();
    expect(screen.getByText("I counted 25 eggs but we have 37", { selector: ".assistant-msg-user p" })).toBeInTheDocument();
    expect(input().value).toBe("");
    expect(mic()).toHaveAccessibleName("Speak your message");
  });

  it("a shaky transcript is NOT thrown away and NOT sent: it waits in the box to be checked", () => {
    render(<AssistantPage />);
    speak("sell fifteen eggs", 0.5);
    expect(send).not.toHaveBeenCalled();
    expect(input().value).toBe("sell fifteen eggs");
    expect(screen.getByText(/not fully sure I heard that right/)).toBeInTheDocument();
  });

  it("a browser that reports no confidence is treated as unsure, but the words still appear", () => {
    render(<AssistantPage />);
    speak("add customer Ama", 0);
    expect(send).not.toHaveBeenCalled();
    expect(input().value).toBe("add customer Ama");
    expect(screen.getByText(/Check what I heard/)).toBeInTheDocument();
  });

  it("words heard but never marked final (iOS Safari, early stop) are kept for checking, not lost or sent", () => {
    render(<AssistantPage />);
    fireEvent.click(mic());
    act(() => { current().hear({ transcript: "sell three eggs", confidence: 0.95, isFinal: false }); });
    fireEvent.click(mic()); // owner taps stop; the browser ends without a final result
    expect(send).not.toHaveBeenCalled();
    expect(input().value).toBe("sell three eggs");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/Check what I heard/)).toBeInTheDocument();
  });

  it("does not repeat words when the browser re-delivers earlier final results (Android Chrome)", () => {
    render(<AssistantPage />);
    fireEvent.click(mic());
    act(() => {
      current().hear({ transcript: "sell two eggs", confidence: 0.9, isFinal: true });
      current().hear({ transcript: "sell two eggs", confidence: 0.9, isFinal: true }, { transcript: "to Kwame", confidence: 0.9, isFinal: true });
      current().finish();
    });
    expect(send).toHaveBeenCalledWith("sell two eggs to Kwame");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("the owner can fix the words and send them", async () => {
    render(<AssistantPage />);
    speak("sell fifteen eggs", 0.5);
    fireEvent.change(input(), { target: { value: "sell fifty eggs to walk-in customer, paid cash" } });
    fireEvent.submit(input().closest("form")!);
    expect(send).toHaveBeenCalledWith("sell fifty eggs to walk-in customer, paid cash");
    expect(await screen.findByText("Done.")).toBeInTheDocument();
  });
});

describe("voice input — when it can't work, the owner is told why", () => {
  const alertText = () => screen.getByRole("alert").textContent;

  it.each([
    ["not-allowed", /Microphone access is blocked/],
    ["audio-capture", /couldn't find a working microphone/],
    ["network", /needs an internet connection/],
    ["service-not-allowed", /microphone key on your phone's keyboard/],
    ["language-not-supported", /doesn't support that language/],
    ["something-odd", /Voice typing stopped \(something-odd\)/],
  ])("error “%s”", (code, message) => {
    render(<AssistantPage />);
    fireEvent.click(mic());
    act(() => current().fail(code));
    expect(alertText()).toMatch(message);
    expect(send).not.toHaveBeenCalled();
    expect(mic()).toHaveAccessibleName("Speak your message"); // the button recovers, so it can be tried again
  });

  it("says so when nothing was heard", () => {
    render(<AssistantPage />);
    fireEvent.click(mic());
    act(() => current().finish());
    expect(alertText()).toMatch(/didn't hear anything/);
  });

  it("offline, without on-device voice, points to the keyboard microphone instead of starting the engine", () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    render(<AssistantPage />);
    fireEvent.click(mic());
    expect(alertText()).toMatch(/You're offline\. Tap the microphone on your phone's keyboard/);
    expect(FakeRecognition.instances).toHaveLength(0);
  });

  it("an error clears when the owner tries again", () => {
    render(<AssistantPage />);
    fireEvent.click(mic());
    act(() => current().fail("no-speech"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(mic());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("an aborted session is not shown as an error", () => {
    render(<AssistantPage />);
    fireEvent.click(mic());
    act(() => current().fail("aborted"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("works again after a failure (a fresh engine each time)", async () => {
    render(<AssistantPage />);
    fireEvent.click(mic());
    act(() => current().fail("network"));
    fireEvent.click(mic());
    expect(FakeRecognition.instances).toHaveLength(2);
    act(() => { current().hear({ transcript: "show today's sales", confidence: 0.9, isFinal: true }); current().finish(); });
    expect(send).toHaveBeenCalledWith("show today's sales");
    expect(await screen.findByText("Done.")).toBeInTheDocument();
  });
});

describe("voice input — cleanup", () => {
  it("stops the engine when leaving the page", () => {
    const { unmount } = render(<AssistantPage />);
    fireEvent.click(mic());
    const engine = current();
    unmount();
    expect(engine.aborted).toBe(1);
  });

  it("a late 'end' from a replaced session can't disturb the new one", () => {
    render(<AssistantPage />);
    fireEvent.click(mic());
    const first = current();
    act(() => first.fail("no-speech"));
    fireEvent.click(mic());
    const second = current();
    act(() => first.finish());
    expect(mic()).toHaveAccessibleName("Stop listening"); // still listening to the second session
    expect(second.aborted).toBe(0);
  });
});

describe("voice input — offline on this phone (on-device recognition)", () => {
  type Status = "available" | "downloadable" | "downloading" | "unavailable";
  const withOnDevice = (initial: Status, afterInstall: Status = "available") => {
    let status: Status = initial;
    const available = vi.fn(async (_options: { langs: string[]; processLocally: boolean }) => status);
    const install = vi.fn(async (_options: { langs: string[]; processLocally: boolean }) => { status = afterInstall; return afterInstall === "available"; });
    Object.assign(FakeRecognition, { available, install });
    return { available, install };
  };
  afterEach(() => { delete (FakeRecognition as unknown as { available?: unknown }).available; delete (FakeRecognition as unknown as { install?: unknown }).install; });

  it("says it works offline once the language is on the phone, and uses it with no connection", async () => {
    const { available } = withOnDevice("available");
    render(<AssistantPage />);
    expect(available).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Check offline voice support"}));
    expect(await screen.findByText(/Works offline on this phone too/)).toBeInTheDocument();
    expect(available).toHaveBeenCalledWith({ langs: [expect.any(String)], processLocally: true });
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    fireEvent.click(mic());
    expect(current().started).toBe(1);
    expect(current().processLocally).toBe(true);
  });

  it("online, keeps using the browser's more accurate speech service", async () => {
    withOnDevice("available");
    render(<AssistantPage />);
    fireEvent.click(screen.getByRole("button",{name:"Check offline voice support"}));
    await screen.findByText(/Works offline on this phone too/);
    fireEvent.click(mic());
    expect(current().processLocally).toBeUndefined();
  });

  it("offers the download only on the owner's tap, then works offline", async () => {
    const { install } = withOnDevice("downloadable");
    render(<AssistantPage />);
    fireEvent.click(screen.getByRole("button",{name:"Check offline voice support"}));
    const download = await screen.findByRole("button", { name: "Download voice for offline use" });
    expect(install).not.toHaveBeenCalled();
    fireEvent.click(download);
    await waitFor(() => expect(install).toHaveBeenCalledWith({ langs: [expect.any(String)], processLocally: true }));
    expect(await screen.findByText(/Works offline on this phone too/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /offline voice|offline use/ })).toBeNull();
  });

  it("says so when the download fails, and keeps the button", async () => {
    withOnDevice("downloadable", "downloadable");
    render(<AssistantPage />);
    fireEvent.click(screen.getByRole("button",{name:"Check offline voice support"}));
    fireEvent.click(await screen.findByRole("button", { name: "Download voice for offline use" }));
    expect(await screen.findByText(/didn't download/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download voice for offline use" })).toBeInTheDocument();
  });

  it("shows no download where the language can't run on the phone, or the check fails", async () => {
    const { available } = withOnDevice("unavailable");
    const { unmount } = render(<AssistantPage />);
    fireEvent.click(screen.getByRole("button",{name:"Check offline voice support"}));
    await waitFor(() => expect(available).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /offline use/ })).toBeNull();
    expect(screen.getByText(/offline, use the microphone on your phone's keyboard/)).toBeInTheDocument();
    unmount();
    available.mockRejectedValue(new Error("blocked by policy"));
    render(<AssistantPage />);
    fireEvent.click(screen.getByRole("button",{name:"Check offline voice support"}));
    await waitFor(() => expect(available).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: /offline use/ })).toBeNull();
  });
});
