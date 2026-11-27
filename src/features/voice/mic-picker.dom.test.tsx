// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VOICE_MESSAGES } from "@/lib/voice/voice-messages";

import { MIC_STORAGE_KEY } from "./mic-choice";
import { VoiceAccessProvider } from "./voice-access";
import { VoiceButton, VoiceControl, VoiceNotice } from "./voice-button";
import { CONSENT_KEY, fakeVoiceRoute, installFakeMic, removeFakeMic, type FakeMic } from "./voice-test-support";

/*
 * VOICE_INPUT_ENABLED: which microphone (ported from Ask Sunny). The owner, 27 Nov 2026, on live voice: recording said
 * "I did not hear anything. Check your microphone and try again.", and "i think i need to choose which mic because i
 * have usb mic not built in". A fake microphone, MediaRecorder, audio level and voice route; device names are invented.
 */

const BUILT_IN = { deviceId: "built-in-1", kind: "audioinput", label: "Built-in Microphone", groupId: "g1" };
const USB = { deviceId: "usb-1", kind: "audioinput", label: "USB Microphone", groupId: "g2" };

let fake: FakeMic;
let devices: { deviceId: string; kind: string; label: string; groupId: string }[];
let deviceListeners: (() => void)[];
let level: number;

function Box() {
  return (
    <VoiceAccessProvider value={{ enabled: true, userKey: "user-ada" }}>
      <VoiceControl surface="chat" conversationId={null} onText={vi.fn()}>
        <VoiceButton />
        <VoiceNotice />
      </VoiceControl>
    </VoiceAccessProvider>
  );
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
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

class FakeAudioContext {
  createMediaStreamSource() {
    return { connect: vi.fn() };
  }
  createAnalyser() {
    return { fftSize: 1024, connect: vi.fn(), disconnect: vi.fn(), getFloatTimeDomainData: (array: Float32Array) => array.fill(level) };
  }
  close = vi.fn(async () => undefined);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  window.localStorage.setItem(CONSENT_KEY("user-ada"), "yes");
  fake = installFakeMic();
  devices = [BUILT_IN, USB];
  deviceListeners = [];
  level = 0.004;
  (fake.track as unknown as { label: string }).label = "USB Microphone";
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: fake.getUserMedia,
      enumerateDevices: vi.fn(async () => devices),
      addEventListener: (_type: string, listener: () => void) => deviceListeners.push(listener),
      removeEventListener: vi.fn(),
    },
  });
  vi.stubGlobal("AudioContext", FakeAudioContext);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  removeFakeMic();
  window.localStorage.clear();
});

const picker = () => screen.queryByRole("combobox", { name: "Microphone" }) as HTMLSelectElement | null;

async function recordOnce() {
  fireEvent.click(screen.getByRole("button", { name: "Speak your message" }));
  await flush();
  await advance(2_100);
  fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
  await flush();
  await flush();
}

