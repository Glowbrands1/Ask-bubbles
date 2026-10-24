// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { groundFormSlots, type FormRemapSlots } from "@/lib/ai/form-full-remap";
import { COACHING_FORM_TURNS, LEAKED_STORE_TURNS, VERBAL_TURNS } from "@/lib/ai/form-remap-live-fixtures";
import { keepThisConversation } from "@/lib/ai/form-remap-scope";
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

function proposed(over: Record<string, unknown>) {
  return {
    templateKey: "coaching",
    employeeName: null,
    observation: null,
    actionPlan: null,
    ...over,
  };
}

function replay(turns: readonly string[], over: Record<string, unknown>) {
  let history: { role: string; content: string }[] = [];
  let saved: FormRemapSlots | null = null;
  let last: ReturnType<typeof groundFormSlots> | null = null;
  for (const question of turns) {
    last = groundFormSlots({ raw: proposed(over), history, question, today: TODAY, people: [], saved });
    history = [...history, { role: "user", content: question }];
    saved = last.slots;
  }
  if (!last?.response.formProposal) throw new Error("expected a card");
  return last.response.formProposal;
}

function cardText(proposal: NonNullable<ReturnType<typeof replay>>): string {
  const message: ChatMessage = {
    id: "m1",
    role: "assistant",
    content: "Draft",
    createdAt: "2026-10-24T15:06:00Z",
    mode: "standard",
    coverage: "not_applicable",
    citations: [],
    formProposal: proposal,
  };
  render(<MessageBubble message={message} onSuggestion={() => {}} />);
  return document.querySelector("dl")?.textContent ?? "";
}

describe("live form cards", () => {
  it("conv_mvmj6v1t250hfij renders the corrective action fields, including verbal and 9/01", () => {
    const shown = cardText(replay(VERBAL_TURNS, { templateKey: "coaching" }));
    expect(screen.getByText("Corrective Action Form")).toBeTruthy();
    expect(screen.queryByText("Coaching Form")).toBeNull();
    expect(shown).toContain("2026-10-11");
    expect(shown).not.toContain("2026-09-01");
    expect(shown).toContain("Verbal Warning");
    expect(shown).toContain("prior = manual ack 9/01");
    expect(shown).toContain("coached on 2nd");
    expect(shown).toContain("No");
    expect(shown).toContain("cell phone 30+ min");
    expect(shown).toContain("10-20");
    expect(shown).toContain("Grand Island");
  });

  it("conv_mvmj7ifs9oosat5 renders the Coaching Form the user asked for", () => {
    const shown = cardText(replay(COACHING_FORM_TURNS, { templateKey: "dpoa", warningLevel: "verbal" }));
    expect(COACHING_FORM_TURNS).toEqual(["Create a Coaching Form"]);
    expect(screen.getByText("Coaching Form")).toBeTruthy();
    expect(screen.queryByText("Corrective Action Form")).toBeNull();
    expect(shown).not.toContain("Verbal Warning");
    expect(shown).not.toContain("prior = manual ack 9/01");
    expect(shown).not.toContain("2026-09-01");
  });

  it("conv_mvmj8a26gtq901w renders no Kearney or Bellevue from another conversation", () => {
    const history = keepThisConversation(LEAKED_STORE_TURNS, new Set(LEAKED_STORE_TURNS.map((turn) => turn.id)));
    const { response } = groundFormSlots({
      raw: proposed({ templateKey: "dpoa", store: "Kearney" }),
      history,
      question: "corrective action",
      today: TODAY,
      people: [],
    });
    const shown = cardText(response.formProposal!);
    expect(shown).not.toMatch(/Kearney|Bellevue/);
    expect(screen.queryByText(/Kearney|Bellevue/)).toBeNull();
  });
});
