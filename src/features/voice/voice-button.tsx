"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Loader2, Mic, Square } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { VOICE_CHECK, VOICE_HINT, VOICE_NOTICE } from "@/lib/voice/voice-messages";

import { useVoiceAccess } from "./voice-access";
import { LiveDictationPanel } from "./live-dictation-panel";
import { useMicrophones } from "./mic-choice";
import { liveDictationSupported, useLiveDictation } from "./use-live-dictation";
import { useVoiceRecorder, voiceRecordingSupported, WARNING_SECONDS, type VoiceSurface } from "./use-voice-recorder";

/**
 * ============================================================================
 * THE MIC, ONE COMPONENT FOR ALL FOUR AI CHAT BOXES (VOICE_INPUT_ENABLED)
 * ============================================================================
 *
 * A box wraps its input in `<VoiceControl>` and places two pieces where they belong in its own layout:
 *   `<VoiceButton>` beside its Send button, and
 *   `<VoiceNotice>` where the box already shows its notices (main chat: the `chat-input-length` block; the others: a
 *   line directly under the box). Every error is `role="alert"` there, with the exact sentences of `voice-messages.ts`.
 *
 * Nothing renders unless the server said this person may use voice (`useVoiceAccess`), the browser can record
 * (`MediaRecorder`, `getUserMedia`) and it is not an in-app browser (Slack, Teams, Gmail). The transcript is handed to
 * the box (`onText`), which appends it to its own text; Send is the box's own and unchanged. Typed text is never touched
 * on a failure. The first tap shows the notice once; the choice is kept in this browser per user id.
 *
 * LIVE DICTATION (the owner, 27 Nov 2026: "it transcribes as you talk then when done, press check mark and auto send";
 * ported from the sibling app). A box that gives `onSend` and places `<VoiceLivePanel>` over its input row gets the words as
 * they are said, with ✓ to send (the names spelled as the directory spells them, on the server) and ✕ to drop. Where
 * the browser cannot stream, or the server will not start a stream, the same tap records instead, as before, and the
 * words go into the box to be checked. Boxes without `onSend` record, as before.
 */

export interface VoiceControlProps {
  readonly surface: VoiceSurface;
  readonly meetingKey?: string;
  readonly conversationId?: string | null;
  /** The box is busy (a turn in flight): the mic is disabled. */
  readonly disabled?: boolean;
  readonly onText: (text: string, traceId: string) => void;
  /** Live dictation's ✓: send this text now. Turns live dictation on for the box (with `<VoiceLivePanel>` placed). */
  readonly onSend?: (text: string, traceId: string) => void;
  readonly children: ReactNode;
}

type Recorder = ReturnType<typeof useVoiceRecorder>;

type Live = ReturnType<typeof useLiveDictation>;

interface VoiceState {
  readonly recorder: Recorder;
  readonly live: Live;
  readonly microphones: ReturnType<typeof useMicrophones>;
  /** A live-dictation refusal or failure, said where every voice error is. */
  readonly liveError: string | null;
  /** The live words went into the box (the limit, a hidden tab): "Check the words". */
  readonly liveChecked: boolean;
  readonly disabled: boolean;
  readonly askingConsent: boolean;
  readonly tap: () => void;
  readonly accept: () => void;
  readonly decline: () => void;
}

const VoiceContext = createContext<VoiceState | null>(null);

const consentKey = (userKey: string) => `ask-bubbles:voice-consent:${userKey}`;

function readConsent(userKey: string | null): boolean {
  if (!userKey) return false;
  try {
    return window.localStorage.getItem(consentKey(userKey)) === "yes";
  } catch {
    return false;
  }
}

function saveConsent(userKey: string | null, choice: "yes" | "no"): void {
  if (!userKey) return;
  try {
    window.localStorage.setItem(consentKey(userKey), choice);
  } catch {
    /* Private mode: the notice is shown again next time. */
  }
}

const noSubscription = () => () => undefined;
const notOnServer = () => false;

export function VoiceControl(props: VoiceControlProps) {
  const access = useVoiceAccess();
  // Read after hydration (the server never draws the mic), and never again: whether a browser can record does not change.
  const supported = useSyncExternalStore(noSubscription, voiceRecordingSupported, notOnServer);
  if (!access.enabled || !supported) return <>{props.children}</>;
  return <ActiveVoiceControl {...props} userKey={access.userKey} />;
}

