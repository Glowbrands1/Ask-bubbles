import { afterEach, describe, expect, it, vi } from "vitest";

const inserted = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], slowMs: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        // A slow database write, so "before the reply returns" is measurable.
        if (inserted.slowMs > 0) await new Promise((resolve) => setTimeout(resolve, inserted.slowMs));
        inserted.rows.push(row);
        return { error: null };
      },
    }),
  }),
}));

import { updateChatTrace, type ChatTraceDraft } from "./chat-trace-store";
import { finishChatTrace, openChatTrace } from "./chat-trace";

/*
 * Ported from the sibling app for the agent loop (plumbing only): ChatTraceDraft carries `firstTokenMs` (the loop's
 * first token; the loop sets no modelCall) and `slots` (merged over the extraction's). Absent, the row is as before.
 */

afterEach(() => {
  inserted.rows = [];
  inserted.slowMs = 0;
});

async function traceOneTurn(update: Partial<ChatTraceDraft>): Promise<Record<string, unknown>> {
  const draft = openChatTrace({ originalQuery: "q", formInProgress: false });
  await finishChatTrace(draft, async () => {
    updateChatTrace(update);
  });
  await vi.waitFor(() => expect(inserted.rows).toHaveLength(1));
  return inserted.rows[0]!;
}

describe("the trace draft's firstTokenMs and slots", () => {
  it("absent: first_token_ms and slots are as before", async () => {
    const row = await traceOneTurn({ formExtraction: { model: "m", inputTokens: 1, outputTokens: 1, slots: { employee: "x" } } });
    expect(row.first_token_ms).toBeNull();
    expect(row.slots).toEqual({ employee: "x" });
  });

  it("set: first_token_ms reads the draft's when no model call has one, and slots merge over the extraction's", async () => {
    const row = await traceOneTurn({
      firstTokenMs: 1234,
      slots: { agent_loop: { steps: 2 } },
      formExtraction: { model: "m", inputTokens: 1, outputTokens: 1, slots: { employee: "x" } },
    });
    expect(row.first_token_ms).toBe(1234);
    expect(row.slots).toEqual({ employee: "x", agent_loop: { steps: 2 } });
  });
});

describe("finishChatTrace's awaitWrite option (ported for the agent loop)", () => {
  it("awaitWrite: the row is written before the reply returns", async () => {
    inserted.slowMs = 20;
    const draft = openChatTrace({ originalQuery: "q", formInProgress: false });
    const value = await finishChatTrace(draft, async () => "reply", { awaitWrite: true });
    expect(value).toBe("reply");
    expect(inserted.rows).toHaveLength(1);
    expect(inserted.rows[0]!.succeeded).toBe(true);
  });

  it("awaitWrite: a failed turn is still written, as failed, and the error still reaches the caller", async () => {
    const draft = openChatTrace({ originalQuery: "q", formInProgress: false });
    await expect(finishChatTrace(draft, async () => Promise.reject(new TypeError("boom")), { awaitWrite: true })).rejects.toThrow("boom");
    await vi.waitFor(() => expect(inserted.rows).toHaveLength(1));
    expect(inserted.rows[0]).toMatchObject({ succeeded: false, error_class: "TypeError" });
  });

  it("without it, as before: the reply returns without waiting for the row", async () => {
    inserted.slowMs = 20;
    const draft = openChatTrace({ originalQuery: "q", formInProgress: false });
    expect(await finishChatTrace(draft, async () => "reply")).toBe("reply");
    expect(inserted.rows).toHaveLength(0);
    await vi.waitFor(() => expect(inserted.rows).toHaveLength(1));
  });
});
