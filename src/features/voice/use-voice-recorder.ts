"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { VOICE_MESSAGES } from "@/lib/voice/voice-messages";
import { MAX_SECONDS, MIN_SECONDS } from "@/lib/voice/voice-limits";

/**
 * RECORD ONE CLIP, SEND IT, GET ITS TEXT BACK (VOICE_INPUT_ENABLED). Shared by the four AI chat boxes.
 *
 * Tap to start, tap to stop; a 60 s clip stops itself (warning at 50 s). The mic permission is waited for at most 15 s,
 * the upload and answer at most 50 s. A screen Wake Lock is held while recording. A track that ends or mutes, or the tab
 * being hidden, stops the recording and releases the mic; with more than 0.5 s captured the person is offered
 * "Transcribe this" or "Try again". The clip lives in memory only until the answer comes back or the person cancels.
 * No Web Speech API.
 */

export type VoiceSurface = "chat" | "overview" | "report" | "l10";

export const MIME_PREFERENCE = ["audio/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/ogg;codecs=opus"] as const;

export const PERMISSION_TIMEOUT_MS = 15_000;
export const UPLOAD_TIMEOUT_MS = 50_000;
export const WARNING_SECONDS = 50;

const IN_APP_BROWSER = /\bSlack\b|Slack_SSB|\bTeams\/|MSTeams|\bGmail\b|\bGSA\//i;

export function voiceRecordingSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (typeof (window as { MediaRecorder?: unknown }).MediaRecorder === "undefined") return false;
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") return false;
  return !IN_APP_BROWSER.test(navigator.userAgent ?? "");
}

/** The first format the browser can record, in our order; undefined means "let the browser choose". */
export function pickVoiceMime(): string | undefined {
  const recorder = (window as { MediaRecorder?: { isTypeSupported?: (type: string) => boolean } }).MediaRecorder;
  if (!recorder || typeof recorder.isTypeSupported !== "function") return undefined;
  return MIME_PREFERENCE.find((type) => {
    try {
      return recorder.isTypeSupported!(type);
    } catch {
      return false;
    }
  });
}

export type VoicePhase = "idle" | "requesting" | "recording" | "cutoff" | "uploading" | "done";

export interface VoiceRecorderOptions {
  readonly surface: VoiceSurface;
  readonly meetingKey?: string;
  readonly conversationId?: string | null;
  readonly onText: (text: string, traceId: string) => void;
}

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

class PermissionTimeout extends Error {}

