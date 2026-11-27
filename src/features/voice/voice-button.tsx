"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Loader2, Mic, Square } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { VOICE_CHECK, VOICE_HINT, VOICE_NOTICE } from "@/lib/voice/voice-messages";

import { useVoiceAccess } from "./voice-access";
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
 */

export interface VoiceControlProps {
  readonly surface: VoiceSurface;
  readonly meetingKey?: string;
  readonly conversationId?: string | null;
  /** The box is busy (a turn in flight): the mic is disabled. */
  readonly disabled?: boolean;
  readonly onText: (text: string, traceId: string) => void;
  readonly children: ReactNode;
}

type Recorder = ReturnType<typeof useVoiceRecorder>;

interface VoiceState {
  readonly recorder: Recorder;
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

function ActiveVoiceControl({ surface, meetingKey, conversationId, disabled = false, onText, children, userKey }: VoiceControlProps & { userKey: string | null }) {
  const recorder = useVoiceRecorder({ surface, meetingKey, conversationId, onText });
  const [askingConsent, setAskingConsent] = useState(false);
  const { phase, start, stop, clearDone } = recorder;

  /* Sending (the box turns busy) clears "Check the words". */
  useEffect(() => {
    if (disabled) clearDone();
  }, [disabled, clearDone]);

  const tap = useCallback(() => {
    if (phase === "recording") {
      stop();
      return;
    }
    if (disabled || phase === "uploading" || phase === "requesting") return;
    if (!readConsent(userKey)) {
      setAskingConsent(true);
      return;
    }
    void start();
  }, [disabled, phase, start, stop, userKey]);

  const accept = useCallback(() => {
    saveConsent(userKey, "yes");
    setAskingConsent(false);
    void start();
  }, [start, userKey]);

  const decline = useCallback(() => {
    saveConsent(userKey, "no");
    setAskingConsent(false);
  }, [userKey]);

  const value = useMemo<VoiceState>(
    () => ({ recorder, disabled, askingConsent, tap, accept, decline }),
    [recorder, disabled, askingConsent, tap, accept, decline],
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
  const { recorder, disabled, tap } = state;
  const { phase, seconds } = recorder;
  const recording = phase === "recording";
  const working = phase === "uploading" || phase === "requesting";
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
  const { recorder, askingConsent, accept, decline } = state;
  const { phase, seconds, error } = recorder;
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
      {phase === "done" ? <p role="status">{VOICE_CHECK}</p> : null}
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
