import { afterEach, describe, expect, it, vi } from "vitest";

import { createMigratedTestDatabase } from "@/test/pglite-knowledge-db";

/**
 * chat_traces.raw_answer is the answer call's text before any citation check
 * or marker stripping. chat_messages only keeps the processed text, so a
 * citation bug could not be replayed from what the model wrote.
 *
 * CHAT_TRACE_RAW_ANSWER_ENABLED defaults off. Off, the insert does not name
 * raw_answer, so a database without the column still takes the row.
 */

const state = vi.hoisted(() => ({
  answer: "",
  inserts: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/supabase/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/server")>();
  return {
    ...actual,
    getSupabaseAdmin: () => ({
      from(table: string) {
        if (table !== "chat_traces") return actual.getSupabaseAdmin().from(table);
        return {
          insert: async (row: Record<string, unknown>) => {
            state.inserts.push(row);
            return { error: null };
          },
        };
      },
    }),
  };
});
vi.mock("@/lib/config/server-env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server-env")>()),
  liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }),
}));
vi.mock("./form-proposal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./form-proposal")>()),
  proposeFormForTurn: async () => null,
  suggestFormsForTurn: () => null,
}));
vi.mock("@/lib/forms/repository", () => ({ listTemplateSummaries: async () => [] }));
vi.mock("@/lib/ai/entity-facts", () => ({ resolveChatEntities: async () => ({ block: null, direct: null }) }));
vi.mock("@/lib/chat/person-memory-store", () => ({ recallPeople: async () => null }));
vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    readonly name = "test double";
    async match() {
      return [
        {
          chunk_id: "guide-3",
          document_id: "guide",
          document_title: "Store Opening Guide",
          category: "operations",
          locator: "Page 3",
          page: 3,
          section: "Opening",
          content: "Unlock the front door at 9 and set out the samples.",
          similarity: 0.91,
        },
      ];
    }
    async fetchRoleGrounding() {
      return null;
    }
    async fetchNamedHandbook() {
      return { ok: false, reason: "none" };
    }
    async fetchOfficialPolicyManual() {
      return { ok: false, reason: "none" };
    }
  },
}));
vi.mock("./call-claude", () => ({
  callClaude: async () => state.answer,
}));

// Imported once up front: a cold import of server-ask takes longer than one test's timeout.
const { answerQuestion } = await import("./server-ask");

const RAW = "Unlock the front door at 9 [S1] and set out the samples [S7].";

afterEach(() => {
  delete process.env.CHAT_TRACE_ENABLED;
  delete process.env.CHAT_TRACE_RAW_ANSWER_ENABLED;
  state.inserts.length = 0;
  state.answer = "";
});

async function ask(): Promise<string> {
  const response = await answerQuestion(
    {
      question: "How do I open the store in the morning?",
      mode: "standard",
      history: [],
      scopeId: "bcs-core",
      context: { userName: "Dana Reyes", locationName: "Synthetic Store", todayIso: "2026-10-24" },
    } as never,
    { role: "location_manager" as never, scope: { level: "location", primaryAreaId: "loc-0101", alsoCoversAreaIds: [] } as never },
  );
  await vi.waitFor(() => {
    if (process.env.CHAT_TRACE_ENABLED) expect(state.inserts).toHaveLength(1);
  });
  return response.content;
}

describe("chat_traces.raw_answer", () => {
  it("is not in the insert when CHAT_TRACE_RAW_ANSWER_ENABLED is off", async () => {
    process.env.CHAT_TRACE_ENABLED = "1";
    state.answer = RAW;
    await ask();
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).not.toHaveProperty("raw_answer");
  });

  it("holds the model's text before markers are stripped from the displayed answer", async () => {
    process.env.CHAT_TRACE_ENABLED = "1";
    process.env.CHAT_TRACE_RAW_ANSWER_ENABLED = "1";
    state.answer = RAW;
    const shown = await ask();
    expect(shown).not.toContain("[S1]");
    expect(shown).not.toBe(RAW);
    expect(state.inserts[0]?.raw_answer).toBe(RAW);
  });

  it("keeps the first 20,000 characters", async () => {
    process.env.CHAT_TRACE_ENABLED = "1";
    process.env.CHAT_TRACE_RAW_ANSWER_ENABLED = "1";
    state.answer = `${"a".repeat(19_990)} [S1] ${"b".repeat(100)}`;
    await ask();
    expect(state.inserts[0]?.raw_answer).toBe(state.answer.slice(0, 20_000));
  });

  it("writes nothing when CHAT_TRACE_ENABLED is off", async () => {
    process.env.CHAT_TRACE_RAW_ANSWER_ENABLED = "1";
    state.answer = RAW;
    await ask();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(state.inserts).toHaveLength(0);
  });
});

describe("20261024200000_chat_traces_raw_answer.sql", () => {
  it("appends a nullable raw_answer and chat_traces_live shows it", async () => {
    const harness = await createMigratedTestDatabase(
      [
        "20261023001100_chat_traces",
        "20261024120000_chat_traces_cache_tokens",
        "20261024140000_chat_traces_form_extraction",
        "20261024200000_chat_traces_raw_answer",
      ],
      { platform: "create extension if not exists pgcrypto with schema extensions;" },
    );
    try {
      const columns = async (table: string) =>
        (
          await harness.db.query<{ column_name: string; is_nullable: string; data_type: string }>(
            `select column_name, is_nullable, data_type from information_schema.columns
              where table_schema = 'public' and table_name = $1
              order by ordinal_position`,
            [table],
          )
        ).rows;
      const table = await columns("chat_traces");
      expect(table.at(-1)).toEqual({ column_name: "raw_answer", is_nullable: "YES", data_type: "text" });
      expect(table.at(-2)?.column_name).toBe("slots");
      const view = (await columns("chat_traces_live")).map((row) => row.column_name);
      expect(view).toEqual(table.map((row) => row.column_name));

      const options = await harness.db.query<{ reloptions: string[] | null }>(
        `select c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = 'chat_traces_live'`,
      );
      expect(options.rows[0]?.reloptions).toContain("security_invoker=true");

      // Safe to apply again, and a writer that does not name the column still inserts.
      const { readFileSync } = await import("node:fs");
      await harness.db.exec(readFileSync("supabase/migrations/20261024200000_chat_traces_raw_answer.sql", "utf8"));
      await harness.db.exec("insert into public.chat_traces (original_query) values ('what is the dress code')");
      const rows = await harness.db.query<{ raw_answer: string | null }>("select raw_answer from public.chat_traces_live");
      expect(rows.rows).toEqual([{ raw_answer: null }]);
    } finally {
      await harness.close();
    }
    // Starting PGlite with its extensions takes several seconds on its own.
  }, 30_000);
});