function ActiveVoiceControl({ surface, meetingKey, conversationId, disabled = false, onText, onSend, children, userKey }: VoiceControlProps & { userKey: string | null }) {
  // The owner, 27 Nov 2026: "i think i need to choose which mic because i have usb mic not built in".
  const microphones = useMicrophones();
  const { refresh: refreshMicrophones } = microphones;
  const onMicrophoneOpened = useCallback(() => void refreshMicrophones(), [refreshMicrophones]);
  const recorder = useVoiceRecorder({ surface, meetingKey, conversationId, onText, deviceId: microphones.chosen, onMicrophoneOpened });
  const [askingConsent, setAskingConsent] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveChecked, setLiveChecked] = useState(false);
  const { phase, start, stop, clearDone } = recorder;
  const live = useLiveDictation({
    surface,
    meetingKey,
    conversationId,
    deviceId: microphones.chosen,
    onMicrophoneOpened,
    onSend: (text, meta) => onSend?.(text, meta.traceId),
    onText: (text, meta) => {
      setLiveChecked(true);
      onText(text, meta.traceId);
    },
    onFallback: () => void start(),
    onError: (message) => setLiveError(message),
  });
  const liveOn = Boolean(onSend) && liveDictationSupported();
  const dictating = live.state.kind !== "idle";
  const { start: startLive } = live;

  /* Sending (the box turns busy) clears "Check the words". */
  useEffect(() => {
    if (disabled) clearDone();
  }, [disabled, clearDone]);
  const [wasDisabled, setWasDisabled] = useState(disabled);
  if (wasDisabled !== disabled) {
    setWasDisabled(disabled);
    if (disabled) setLiveChecked(false);
  }

  const begin = useCallback(() => {
    setLiveError(null);
    setLiveChecked(false);
    if (liveOn) void startLive();
    else void start();
  }, [liveOn, start, startLive]);

  const tap = useCallback(() => {
    if (phase === "recording") {
      stop();
      return;
    }
    if (disabled || dictating || phase === "uploading" || phase === "requesting") return;
    if (!readConsent(userKey)) {
      setAskingConsent(true);
      return;
    }
    begin();
  }, [begin, dictating, disabled, phase, stop, userKey]);

  const accept = useCallback(() => {
    saveConsent(userKey, "yes");
    setAskingConsent(false);
    begin();
  }, [begin, userKey]);

  const decline = useCallback(() => {
    saveConsent(userKey, "no");
    setAskingConsent(false);
  }, [userKey]);

  const value = useMemo<VoiceState>(
    () => ({ recorder, live, microphones, liveError, liveChecked, disabled, askingConsent, tap, accept, decline }),
    [recorder, live, microphones, liveError, liveChecked, disabled, askingConsent, tap, accept, decline],
  );
  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The mic itself. Renders nothing when voice is off for this person or this browser. */
export function VoiceButton({ className, timerClassName }: { className?: string; timerClassName?: string }) {
  const state = useContext(VoiceContext);
  if (!state) return null;
  const { recorder, live, disabled, tap } = state;
  const { phase, seconds } = recorder;
  const recording = phase === "recording";
  const working = phase === "uploading" || phase === "requesting" || live.state.kind !== "idle";
  const label = recording ? "Stop recording" : working ? "Transcribing your recording" : "Speak your message";
  return (
    <>
      {recording ? (
        <span data-testid="voice-timer" aria-live="off" className={cn("shrink-0 font-mono text-[12px] tabular-nums", seconds >= WARNING_SECONDS && "font-semibold", timerClassName)}>
          {clock(seconds)}
        </span>
      ) : null}
      <button
        type="button"
        onClick={tap}
        disabled={(disabled && !recording) || working}
        aria-label={label}
        aria-pressed={recording}
        data-phase={phase}
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-40",
          recording ? "bg-[#b42318] text-white" : "text-foreground hover:bg-hover-surface",
          className,
        )}
      >
        {working ? <Loader2 className="size-[16px] animate-spin" aria-hidden /> : recording ? <Square className="size-[13px] fill-current" aria-hidden /> : <Mic className="size-[17px]" aria-hidden />}
      </button>
    </>
  );
}

/**
 * The box while dictating, laid over the box's input row by the box (an absolutely placed element inside it): the
 * words so far, the level wave, ✕ and ✓. Renders nothing unless live dictation is running.
 */
export function VoiceLivePanel({ className }: { className?: string }) {
  const state = useContext(VoiceContext);
  if (!state || state.live.state.kind === "idle") return null;
  const { live } = state;
  const current = live.state;
  return (
    <div data-testid="voice-live" className={cn("absolute inset-0 z-10 rounded-[inherit]", className)}>
      <LiveDictationPanel
        text={current.kind === "live" || current.kind === "finishing" ? current.text : ""}
        levels={live.levels}
        seconds={current.kind === "live" ? current.seconds : 0}
        connecting={current.kind === "connecting"}
        finishing={current.kind === "finishing"}
        onCancel={() => void live.cancel()}
        onSend={() => void live.send()}
      />
    </div>
  );
}

