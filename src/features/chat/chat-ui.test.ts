import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { __setAnthropicClient } from "@/lib/ai/anthropic";
import { callClaude } from "@/lib/ai/call-claude";
import { CHAT_UI_FLAG_NAMES, chatStreamingEnabled, citationChipsEnabled } from "@/lib/config/chat-ui-flags";

import { askChatStream, encodeSse, parseSseBlock } from "./chat-stream";
import { citationChipLabel } from "./citation-chips";
import { quickReplyLabels } from "./quick-replies";
import type { ChatFormProposal } from "@/types";

const FLAGS = [...CHAT_UI_FLAG_NAMES];

function proposal(overrides: Partial<ChatFormProposal> = {}): ChatFormProposal {
  return {
    proposalId: "p1",
    templateKey: "dpoa",
    templateName: "Corrective Action",
    supportsInlineDraft: true,
    variantKey: null,
    employeeName: "Test Employee",
    employeeRole: null,
    locationId: null,
    locationName: null,
    locationResolution: "needs_selection",
    authorizedLocationIds: [],
    status: "needs_location",
    sourceMessageIds: [],
    employeeVerification: { status: "unverified", title: null, reason: "not_found" },
    ...overrides,
  };
}

afterEach(() => {
  for (const name of FLAGS) delete process.env[name];
  __setAnthropicClient(null);
});

describe("chat UI flags default off", () => {
  it("is off until set, and each name is the public one", () => {
    expect(chatStreamingEnabled()).toBe(false);
    expect(citationChipsEnabled()).toBe(false);
    expect(CHAT_UI_FLAG_NAMES).toEqual([
      "NEXT_PUBLIC_CHAT_STREAMING_ENABLED",
      "NEXT_PUBLIC_FIELD_CHECKLIST_ENABLED",
      "NEXT_PUBLIC_INLINE_CARD_EDIT_ENABLED",
      "NEXT_PUBLIC_CITATION_CHIPS_ENABLED",
      "NEXT_PUBLIC_QUICK_REPLIES_ENABLED",
      "NEXT_PUBLIC_RESUME_DRAFT_ENABLED",
      "NEXT_PUBLIC_CHAT_A11Y_ENABLED",
    ]);
  });

  it("keeps the JSON return on the chat route", () => {
    const route = readFileSync("src/app/api/chat/route.ts", "utf8");
    expect(route).toContain('request.headers.get("x-chat-stream") !== "1"');
    expect(route).toContain("return NextResponse.json({ ...answer, turnId })");
    expect(route).toContain("return chatPost(request)");
  });
});

describe("streaming", () => {
  it("round-trips a delta and a finished answer", async () => {
    const body = `${encodeSse("delta", { text: "Still needed" })}${encodeSse("done", { content: "Done", citations: [] })}`;
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { headers: { "content-type": "text/event-stream" } })),
    );
    const answer = await askChatStream(
      { question: "q", mode: "standard", history: [], context: {} } as never,
      (text) => seen.push(text),
    );
    expect(seen).toEqual(["Still needed"]);
    expect(answer.content).toBe("Done");
    expect(parseSseBlock(encodeSse("delta", { text: "Hi" }).trim())).toEqual({
      event: "delta",
      data: { text: "Hi" },
    });
    vi.unstubAllGlobals();
  });

  it("uses messages.stream only when the flag and a delta callback are both set", async () => {
    process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim() || "test-key";
    const created = vi.fn(async () => ({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Created" }],
      usage: {},
    }));
    const streamed = vi.fn(() => ({
      on(event: string, listener: (delta: string, snapshot: string) => void) {
        if (event === "text") listener("", "Streamed");
        return this;
      },
      finalMessage: async () => ({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Streamed" }],
        usage: {},
      }),
    }));
    __setAnthropicClient({ messages: { create: created, stream: streamed } } as never);
    const input = { system: "s", grounding: "g", history: [], question: "q", maxTokens: 32, onDelta: () => {} };
    await callClaude(input);
    expect(streamed).not.toHaveBeenCalled();
    expect(created).toHaveBeenCalled();
    process.env.NEXT_PUBLIC_CHAT_STREAMING_ENABLED = "1";
    const seen: string[] = [];
    const text = await callClaude({ ...input, onDelta: (snapshot) => seen.push(snapshot) });
    expect(text).toBe("Streamed");
    expect(seen).toEqual(["Streamed"]);
    expect(streamed).toHaveBeenCalledTimes(1);
  });
});

describe("chips and quick replies", () => {
  it("names the section and the page", () => {
    expect(
      citationChipLabel({
        documentId: "doc-1",
        documentTitle: "JBA Policy Manual",
        locator: "Standards of Conduct, page 12",
        category: "policies_compliance",
        excerpt: "Standards of Conduct",
        relevance: 1,
      }),
    ).toBe("Standards of Conduct · p. 12");
  });

  it("offers warning and payroll answers, and skips them once the card has them", () => {
    expect(quickReplyLabels(proposal())).toEqual([
      "Verbal warning",
      "Written warning",
      "Payroll deduct: yes",
      "Payroll deduct: no",
    ]);
    expect(quickReplyLabels(proposal({ warningLevel: "verbal", payrollDeduct: "no" }))).toEqual([]);
    expect(quickReplyLabels(proposal({ templateKey: "coaching", templateName: "Coaching" }))).toEqual([]);
  });
});
