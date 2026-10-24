// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { groundFormSlots } from "@/lib/ai/form-full-remap";
import type { ChatMessage } from "@/types";

import { MessageBubble } from "./message-bubble";

vi.mock("@/lib/session/session-context", () => ({
  useSession: () => ({ user: { avatarInitials: "PC" }, isAdmin: false }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  cleanup();
});

const TODAY = "2026-10-24";

/**
 * conv_mvmj7ifs9oosat5. The card has to show the template fields, not only
 * Employee, Position and Store. The phrases are the ones from that live
 * failure. The production service key was not available here, so the chat
 * row itself could not be copied out of chat_messages.
 */
const QUESTION = [
  "verbal",
  "prior = manual ack 9/01",
  "coached on 2nd",
  "no payroll",
  "cell phone 30+ min",
  "10-20",
  "Grand Island",
].join("\n");

describe("conv_mvmj7ifs9oosat5 card", () => {
  it("renders the corrective action fields the manager stated", () => {
    const { response } = groundFormSlots({
      raw: {
        templateKey: "coaching",
        employeeName: null,
        observation: null,
        actionPlan: null,
      },
      history: [],
      question: QUESTION,
      today: TODAY,
      people: [],
    });
    const proposal = response.formProposal!;
    const message: ChatMessage = {
      id: "m1",
      role: "assistant",
      content: response.content,
      createdAt: "2026-10-24T15:06:00Z",
      mode: "standard",
      coverage: "not_applicable",
      citations: [],
      formProposal: proposal,
    };
    render(<MessageBubble message={message} onSuggestion={() => {}} />);

    const card = document.querySelector("dl");
    expect(card).toBeTruthy();
    const shown = card!.textContent ?? "";
    expect(screen.getByText("Corrective Action Form")).toBeTruthy();
    expect(screen.queryByText("Coaching Form")).toBeNull();
    expect(shown).toContain("Verbal Warning");
    expect(shown).toContain("prior = manual ack 9/01");
    expect(shown).toContain("coached on 2nd");
    expect(shown).toContain("No");
    expect(shown).toContain("cell phone 30+ min");
    expect(shown).toContain("10-20");
    expect(shown).toContain("Grand Island");
    expect(shown).not.toContain("2026-09-01");
    expect(screen.queryByText("2026-09-01")).toBeNull();
  });
});
