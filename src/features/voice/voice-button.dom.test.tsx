// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VOICE_CHECK, VOICE_HINT, VOICE_MESSAGES, VOICE_NOTICE } from "@/lib/voice/voice-messages";

import { VoiceAccessProvider } from "./voice-access";
import { useVoiceDraft, VoiceButton, VoiceControl, VoiceNotice } from "./voice-button";
import { CONSENT_KEY, FakeMediaRecorder, fakeVoiceRoute, installFakeMic, removeFakeMic } from "./voice-test-support";

/** The shared mic (VOICE_INPUT_ENABLED) in a stand-in box with its own text state. Invented names only. */

function Box({ disabled = false, initial = "" }: { disabled?: boolean; initial?: string }) {
  const [value, setValue] = React.useState(initial);
  const voice = useVoiceDraft();
  const [sent, setSent] = React.useState<string>("");
  return (
    <VoiceControl surface="chat" conversationId={null} disabled={disabled} onText={(text, traceId) => setValue((current) => voice.land(current, text, traceId))}>
      <textarea aria-label="Box" value={value} onChange={(event) => setValue(event.target.value)} />
      <VoiceButton />
      <button type="button" onClick={() => setSent(JSON.stringify({ value, ...voice.take(value) }))}>
        Send
      </button>
      <VoiceNotice />
      <output data-testid="sent">{sent}</output>
    </VoiceControl>
  );
}

function renderBox(props: { disabled?: boolean; initial?: string; enabled?: boolean } = {}) {
  return render(
    <VoiceAccessProvider value={{ enabled: props.enabled ?? true, userKey: "user-ada" }}>
      <Box disabled={props.disabled} initial={props.initial} />
    </VoiceAccessProvider>,
  );
}

const mic = () => screen.queryByRole("button", { name: /speak your message|stop recording|transcribing/i });
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};
const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  window.localStorage.setItem(CONSENT_KEY("user-ada"), "yes");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  removeFakeMic();
  window.localStorage.clear();
});

