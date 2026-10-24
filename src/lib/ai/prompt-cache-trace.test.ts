import { afterEach, describe, expect, it, vi } from "vitest";

import { chatTraceEnabled } from "@/lib/config/chat-quality-flags";

/**
 * chat_traces stores the cache token counts from the Anthropic response.
 * These numbers are not a character count divided by four. The trace is
 * written only when CHAT_TRACE_ENABLED is on, which is the same gate
 * server-ask uses.
 */

const inserts = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      return {
        insert: async (row: Record<string, unknown>) => {
          inserts.rows.push({ table, ...row });
          return { error: null };
        },
      };
    },
  }),
}));

const { finishChatTrace, openChatTrace } = await import("./chat-trace");
const { callClaude } = await import("./call-claude");
const { __setAnthropicClient } = await import("./anthropic");

const CREATION = 222221;
const READ = 333331;
const SYSTEM = "You are Bubbles. Answer from the sources.";

afterEach(() => {
  __setAnthropicClient(null);
  delete process.env.CHAT_TRACE_ENABLED;
  delete process.env.PROMPT_CACHE_ENABLED;
  inserts.rows.length = 0;
});

function installClient(): void {
  __setAnthropicClient({
    messages: {
      create: async () => ({
        stop_reason: "end_turn",
        usage: {
          input_tokens: 11,
          output_tokens: 3,
          cache_creation_input_tokens: CREATION,
          cache_read_input_tokens: READ,
        },
        content: [{ type: "text", text: "Team members wear a clean apron." }],
      }),
    },
  } as never);
}

async function answer(): Promise<string> {
  const run = () =>
    callClaude({
      system: SYSTEM,
      grounding: "COMPANY KNOWLEDGE\n\nNo company documents matched this question.",
      history: [],
      question: "What is the dress code?",
      maxTokens: 64,
    });
  if (!chatTraceEnabled()) return run();
  return finishChatTrace(
    openChatTrace({
      conversationId: "conv-cache",
      messageId: "msg-cache",
      userId: "user-cache",
      originalQuery: "What is the dress code?",
      formInProgress: false,
    }),
    run,
  );
}

describe("chat traces store Anthropic cache usage", () => {
  it("writes usage.cache_creation_input_tokens and usage.cache_read_input_tokens when the flag is on", async () => {
    installClient();
    process.env.CHAT_TRACE_ENABLED = "1";
    expect(await answer()).toBe("Team members wear a clean apron.");
    await new Promise((resolve) => setTimeout(resolve, 30));
    const row = inserts.rows.find((entry) => entry.table === "chat_traces");
    expect(row?.cache_creation_input_tokens).toBe(CREATION);
    expect(row?.cache_read_input_tokens).toBe(READ);
    const estimate = Math.ceil(SYSTEM.length / 4);
    expect(row?.cache_creation_input_tokens).not.toBe(estimate);
    expect(row?.cache_read_input_tokens).not.toBe(estimate);
  });

  it("writes nothing when the flag is off", async () => {
    installClient();
    delete process.env.CHAT_TRACE_ENABLED;
    expect(await answer()).toBe("Team members wear a clean apron.");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(inserts.rows).toHaveLength(0);
  });
});
