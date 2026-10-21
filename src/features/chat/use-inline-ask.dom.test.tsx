// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClientAskRequest } from "@/lib/ai/types";
import type { ChatConversation, ChatFormProposal, ChatMessage } from "@/types";

import { useInlineAsk } from "./use-inline-ask";

/**
 * ============================================================================
 * THE OVERVIEW BAND AND THE REPORT ASK BAR SEND WHAT THE CHAT SCREEN SENDS
 * ============================================================================
 *
 * After one message created two forms ("coaching for Avery and a CA for
 * Jordan"), a correction that names neither — "change the date to yesterday"
 * — is answered with "which one?". The chat screen sends the two forms' ids
 * for that (`activeFormCandidateIds`); this shared send path sent only
 * `activeFormInstanceId`, so the same correction typed in the Overview band or
 * a report's ask bar never got the question.
 */

vi.mock("@/lib/session/session-context", () => ({
  useSession: () => ({
    user: { name: "Marlowe Example", isLocationAccount: false, title: "Owner", scope: {} },
    role: "owner",
    can: () => true,
    primaryLocationName: "Kearney, NE",
    managerDisplayName: "Marlowe",
    demoMode: true,
  }),
}));

/* A real reducer, so the thread the second question carries is the stored one. */
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
    patchConversationMessage() {},
  };
}

vi.mock("@/lib/store/app-store", () => ({
  useAppStore: () => useFakeStore(),
  useOptionalAppStore: () => useFakeStore(),
}));

const proposal = (proposalId: string, templateKey: string, templateName: string, employeeName: string): ChatFormProposal => ({
  proposalId,
  templateKey,
  templateName,
  supportsInlineDraft: true,
  variantKey: null,
  employeeRole: null,
  employeeName,
  locationId: "loc-66",
  locationName: null,
  locationResolution: "resolved",
  authorizedLocationIds: [],
  status: "ready",
  sourceMessageIds: [],
});

const asks: ClientAskRequest[] = [];

vi.mock("@/lib/ai", () => ({
  getAIProvider: () => ({
    name: "fake",
    connected: true,
    titleForConversation: (first: string) => first.slice(0, 20),
    async ask(request: ClientAskRequest) {
      asks.push(request);
      return asks.length === 1
        ? {
            content: "Here are both forms.",
            citations: [],
            coverage: "not_applicable" as const,
            formProposals: [
              proposal("prop-a", "coaching", "Coaching Form", "Avery Testperson"),
              proposal("prop-b", "dpoa", "Corrective Action Form", "Jordan Testperson"),
            ],
          }
        : { content: "Which form?", citations: [], coverage: "not_applicable" as const };
    },
  }),
}));

beforeEach(() => {
  conversations = [];
  asks.length = 0;
});

afterEach(cleanup);

/** Both cards created, as pressing Create on each does. */
function createBothCards() {
  conversations = conversations.map((conversation) => ({
    ...conversation,
    messages: conversation.messages.map((message) =>
      message.role === "assistant" && message.formProposals
        ? {
            ...message,
            formInstanceRefs: [
              { instanceId: "inst-a", proposalId: "prop-a", templateName: "Coaching Form" },
              { instanceId: "inst-b", proposalId: "prop-b", templateName: "Corrective Action Form" },
            ],
          }
        : message,
    ),
  }));
  notify?.();
}

describe("a correction after a two-form message, asked inline", () => {
  it("sends both forms' ids so the server can ask which one", async () => {
    const { result } = renderHook(() => useInlineAsk({ surface: "overview" }));

    await act(async () => {
      await result.current.send("coaching for Avery Testperson and a CA for Jordan Testperson");
    });
    await waitFor(() => expect(conversations[0]?.messages.some((message) => message.formProposals)).toBe(true));
    act(() => createBothCards());

    await act(async () => {
      await result.current.send("change the date to yesterday");
    });

    expect(asks).toHaveLength(2);
    expect(asks[1]!.activeFormInstanceId).toBeUndefined();
    expect(asks[1]!.activeFormCandidateIds).toEqual(["inst-a", "inst-b"]);
  });

  it("sends no candidates when the correction names whose form", async () => {
    const { result } = renderHook(() => useInlineAsk({ surface: "overview" }));

    await act(async () => {
      await result.current.send("coaching for Avery Testperson and a CA for Jordan Testperson");
    });
    await waitFor(() => expect(conversations[0]?.messages.some((message) => message.formProposals)).toBe(true));
    act(() => createBothCards());

    await act(async () => {
      await result.current.send("change Avery's date to yesterday");
    });

    expect(asks[1]!.activeFormInstanceId).toBe("inst-a");
    expect(asks[1]!.activeFormCandidateIds).toBeUndefined();
  });
});
