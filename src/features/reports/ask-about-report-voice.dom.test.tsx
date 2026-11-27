// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

import { VoiceAccessProvider } from "@/features/voice/voice-access";
import { CONSENT_KEY, dictate, fakeVoiceRoute, installFakeMic, removeFakeMic } from "@/features/voice/voice-test-support";
import type { ChatConversation, ChatMessage } from "@/types";
import type { ClientAskRequest } from "@/lib/ai/types";

import { AskAboutReport } from "./ask-about-report";

/**
 * BOX C (VOICE_INPUT_ENABLED): The report ask bar (`AskAboutReport`) has its own textarea and sends through `useInlineAsk`. The shared mic sits
 * beside its send button; the transcript lands in the box's own text; Send is unchanged apart from saying the text came from voice.
 * Invented names only.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/",
}));

vi.mock("@/lib/session/session-context", () => ({
  useSession: () => ({
    user: { name: "Marlowe Example", isLocationAccount: false, title: "Owner", scope: {} },
    role: "owner",
    can: () => true,
    primaryLocationName: "Testville Downtown",
    managerDisplayName: "Marlowe",
    demoMode: true,
    brand: { knowledgeScopeId: "bcs-core" },
  }),
}));

/* ------------------------------------------------------------ the store ---- */

let conversations: ChatConversation[] = [];
let notify: (() => void) | null = null;

function useFakeStore() {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    notify = force;
    return () => {
      notify = null;
    };
  }, [force]);
  return {
    forms: [],
    documents: [{ id: "doc-1" }],
    videos: [],
    conversations,
    addConversation(conversation: ChatConversation) {
      conversations = [conversation, ...conversations];
      notify?.();
    },
    appendConversationMessages(id: string, messages: ChatMessage[]) {
      conversations = conversations.map((entry) =>
        entry.id === id ? { ...entry, messages: [...entry.messages, ...messages] } : entry,
      );
      notify?.();
    },
    updateConversation() {},
  };
}

vi.mock("@/lib/store/app-store", () => ({
  useAppStore: () => useFakeStore(),
  /*
   * The optional accessor exists for components rendered outside a provider —
   * `useVideoLookup` takes it so a message bubble in isolation resolves no
   * video instead of throwing. Mocked to the same fake, so these cases behave
   * as they do inside the app.
   */
  useOptionalAppStore: () => useFakeStore(),
}));

/* ------------------------------------------------------------- the provider */

const asks: ClientAskRequest[] = [];
let hold: Promise<void> | null = null;

vi.mock("@/lib/ai", () => ({
  getAIProvider: () => ({
    name: "fake",
    connected: true,
    titleForConversation: (first: string) => first.slice(0, 20),
    async ask(request: ClientAskRequest) {
      asks.push(request);
      if (hold) await hold;
      return {
        content: `Answer ${asks.length}`,
        citations: [],
        coverage: "not_applicable" as const,
        followUpSuggestions: asks.length === 1 ? ["And a second occurrence?"] : [],
      };
    },
  }),
}));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  conversations = [];
  asks.length = 0;
  hold = null;
  window.localStorage.setItem(CONSENT_KEY("user-ada"), "yes");
  installFakeMic();
});

afterEach(() => {
  cleanup();
  removeFakeMic();
  window.localStorage.clear();
});

const flush = () => act(async () => Promise.resolve());

function renderBox(enabled = true) {
  return render(
    <VoiceAccessProvider value={{ enabled, userKey: "user-ada" }}>
      <AskAboutReport context={{ reportId: "sales-totals", period: null, locations: [], metric: null, view: null }} />
    </VoiceAccessProvider>,
  );
}

const field = () => screen.getByRole("textbox") as HTMLTextAreaElement;

describe("box C: the mic", () => {
  it("no mic when voice is off", async () => {
    renderBox(false);
    await flush();
    expect(screen.queryByRole("button", { name: "Speak your message" })).toBeNull();
  });

  it("a mic beside the send button when on", async () => {
    renderBox();
    await flush();
    const micButton = screen.getByRole("button", { name: "Speak your message" });
    expect(micButton.compareDocumentPosition(screen.getByRole("button", { name: /Ask Bubbles about this report/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the transcript lands in this box's own text and Send carries it, marked as voice, unedited", async () => {
    const route = fakeVoiceRoute({ text: "how did sales do last week compared to target", traceId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" });
    renderBox();
    await flush();
    await dictate();
    expect(route.calls[0].url).toBe("/api/chat/voice?surface=report");
    expect(field().value).toBe("how did sales do last week compared to target");
    expect(document.activeElement).toBe(field());
    fireEvent.click(screen.getByRole("button", { name: /Ask Bubbles about this report/ }));
    await waitFor(() => expect(asks).toHaveLength(1));
    expect(asks[0]).toMatchObject({ question: "how did sales do last week compared to target", inputMode: "voice", voiceTraceId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", voiceEdited: false });
  });

  it("an edit before Send is reported as edited", async () => {
    fakeVoiceRoute({ text: "how did sales do" });
    renderBox();
    await flush();
    await dictate();
    fireEvent.change(field(), { target: { value: "how did sales do at Riverbend" } });
    fireEvent.click(screen.getByRole("button", { name: /Ask Bubbles about this report/ }));
    await waitFor(() => expect(asks).toHaveLength(1));
    expect(asks[0]).toMatchObject({ question: "how did sales do at Riverbend", inputMode: "voice", voiceEdited: true });
  });

  it("a typed question sends as before, with no voice fields", async () => {
    renderBox();
    await flush();
    fireEvent.change(field(), { target: { value: "typed question" } });
    fireEvent.click(screen.getByRole("button", { name: /Ask Bubbles about this report/ }));
    await waitFor(() => expect(asks).toHaveLength(1));
    expect(asks[0].question).toBe("typed question");
    expect(asks[0]).not.toHaveProperty("inputMode");
    expect(asks[0]).not.toHaveProperty("voiceTraceId");
  });

  it("the mic is disabled while the box is busy", async () => {
    let release: () => void = () => undefined;
    hold = new Promise<void>((resolve) => (release = resolve));
    renderBox();
    await flush();
    fireEvent.change(field(), { target: { value: "a question" } });
    fireEvent.click(screen.getByRole("button", { name: /Ask Bubbles about this report/ }));
    await waitFor(() => expect(asks).toHaveLength(1));
    expect((screen.getByRole("button", { name: "Speak your message" }) as HTMLButtonElement).disabled).toBe(true);
    release();
    await waitFor(() => expect((screen.getByRole("button", { name: "Speak your message" }) as HTMLButtonElement).disabled).toBe(false));
  });
});