describe("when the mic is shown", () => {
  it("hidden when voice is off for this person", async () => {
    installFakeMic();
    renderBox({ enabled: false });
    await flush();
    expect(mic()).toBeNull();
    expect(screen.queryByText(VOICE_HINT)).toBeNull();
  });

  it("hidden when there is no provider at all", async () => {
    installFakeMic();
    render(<Box />);
    await flush();
    expect(mic()).toBeNull();
  });

  it("hidden when the browser cannot record", async () => {
    renderBox();
    await flush();
    expect(mic()).toBeNull();
  });

  it.each(["Mozilla/5.0 (iPhone) AppleWebKit Slack/23.10", "Mozilla/5.0 Teams/1.6 Electron", "Mozilla/5.0 (iPhone) GSA/300.0 Mobile Gmail"])("hidden in an in-app browser: %s", async (agent) => {
    installFakeMic();
    const spy = vi.spyOn(navigator, "userAgent", "get").mockReturnValue(agent);
    renderBox();
    await flush();
    expect(mic()).toBeNull();
    spy.mockRestore();
  });

  it("shown with the hint line when on", async () => {
    installFakeMic();
    renderBox();
    await flush();
    expect(mic()).not.toBeNull();
    expect(screen.getByText(VOICE_HINT)).toBeTruthy();
  });

  it("disabled when the box says so", async () => {
    installFakeMic();
    renderBox({ disabled: true });
    await flush();
    expect((mic() as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("recording", () => {
  it("start, timer, stop: the text is appended to what was typed, then 'Check the words'", async () => {
    installFakeMic();
    const route = fakeVoiceRoute();
    renderBox({ initial: "typed first" });
    await flush();
    fireEvent.click(mic()!);
    await flush();
    expect(screen.getByRole("button", { name: "Stop recording" })).toBeTruthy();
    await advance(3200);
    expect(screen.getByTestId("voice-timer").textContent).toBe("0:03");
    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    await flush();
    await flush();
    expect(route.calls).toHaveLength(1);
    expect(route.calls[0].url).toBe("/api/chat/voice?surface=chat");
    expect([...route.calls[0].form.keys()].sort()).toEqual(["audio", "clipSeconds"]);
    expect((screen.getByLabelText("Box") as HTMLTextAreaElement).value).toBe("typed first coach ada about the late start");
    expect(screen.getByText(VOICE_CHECK)).toBeTruthy();
  });

  it("Send says the text came from voice, and whether it was edited", async () => {
    installFakeMic();
    fakeVoiceRoute();
    renderBox();
    await flush();
    fireEvent.click(mic()!);
    await flush();
    await advance(2000);
    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    await flush();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(JSON.parse(screen.getByTestId("sent").textContent!)).toEqual({ value: "coach ada about the late start", inputMode: "voice", voiceTraceId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", voiceEdited: false });
  });

  it("an edit before Send is reported as edited", async () => {
    installFakeMic();
    fakeVoiceRoute();
    renderBox();
    await flush();
    fireEvent.click(mic()!);
    await flush();
    await advance(2000);
    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    await flush();
    await flush();
    fireEvent.change(screen.getByLabelText("Box"), { target: { value: "coach Ada about the late start today" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(JSON.parse(screen.getByTestId("sent").textContent!)).toMatchObject({ inputMode: "voice", voiceEdited: true });
  });

  it("warns at 50 s and stops itself at 60 s", async () => {
    installFakeMic();
    const route = fakeVoiceRoute();
    renderBox();
    await flush();
    fireEvent.click(mic()!);
    await flush();
    await advance(50_000);
    expect(screen.getByText(/10 seconds left/)).toBeTruthy();
    expect(route.calls).toHaveLength(0);
    await advance(10_250);
    await flush();
    expect(route.calls).toHaveLength(1);
    expect(Number(route.calls[0].form.get("clipSeconds"))).toBeLessThanOrEqual(60);
  });

  it("mic denied: the blocked sentence, as an alert", async () => {
    installFakeMic("deny");
    renderBox();
    await flush();
    fireEvent.click(mic()!);
    await flush();
    expect(screen.getByRole("alert").textContent).toBe(VOICE_MESSAGES.micBlocked);
  });

  it("no answer to the permission prompt within 15 s: the same sentence", async () => {
    installFakeMic("hang");
    renderBox();
    await flush();
    fireEvent.click(mic()!);
    await flush();
    await advance(15_001);
    await flush();
    expect(screen.getByRole("alert").textContent).toBe(VOICE_MESSAGES.micBlocked);
  });

  it("a cut-off clip over 0.5 s offers 'Transcribe this' or 'Try again'", async () => {
    const fake = installFakeMic();
    const route = fakeVoiceRoute();
    renderBox();
    await flush();
    fireEvent.click(mic()!);
    await flush();
    await advance(2000);
    act(() => fake.track.onended?.());
    await flush();
    expect(fake.track.stopped).toBe(true);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Transcribe this" }));
    await flush();
    await flush();
    expect(route.calls).toHaveLength(1);
  });

  it("a failure keeps the typed text and says why", async () => {
    installFakeMic();
    fakeVoiceRoute({ status: 503, error: VOICE_MESSAGES.busy });
    renderBox({ initial: "keep me" });
    await flush();
    fireEvent.click(mic()!);
    await flush();
    await advance(2000);
    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    await flush();
    await flush();
    expect(screen.getByRole("alert").textContent).toBe(VOICE_MESSAGES.busy);
    expect((screen.getByLabelText("Box") as HTMLTextAreaElement).value).toBe("keep me");
  });

  it("the tab hidden stops recording and releases the mic", async () => {
    const fake = installFakeMic();
    renderBox();
    await flush();
    fireEvent.click(mic()!);
    await flush();
    await advance(1500);
    const spy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();
    expect(fake.track.stopped).toBe(true);
    expect(FakeMediaRecorder.last?.state).toBe("inactive");
    spy.mockRestore();
  });
});

describe("first use", () => {
  it("shows the notice; 'Not now' records nothing; 'OK, use voice' starts and is remembered", async () => {
    window.localStorage.clear();
    const fake = installFakeMic();
    renderBox();
    await flush();
    fireEvent.click(mic()!);
    await flush();
    expect(screen.getByText(VOICE_NOTICE)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByText(VOICE_NOTICE)).toBeNull();
    expect(fake.getUserMedia).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(CONSENT_KEY("user-ada"))).toBe("no");

    fireEvent.click(mic()!);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "OK, use voice" }));
    await flush();
    expect(fake.getUserMedia).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(CONSENT_KEY("user-ada"))).toBe("yes");
    expect(screen.getByRole("button", { name: "Stop recording" })).toBeTruthy();
  });
});
