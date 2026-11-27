// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/overlays";
import { VoiceAccessProvider } from "@/features/voice/voice-access";
import { CONSENT_KEY, dictate, fakeVoiceRoute, installFakeMic, removeFakeMic } from "@/features/voice/voice-test-support";
import { Composer, type VoiceSendFields } from "./composer";
import type { AnswerMode } from "@/types";

/**
 * BOX A, THE MAIN CHAT (VOICE_INPUT_ENABLED). A gated, working mic between the field and Send; nothing when voice is
 * off. The ban on dead controls (`composer.dom.test.tsx`, `chat-layout.test.ts`) still holds: this mic only renders
 * when the server says the person may use voice and the browser can record.
 */

const submits: (VoiceSendFields | undefined)[] = [];

function Harness({ busy = false, initial = "" }: { busy?: boolean; initial?: string }) {
  const [value, setValue] = React.useState(initial);
  const [mode, setMode] = React.useState<AnswerMode>("standard");
  return (
    <Composer value={value} onChange={setValue} onSubmit={(voice) => submits.push(voice)} mode={mode} onModeChange={setMode} busy={busy} conversationId="conv_mhx1y2z3abcdefgh" />
  );
}

function renderBox(props: { busy?: boolean; initial?: string; enabled?: boolean } = {}) {
  return render(
    <TooltipProvider>
      <VoiceAccessProvider value={{ enabled: props.enabled ?? true, userKey: "user-ada" }}>
        <Harness busy={props.busy} initial={props.initial} />
      </VoiceAccessProvider>
    </TooltipProvider>,
  );
}

const flush = () => act(async () => Promise.resolve());

beforeEach(() => {
  submits.length = 0;
  window.localStorage.setItem(CONSENT_KEY("user-ada"), "yes");
  installFakeMic();
});
afterEach(() => {
  cleanup();
  removeFakeMic();
  window.localStorage.clear();
});

describe("box A: the main chat's mic", () => {
  it("no mic when voice is off", async () => {
    renderBox({ enabled: false });
    await flush();
    expect(screen.queryByRole("button", { name: /speak your message|microphone|voice/i })).toBeNull();
  });

  it("a mic between the field and Send when on", async () => {
    renderBox();
    await flush();
    const micButton = screen.getByRole("button", { name: "Speak your message" });
    const send = screen.getByRole("button", { name: "Send message" });
    expect(micButton.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(micButton.compareDocumentPosition(screen.getByLabelText("Ask Bubbles a question")) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("the mic is disabled while the box is busy", async () => {
    renderBox({ busy: true });
    await flush();
    expect((screen.getByRole("button", { name: "Speak your message" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the transcript lands in the composer's own text, after a space, and the field takes focus", async () => {
    const route = fakeVoiceRoute({ text: "what is the attendance policy" });
    renderBox({ initial: "quick one:" });
    await flush();
    await dictate();
    const field = screen.getByLabelText("Ask Bubbles a question") as HTMLTextAreaElement;
    expect(field.value).toBe("quick one: what is the attendance policy");
    expect(document.activeElement).toBe(field);
    expect(route.calls[0].url).toBe("/api/chat/voice?surface=chat");
    expect(route.calls[0].form.get("conversationId")).toBe("conv_mhx1y2z3abcdefgh");
  });

  it("Send still works as before, now saying the text came from voice; edited is false when unchanged", async () => {
    fakeVoiceRoute({ text: "what is the attendance policy", traceId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" });
    renderBox();
    await flush();
    await dictate();
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(submits).toEqual([{ inputMode: "voice", voiceTraceId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", voiceEdited: false }]);
  });

  it("edited is true when the manager changed the words", async () => {
    fakeVoiceRoute({ text: "what is the attendance policy" });
    renderBox();
    await flush();
    await dictate();
    fireEvent.change(screen.getByLabelText("Ask Bubbles a question"), { target: { value: "what is the attendance policy for minors" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(submits[0]).toMatchObject({ inputMode: "voice", voiceEdited: true });
  });

  it("a typed question sends no voice fields", async () => {
    renderBox({ initial: "typed question" });
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(submits).toEqual([{}]);
  });

  it("voice errors show in the composer's notice place, as alerts", async () => {
    fakeVoiceRoute({ status: 503, error: "Voice is busy. Try again in a few seconds, or type your message." });
    renderBox({ initial: "keep" });
    await flush();
    let clock = Date.now();
    const spy = vi.spyOn(Date, "now").mockImplementation(() => clock);
    fireEvent.click(screen.getByRole("button", { name: "Speak your message" }));
    await screen.findByRole("button", { name: "Stop recording" });
    clock += 2000;
    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Voice is busy. Try again in a few seconds, or type your message.");
    spy.mockRestore();
    expect((screen.getByLabelText("Ask Bubbles a question") as HTMLTextAreaElement).value).toBe("keep");
  });
});
