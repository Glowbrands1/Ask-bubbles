import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * FEWSHOT_TURN_JOIN_ENABLED (QA, 10 Nov 2026): a 5-star rating is found through its turn, not a trace message id.
 * The rows are invented; the stub answers each query from these tables.
 */
const TABLES: Record<string, Record<string, unknown>[]> = {
  assistant_feedback: [
    { rating: 5, comment: "spot on", activity_event_id: "turn-a", client_message_id: "client-a", hidden_at: null },
    { rating: 3, comment: null, activity_event_id: "turn-b", client_message_id: "client-b", hidden_at: null },
  ],
  chat_messages: [
    { conversation_id: "c1", position: 0, role: "user", turn_id: null, content: "what is the attendance policy" },
    { conversation_id: "c1", position: 1, role: "assistant", turn_id: "turn-a", content: "ANSWER TEXT" },
    { conversation_id: "c1", position: 2, role: "user", turn_id: null, content: "later question" },
  ],
  chat_traces: [{ message_id: "some-other-id", original_query: "unrelated" }],
};

function query(table: string) {
  let rows = [...(TABLES[table] ?? [])];
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => ((rows = rows.filter((row) => row[column] === value)), builder),
    is: (column: string, value: unknown) => ((rows = rows.filter((row) => row[column] === value)), builder),
    in: (column: string, values: unknown[]) => ((rows = rows.filter((row) => values.includes(row[column]))), builder),
    limit: () => builder,
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
  };
  return builder;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => ({ from: query }) }));

afterEach(() => vi.unstubAllEnvs());

describe("FEWSHOT_TURN_JOIN_ENABLED", () => {
  it("on: the 5-star answer's turn gives the question asked before it", async () => {
    vi.stubEnv("FEWSHOT_EXAMPLES_ENABLED", "true");
    vi.stubEnv("FEWSHOT_TURN_JOIN_ENABLED", "true");
    const { loadFewShotBlock } = await import("./feedback-examples");
    const block = await loadFewShotBlock("what is the attendance policy");
    expect(block).toContain("Manager: what is the attendance policy");
    // QA (10 Nov 2026): the rated answer is the example's output, as the sibling app shows it.
    expect(block).toContain("Assistant: ANSWER TEXT");
    expect(block ?? "").not.toContain("later question");
  });

  it("off: the old trace join finds nothing (as production today)", async () => {
    vi.stubEnv("FEWSHOT_EXAMPLES_ENABLED", "true");
    vi.stubEnv("FEWSHOT_TURN_JOIN_ENABLED", "false");
    const { loadFewShotBlock } = await import("./feedback-examples");
    const block = await loadFewShotBlock("what is the attendance policy");
    expect(block ?? "").not.toContain("what is the attendance policy");
  });

  it("FEWSHOT_EXAMPLES off: nothing is read", async () => {
    vi.stubEnv("FEWSHOT_EXAMPLES_ENABLED", "false");
    vi.stubEnv("FEWSHOT_TURN_JOIN_ENABLED", "true");
    const { loadFewShotBlock } = await import("./feedback-examples");
    expect(await loadFewShotBlock("what is the attendance policy")).toBeNull();
  });
});
