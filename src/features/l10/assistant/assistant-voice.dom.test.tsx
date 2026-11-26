// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * BOX D, THE L10 TAB ASSISTANT (VOICE_INPUT_ENABLED). Its own textarea (`draft`), @-mentions, attachments and Deep
 * think; the shared mic sits between the paperclip and Deep think. The transcript is appended with setDraft (the
 * @-mention list does not open), and Send posts to /api/l10/assistant exactly as before: nothing new is sent there.
 * Invented names only.
 */
vi.mock("@/features/l10/actions", () => ({ meetingPeopleAction: async () => [{ id: "hub-1", name: "Dorian Felsworth" }] }));

import { VoiceAccessProvider } from "@/features/voice/voice-access";
import { CONSENT_KEY, dictate, installFakeMic, removeFakeMic } from "@/features/voice/voice-test-support";
import { AssistantPanel } from "./AssistantPanel";

const SCOPE = "user-ada:bcs-dm";
let voiceCalls: string[];
let assistantPosts: Record<string, unknown>[];
let holdAssistant: boolean;

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(CONSENT_KEY("user-ada"), "yes");
  installFakeMic();
  voiceCalls = [];
  assistantPosts = [];
  holdAssistant = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/chat/voice")) {
        voiceCalls.push(String(url));
        return new Response(JSON.stringify({ text: "what rocks are off track for dorian", traceId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }), { status: 200 });
      }
      if (init?.method === "POST") {
        assistantPosts.push(JSON.parse(String(init.body)));
        if (holdAssistant) return new Promise<Response>(() => undefined);
        return new Response(JSON.stringify({ error: "x" }), { status: 500 });
      }
      return new Response(JSON.stringify({ configured: true }), { status: 200 });
    }),
  );
});
afterEach(() => {
  cleanup();
  removeFakeMic();
  window.localStorage.clear();
});

async function openPanel(enabled = true) {
  render(
    <VoiceAccessProvider value={{ enabled, userKey: "user-ada" }}>
      <AssistantPanel open onClose={() => {}} meetingKey="bcs-dm" scope={SCOPE} />
    </VoiceAccessProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
}

const box = () => screen.getByLabelText("Message the Leadership Assistant") as HTMLTextAreaElement;

describe("box D: the L10 assistant's mic", () => {
  it("no mic when voice is off", async () => {
    await openPanel(false);
    expect(screen.queryByRole("button", { name: "Speak your message" })).toBeNull();
  });

  it("a mic between the paperclip and Deep think, styled like its neighbours", async () => {
    await openPanel();
    const micButton = screen.getByRole("button", { name: "Speak your message" });
    const paperclip = screen.getByRole("button", { name: "Attach images or PDFs" });
    const deep = screen.getByRole("switch", { name: /Deep think/ });
    expect(paperclip.compareDocumentPosition(micButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(micButton.compareDocumentPosition(deep) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(micButton.className).toContain("size-11");
    expect(micButton.className).toContain("focus-visible:outline-bronze");
  });

  it("the transcript is appended to the draft, the box takes focus, and the @-mention list stays closed", async () => {
    await openPanel();
    fireEvent.change(box(), { target: { value: "quick one" } });
    await dictate();
    expect(voiceCalls).toEqual(["/api/chat/voice?surface=l10&meetingKey=bcs-dm"]);
    expect(box().value).toBe("quick one what rocks are off track for dorian");
    expect(document.activeElement).toBe(box());
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Send still posts to /api/l10/assistant as before, with nothing new", async () => {
    await openPanel();
    await dictate();
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(assistantPosts).toHaveLength(1));
    const post = assistantPosts[0];
    expect(post).not.toHaveProperty("inputMode");
    expect(post).not.toHaveProperty("voiceTraceId");
    expect(post).not.toHaveProperty("voiceEdited");
    expect(JSON.stringify(post)).toContain("what rocks are off track for dorian");
    expect(post).toMatchObject({ deep: false, key: "bcs-dm" });
  });

  it("the mic is disabled while the assistant is running", async () => {
    holdAssistant = true;
    await openPanel();
    fireEvent.change(box(), { target: { value: "a question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Stop generating" })).toBeTruthy());
    expect((screen.getByRole("button", { name: "Speak your message" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
