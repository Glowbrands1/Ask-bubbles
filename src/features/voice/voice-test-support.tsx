import { vi } from "vitest";

/**
 * TEST SUPPORT for the mic (VOICE_INPUT_ENABLED): a fake `MediaRecorder` and `getUserMedia`, and a fake voice route.
 * Imported by `*.dom.test.tsx` files only.
 */

export class FakeTrack {
  onended: (() => void) | null = null;
  onmute: (() => void) | null = null;
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

export class FakeMediaRecorder {
  static supported = new Set(["audio/webm;codecs=opus"]);
  static last: FakeMediaRecorder | null = null;
  static isTypeSupported(type: string) {
    return FakeMediaRecorder.supported.has(type);
  }
  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? "audio/webm";
    FakeMediaRecorder.last = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    const bytes = new Uint8Array(4096);
    bytes.set([0x1a, 0x45, 0xdf, 0xa3]);
    this.ondataavailable?.({ data: new Blob([bytes], { type: this.mimeType }) });
    this.onstop?.();
  }
}

export interface FakeMic {
  track: FakeTrack;
  getUserMedia: ReturnType<typeof vi.fn>;
}

/** Installs the fakes; returns the track so a test can end or mute it. */
export function installFakeMic(mode: "allow" | "deny" | "hang" = "allow"): FakeMic {
  const track = new FakeTrack();
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const getUserMedia = vi.fn(() =>
    mode === "allow"
      ? Promise.resolve(stream)
      : mode === "deny"
        ? Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" }))
        : new Promise(() => undefined),
  );
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  return { track, getUserMedia };
}

export function removeFakeMic(): void {
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
  FakeMediaRecorder.last = null;
}

/** The voice route, faked: answers `text` (or an error body) and records each call. */
export function fakeVoiceRoute(answer: { status?: number; text?: string; traceId?: string; error?: string } = {}) {
  const calls: { url: string; form: FormData }[] = [];
  const fetchFake = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, form: init.body as FormData });
    const status = answer.status ?? 200;
    const body = status === 200 ? { text: answer.text ?? "coach ada about the late start", traceId: answer.traceId ?? "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" } : { error: answer.error, code: "x" };
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchFake);
  return { calls, fetchFake };
}

export const CONSENT_KEY = (userKey: string) => `ask-bubbles:voice-consent:${userKey}`;

/**
 * Taps the mic, records 2.5 s (by the clock the recorder reads) and stops, then waits for the transcript to land
 * ("Check the words…"). Consent must already be saved for the user key.
 */
export async function dictate(): Promise<void> {
  const { fireEvent, screen, waitFor } = await import("@testing-library/react");
  let clock = Date.now();
  const spy = vi.spyOn(Date, "now").mockImplementation(() => clock);
  try {
    fireEvent.click(screen.getByRole("button", { name: "Speak your message" }));
    await waitFor(() => screen.getByRole("button", { name: "Stop recording" }));
    clock += 2500;
    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    await waitFor(() => screen.getByText("Check the words, then press Send"));
  } finally {
    spy.mockRestore();
  }
}