describe('"i think i need to choose which mic because i have usb mic not built in"', () => {
  it("a Microphone choice lists this browser's microphones, and the one chosen is the one recorded from", async () => {
    fakeVoiceRoute();
    render(<Box />);
    await flush();
    const choice = picker()!;
    expect([...choice.options].map((option) => option.textContent)).toEqual(["Default microphone", "Built-in Microphone", "USB Microphone"]);
    fireEvent.change(choice, { target: { value: "usb-1" } });
    expect(window.localStorage.getItem(MIC_STORAGE_KEY)).toBe("usb-1");
    await recordOnce();
    expect(fake.getUserMedia).toHaveBeenCalledWith({ audio: { deviceId: { exact: "usb-1" } } });
  });

  it("the choice is remembered in this browser", async () => {
    window.localStorage.setItem(MIC_STORAGE_KEY, "usb-1");
    render(<Box />);
    await flush();
    expect(picker()!.value).toBe("usb-1");
  });

  // CHANGED ON PURPOSE (the owner, 27 Nov 2026: "i still cant pick a microfphone to use"): the choice used to hide
  // with one microphone listed, which is also what a browser shows before it has been allowed one. It always shows now.
  it("one microphone: the choice still shows, with it in the list", async () => {
    devices = [USB];
    render(<Box />);
    await flush();
    expect([...picker()!.options].map((option) => option.textContent)).toEqual(["Default microphone", "USB Microphone"]);
  });

  it("the saved microphone is unplugged: the default is used, never forced", async () => {
    fakeVoiceRoute();
    window.localStorage.setItem(MIC_STORAGE_KEY, "usb-1");
    devices = [BUILT_IN, { ...BUILT_IN, deviceId: "headset-1", label: "Headset" }];
    render(<Box />);
    await flush();
    expect(picker()!.value).toBe("");
    await recordOnce();
    expect(fake.getUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it("the saved microphone cannot be opened (gone since the list was read): the default is opened instead", async () => {
    fakeVoiceRoute();
    window.localStorage.setItem(MIC_STORAGE_KEY, "usb-1");
    fake.getUserMedia.mockImplementationOnce(async () => {
      throw new DOMException("gone", "OverconstrainedError");
    });
    render(<Box />);
    await flush();
    await recordOnce();
    expect(fake.getUserMedia).toHaveBeenNthCalledWith(1, { audio: { deviceId: { exact: "usb-1" } } });
    expect(fake.getUserMedia).toHaveBeenNthCalledWith(2, { audio: true });
  });

  it("a microphone plugged in later appears in the choice", async () => {
    devices = [BUILT_IN];
    render(<Box />);
    await flush();
    expect([...picker()!.options].map((option) => option.textContent)).not.toContain("USB Microphone");
    devices = [BUILT_IN, USB];
    await act(async () => {
      for (const listener of deviceListeners) listener();
    });
    await flush();
    expect([...picker()!.options].map((option) => option.textContent)).toContain("USB Microphone");
  });
});

describe('"I did not hear anything. Check your microphone and try again." only when nothing was heard', () => {
  it("a quiet USB microphone is not 'no sound': the provider's own answer is said", async () => {
    level = 0.004;
    fakeVoiceRoute({ status: 422, error: VOICE_MESSAGES.nothingHeard });
    render(<Box />);
    await flush();
    await recordOnce();
    expect(screen.getByRole("alert").textContent).toBe(VOICE_MESSAGES.nothingHeard);
  });

  it("the microphone sent no sound at all: it is named, and another can be picked", async () => {
    level = 0;
    fakeVoiceRoute({ status: 422, error: VOICE_MESSAGES.nothingHeard });
    render(<Box />);
    await flush();
    await recordOnce();
    expect(screen.getByRole("alert").textContent).toBe("No sound came from your microphone (USB Microphone). Choose another microphone and try again.");
    expect(picker()).not.toBeNull();
  });
});

describe('"i still cant pick a microfphone to use" (the owner, 27 Nov 2026)', () => {
  const HIDDEN = { deviceId: "", kind: "audioinput", label: "", groupId: "" };

  it("before the browser has been allowed a microphone: the choice shows; opening it asks once, then lists them by name", async () => {
    devices = [HIDDEN];
    render(<Box />);
    await flush();
    const choice = picker()!;
    expect([...choice.options].map((option) => option.textContent)).toEqual(["Default microphone"]);
    fake.getUserMedia.mockImplementationOnce(async () => {
      devices = [BUILT_IN, USB];
      return { getTracks: () => [fake.track], getAudioTracks: () => [fake.track] } as unknown as MediaStream;
    });
    fireEvent.focus(choice);
    await flush();
    await flush();
    expect(fake.getUserMedia).toHaveBeenCalledTimes(1);
    expect(fake.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect([...picker()!.options].map((option) => option.textContent)).toEqual(["Default microphone", "Built-in Microphone", "USB Microphone"]);
    fireEvent.focus(picker()!);
    await flush();
    expect(fake.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("the names already show: opening it reads the list again and never asks for the microphone", async () => {
    devices = [BUILT_IN];
    render(<Box />);
    await flush();
    devices = [BUILT_IN, USB];
    fireEvent.pointerDown(picker()!);
    await flush();
    expect([...picker()!.options].map((option) => option.textContent)).toContain("USB Microphone");
    expect(fake.getUserMedia).not.toHaveBeenCalled();
  });

  it("the options are dark on light, readable in a browser that draws its own dropdown", async () => {
    render(<Box />);
    await flush();
    for (const option of picker()!.options) expect(option.className).toMatch(/bg-white/);
    for (const option of picker()!.options) expect(option.className).toMatch(/text-black/);
  });
});