export function useVoiceRecorder({ surface, meetingKey, conversationId, onText }: VoiceRecorderOptions) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLock = useRef<WakeLockSentinelLike | null>(null);
  const clip = useRef<{ blob: Blob; seconds: number } | null>(null);
  /** What to do once the recorder has flushed: send, offer, or drop. */
  const afterStop = useRef<"send" | "offer" | "drop">("drop");
  const latest = useRef({ surface, meetingKey, conversationId, onText });
  useEffect(() => {
    latest.current = { surface, meetingKey, conversationId, onText };
  }, [surface, meetingKey, conversationId, onText]);

  const release = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    stream.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.onmute = null;
      track.stop();
    });
    stream.current = null;
    void wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;
  }, []);

  const elapsed = () => (Date.now() - startedAt.current) / 1000;

  const upload = useCallback(async (blob: Blob, clipSeconds: number) => {
    setPhase("uploading");
    setError(null);
    const { surface: box, meetingKey: key, conversationId: conversation } = latest.current;
    const form = new FormData();
    form.append("clipSeconds", clipSeconds.toFixed(2));
    if (conversation && box !== "l10") form.append("conversationId", conversation);
    form.append("audio", blob, blob.type.includes("mp4") ? "clip.mp4" : "clip.webm");
    const query = new URLSearchParams({ surface: box });
    if (box === "l10" && key) query.set("meetingKey", key);
    try {
      const response = await fetch(`/api/chat/voice?${query.toString()}`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
      const body = (await response.json().catch(() => null)) as { text?: unknown; traceId?: unknown; error?: unknown } | null;
      if (response.ok && typeof body?.text === "string" && typeof body.traceId === "string") {
        if (!body.text.trim()) {
          setError(VOICE_MESSAGES.nothingHeard);
          setPhase("idle");
          return;
        }
        latest.current.onText(body.text, body.traceId);
        setPhase("done");
        return;
      }
      setError(typeof body?.error === "string" && body.error.trim() ? body.error : VOICE_MESSAGES.unavailable);
      setPhase("idle");
    } catch (failure) {
      const name = failure instanceof Error ? failure.name : "";
      setError(name === "TimeoutError" || name === "AbortError" ? VOICE_MESSAGES.timeout : VOICE_MESSAGES.unavailable);
      setPhase("idle");
    } finally {
      clip.current = null; // The recording is dropped once the answer is back.
    }
  }, []);

  const finish = useCallback(
    (how: "send" | "offer" | "drop") => {
      const active = recorder.current;
      afterStop.current = how;
      if (active && active.state !== "inactive") {
        try {
          active.stop();
          return;
        } catch {
          /* Fall through: handle as stopped. */
        }
      }
      release();
    },
    [release],
  );

  const onStopped = useCallback(() => {
    const clipSeconds = Math.min(MAX_SECONDS, elapsed());
    const type = recorder.current?.mimeType || chunks.current[0]?.type || "audio/webm";
    const blob = new Blob(chunks.current, { type });
    chunks.current = [];
    recorder.current = null;
    release();
    const how = afterStop.current;
    afterStop.current = "drop";
    if (how === "drop") {
      setPhase("idle");
      return;
    }
    if (clipSeconds < MIN_SECONDS || blob.size === 0) {
      setError(VOICE_MESSAGES.nothingHeard);
      setPhase("idle");
      return;
    }
    if (how === "offer") {
      clip.current = { blob, seconds: clipSeconds };
      setPhase("cutoff");
      return;
    }
    void upload(blob, clipSeconds);
  }, [release, upload]);

  const start = useCallback(async () => {
    if (phase === "recording" || phase === "requesting" || phase === "uploading") return;
    setError(null);
    clip.current = null;
    setPhase("requesting");
    let media: MediaStream;
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PermissionTimeout()), PERMISSION_TIMEOUT_MS);
      });
      try {
        media = await Promise.race([navigator.mediaDevices.getUserMedia({ audio: true }), timeout]);
      } finally {
        clearTimeout(timer);
      }
    } catch {
      setError(VOICE_MESSAGES.micBlocked);
      setPhase("idle");
      return;
    }
    stream.current = media;
    const mimeType = pickVoiceMime();
    let next: MediaRecorder;
    try {
      next = mimeType ? new MediaRecorder(media, { mimeType }) : new MediaRecorder(media);
    } catch {
      release();
      setError(VOICE_MESSAGES.badAudio);
      setPhase("idle");
      return;
    }
    recorder.current = next;
    chunks.current = [];
    next.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) chunks.current.push(event.data);
    };
    next.onstop = onStopped;
    for (const track of media.getAudioTracks()) {
      track.onended = () => finish("offer");
      track.onmute = () => finish("offer");
    }
    try {
      const lock = (navigator as { wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> } }).wakeLock;
      if (lock) void lock.request("screen").then((sentinel) => (wakeLock.current = sentinel)).catch(() => undefined);
    } catch {
      /* No wake lock: recording still works. */
    }
    startedAt.current = Date.now();
    setSeconds(0);
    next.start(250);
    setPhase("recording");
    ticker.current = setInterval(() => {
      const now = elapsed();
      setSeconds(Math.min(MAX_SECONDS, Math.floor(now)));
      if (now >= MAX_SECONDS) finish("send");
    }, 250);
  }, [finish, onStopped, phase, release]);

  const stop = useCallback(() => finish("send"), [finish]);

  const cancel = useCallback(() => {
    clip.current = null;
    setError(null);
    if (recorder.current) finish("drop");
    else setPhase("idle");
  }, [finish]);

  const transcribeCutoff = useCallback(() => {
    const kept = clip.current;
    if (!kept) return;
    void upload(kept.blob, kept.seconds);
  }, [upload]);

  const clearDone = useCallback(() => setPhase((current) => (current === "done" ? "idle" : current)), []);
  const clearError = useCallback(() => setError(null), []);

  /* The tab hidden: stop and release the mic. */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && recorder.current) finish("offer");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [finish]);

  /* Unmounted mid-recording: drop everything. */
  useEffect(
    () => () => {
      afterStop.current = "drop";
      try {
        if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
      } catch {
        /* ignore */
      }
      release();
      clip.current = null;
    },
    [release],
  );

  return { phase, seconds, error, start, stop, cancel, transcribeCutoff, clearDone, clearError };
}