/**
 * Everything voice says, in one place under the box: the first-use notice, the recording warning, the cut-off offer,
 * "Check the words", every error (role="alert"), and the standing hint line.
 */
export function VoiceNotice({ className, id }: { className?: string; id?: string }) {
  const state = useContext(VoiceContext);
  const acceptRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (state?.askingConsent) acceptRef.current?.focus();
  }, [state?.askingConsent]);
  if (!state) return null;
  const { recorder, live, microphones, askingConsent, accept, decline, liveError, liveChecked } = state;
  const { phase, seconds } = recorder;
  const error = recorder.error ?? liveError;
  const buttonClass = "min-h-9 rounded-full border border-current px-3 text-[12px] font-semibold";
  return (
    <div id={id} data-testid="voice-notice" className={cn("text-[12px] leading-snug", className)}>
      {askingConsent ? (
        <div role="dialog" aria-label="About voice" className="mb-1.5 space-y-2 rounded-lg border border-border bg-surface p-3 text-foreground">
          <p>{VOICE_NOTICE}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={decline} className={buttonClass}>
              Not now
            </button>
            <button ref={acceptRef} type="button" onClick={accept} className={cn(buttonClass, "bg-foreground text-background")}>
              OK, use voice
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="font-semibold">
          {error}
        </p>
      ) : null}
      {phase === "recording" ? (
        <p role="status">
          {seconds >= WARNING_SECONDS ? `${60 - seconds} seconds left. Recording stops at 60 seconds.` : "Recording… tap the mic again to stop."}
        </p>
      ) : null}
      {phase === "uploading" ? <p role="status">Transcribing…</p> : null}
      {phase === "cutoff" ? (
        <div role="alert" className="flex flex-wrap items-center gap-2">
          <span>The recording stopped early.</span>
          <button type="button" onClick={recorder.transcribeCutoff} className={buttonClass}>
            Transcribe this
          </button>
          <button
            type="button"
            onClick={() => {
              recorder.cancel();
              void recorder.start();
            }}
            className={buttonClass}
          >
            Try again
          </button>
        </div>
      ) : null}
      {phase === "done" || liveChecked ? <p role="status">{VOICE_CHECK}</p> : null}
      {/*
       * WHICH MICROPHONE: always there while voice is on (the owner: "i still cant pick a microfphone to use"). Opening
       * it reads the list again and, when the browser still hides the names, asks for the microphone once. The choice is
       * kept in this browser. The options are dark on light: a browser that draws its own dropdown shows them readably.
       */}
      {microphones.supported ? (
        <label className="flex flex-wrap items-center gap-1.5 opacity-80">
          Microphone
          <select
            aria-label="Microphone"
            data-testid="voice-microphone"
            value={microphones.chosen ?? ""}
            disabled={phase === "recording" || phase === "uploading" || phase === "requesting" || live.state.kind !== "idle"}
            onChange={(event) => microphones.choose(event.target.value || null)}
            onFocus={() => void microphones.open()}
            onPointerDown={() => void microphones.open()}
            className="max-w-[16rem] truncate rounded-md border border-border bg-surface px-1.5 py-0.5 text-[12px] font-semibold text-foreground"
          >
            <option value="" className="bg-white text-black">
              Default microphone
            </option>
            {microphones.microphones.map((microphone) => (
              <option key={microphone.id} value={microphone.id} className="bg-white text-black">
                {microphone.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <p className="opacity-80">{VOICE_HINT}</p>
    </div>
  );
}

/**
 * The box's own record of what voice put in it, so Send can say `inputMode: "voice"` and whether the text was edited.
 * `voiceEdited` compares the sent text with the box's text right after the last transcript landed.
 */
export function useVoiceDraft() {
  const landed = useRef<{ traceId: string; text: string } | null>(null);
  /** The box's next text: the transcript appended, with a space when text is already there. */
  const land = useCallback((current: string, transcript: string, traceId: string): string => {
    const next = current.trim() ? `${current.replace(/\s+$/, "")} ${transcript}` : transcript;
    landed.current = { traceId, text: next };
    return next;
  }, []);
  /** The fields for this send (and forget them), or {} when voice was not used. */
  const take = useCallback((sent: string): { inputMode?: "voice"; voiceTraceId?: string; voiceEdited?: boolean } => {
    const mark = landed.current;
    landed.current = null;
    if (!mark) return {};
    return { inputMode: "voice", voiceTraceId: mark.traceId, voiceEdited: sent.trim() !== mark.text.trim() };
  }, []);
  /** The box was emptied: voice no longer describes what is in it. */
  const forgetIfEmpty = useCallback((value: string) => {
    if (!value.trim()) landed.current = null;
  }, []);
  return { land, take, forgetIfEmpty };
}
