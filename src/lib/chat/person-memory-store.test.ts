import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ============================================================================
 * WHAT IS RECALLED, AND WHAT NEVER IS
 * ============================================================================
 *
 * `recallPeople` against an in-memory double of the four tables it reads. The
 * double applies every filter the module asks for, so a missing `user_id`
 * predicate shows up as another person's words in the block.
 *
 * Ported from the reference platform; names and content are synthetic.
 */

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  fail: false,
  /** Every statement hangs, as a database that never answers would. */
  stall: false,
  queries: 0,
}));

class Query {
  private filters: ((row: Row) => boolean)[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private max = Infinity;
  private single = false;

  constructor(private readonly table: string) {}

  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }
  is(column: string, value: null) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  ilike(column: string, pattern: string) {
    const needle = pattern.replace(/%/g, "").toLowerCase();
    this.filters.push((row) => String(row[column] ?? "").toLowerCase().includes(needle));
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }
  limit(count: number) {
    this.max = count;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  then<T>(resolve: (value: { data: unknown; error: { message: string } | null }) => T) {
    db.queries += 1;
    if (db.stall) return new Promise<T>(() => {});
    if (db.fail) return Promise.resolve(resolve({ data: null, error: { message: "unreachable" } }));
    let rows = (db.tables[this.table] ?? []).filter((row) => this.filters.every((keep) => keep(row)));
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows = [...rows].sort((a, b) =>
        String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1),
      );
    }
    rows = rows.slice(0, this.max);
    return Promise.resolve(resolve({ data: this.single ? (rows[0] ?? null) : rows, error: null }));
  }
}

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({ from: (table: string) => new Query(table) }),
}));

const ME = "11111111-1111-4111-8111-111111111111";
const SOMEONE_ELSE = "22222222-2222-4222-8222-222222222222";

let conversationSeq = 0;

/** One stored conversation, with the manager's turns and one reply each. */
function conversation(input: {
  userId?: string;
  clientId?: string;
  title?: string;
  createdAt?: string;
  deletedAt?: string | null;
  turns: string[];
}) {
  conversationSeq += 1;
  const id = `row-${conversationSeq}`;
  const createdAt = input.createdAt ?? "2026-10-03T15:00:00Z";
  db.tables.chat_conversations!.push({
    id,
    user_id: input.userId ?? ME,
    client_conversation_id: input.clientId ?? `conv_${conversationSeq}`,
    title: input.title ?? input.turns[0],
    created_at: createdAt,
    deleted_at: input.deletedAt ?? null,
    archived_at: null,
  });
  input.turns.forEach((content, index) => {
    const at = new Date(Date.parse(createdAt) + index * 60_000).toISOString();
    db.tables.chat_messages!.push(
      {
        conversation_id: id,
        user_id: input.userId ?? ME,
        client_message_id: `msg_${conversationSeq}_${index}_u`,
        role: "user",
        content,
        created_at: at,
        position: index * 2,
      },
      {
        conversation_id: id,
        user_id: input.userId ?? ME,
        client_message_id: `msg_${conversationSeq}_${index}_a`,
        role: "assistant",
        content: `Bubbles' reply about ${content}`,
        created_at: at,
        position: index * 2 + 1,
      },
    );
  });
  return { id, clientId: input.clientId ?? `conv_${conversationSeq}` };
}

async function recall(question: string, extra: Record<string, unknown> = {}) {
  const { recallPeople } = await import("./person-memory-store");
  return recallPeople({ userId: ME, question, history: [], userName: "Rosalyn", ...extra });
}

beforeEach(() => {
  db.tables = {
    chat_conversations: [],
    chat_messages: [],
    chat_history_boundaries: [],
    form_instances: [],
  };
  db.fail = false;
  db.stall = false;
  db.queries = 0;
});

describe("recallPeople", () => {
  it("recalls what this manager said about the person in an earlier conversation", async () => {
    conversation({ turns: ["Coaching form for Sarah Test", "She was late three times this week"] });

    const block = await recall("What should I do about Sarah Test now?");

    expect(block).toContain("ABOUT SARAH TEST");
    expect(block).toContain("> Coaching form for Sarah Test");
    expect(block).toContain("> She was late three times this week");
  });

  it("quotes the manager, never Bubbles' earlier answers", async () => {
    conversation({ turns: ["Coaching form for Sarah Test"] });
    const block = await recall("How is Sarah Test doing?");
    expect(block).not.toContain("Bubbles' reply");
  });

  it("never reads another person's history", async () => {
    conversation({ userId: SOMEONE_ELSE, turns: ["Coaching form for Sarah Test, she stole"] });
    expect(await recall("What about Sarah Test?")).toBeNull();
  });

  it("forgets a deleted conversation", async () => {
    conversation({ deletedAt: "2026-10-05T00:00:00Z", turns: ["Coaching form for Sarah Test"] });
    expect(await recall("What about Sarah Test?")).toBeNull();
  });

  it("forgets everything created at or before the account's clear", async () => {
    conversation({ createdAt: "2026-10-01T15:00:00Z", turns: ["Coaching form for Sarah Test"] });
    db.tables.chat_history_boundaries!.push({ user_id: ME, history_cleared_at: "2026-10-02T00:00:00Z" });
    expect(await recall("What about Sarah Test?")).toBeNull();
  });

  it("still recalls what was said after the clear", async () => {
    conversation({ createdAt: "2026-10-01T15:00:00Z", turns: ["Coaching form for Sarah Test, cash drawer short"] });
    conversation({ createdAt: "2026-10-04T15:00:00Z", turns: ["Coaching form for Sarah Test, late to open"] });
    db.tables.chat_history_boundaries!.push({ user_id: ME, history_cleared_at: "2026-10-02T00:00:00Z" });

    const block = await recall("What about Sarah Test?");

    expect(block).toContain("late to open");
    expect(block).not.toContain("cash drawer");
  });

  it("leaves the current conversation out, by its id", async () => {
    const current = conversation({ turns: ["Coaching form for Sarah Test"] });
    expect(await recall("What about Sarah Test?", { conversationId: current.clientId })).toBeNull();
  });

  it("leaves the current conversation out, by its turns, when no id was sent", async () => {
    conversation({ turns: ["Coaching form for Sarah Test"] });
    const history = [{ id: `msg_${conversationSeq}_0_u`, role: "user", content: "Coaching form for Sarah Test" }];
    expect(await recall("What now?", { history })).toBeNull();
  });

  it("does not put one Sarah's history on another", async () => {
    conversation({ turns: ["Coaching form for Sarah Miller", "She was short with a guest at the register"] });
    expect(await recall("What about Sarah Test?")).toBeNull();
  });

  it("lists the forms this manager filed about the person, and nobody else's", async () => {
    db.tables.form_instances!.push(
      {
        employee_name: "Sarah Test",
        status: "finalized",
        form_date: "2026-10-03",
        created_by: ME,
        archived_at: null,
        created_at: "2026-10-03T15:00:00Z",
        form_templates: { name: "Coaching Form" },
      },
      {
        employee_name: "Sarah Test",
        status: "finalized",
        form_date: "2026-10-04",
        created_by: SOMEONE_ELSE,
        archived_at: null,
        created_at: "2026-10-04T15:00:00Z",
        form_templates: { name: "Corrective Action" },
      },
    );

    const block = await recall("What about Sarah Test?");

    expect(block).toContain("- Coaching Form for Sarah Test — dated 2026-10-03, finalized");
    expect(block).not.toContain("Corrective Action");
  });

  it("leaves out an archived form and one a later revision replaced", async () => {
    const base = {
      employee_name: "Sarah Test",
      form_date: "2026-10-03",
      created_by: ME,
      created_at: "2026-10-03T15:00:00Z",
    };
    db.tables.form_instances!.push(
      { ...base, status: "finalized", archived_at: "2026-10-05T00:00:00Z", form_templates: { name: "Exit Form" } },
      { ...base, status: "revised", archived_at: null, form_templates: { name: "Performance Review" } },
    );

    expect(await recall("What about Sarah Test?")).toBeNull();
  });

  it("recalls a lone first name only where the earlier conversation named that person", async () => {
    conversation({ turns: ["Coaching form for Sarah", "She was late again"] });
    conversation({ turns: ["Sarah scent bath bombs are selling out"] });

    const block = await recall("Sarah was late again today, what now?");

    expect(block).toContain("> Coaching form for Sarah");
    expect(block).not.toContain("bath bombs");
  });

  it("asks nothing of the database when the question names nobody", async () => {
    expect(await recall("What is the refund policy?")).toBeNull();
    expect(db.queries).toBe(0);
  });

  it("goes ahead without memory when the read outruns its budget", async () => {
    conversation({ turns: ["Coaching form for Sarah Test"] });
    const { RECALL_BUDGET_MS } = await import("./person-memory-store");
    vi.useFakeTimers();
    db.stall = true;
    try {
      const pending = recall("What about Sarah Test?");
      await vi.advanceTimersByTimeAsync(RECALL_BUDGET_MS + 1);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("degrades to no memory when the database fails, rather than failing the answer", async () => {
    conversation({ turns: ["Coaching form for Sarah Test"] });
    db.fail = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(recall("What about Sarah Test?")).resolves.toBeNull();

    // The reason is logged; the manager's words never are.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).not.toContain("Sarah");
    warn.mockRestore();
  });
});

/*
 * ============================================================================
 * CROSS_CHAT_REPLY_GUARD_ENABLED — OTHER CHATS IN THE REPLY TEXT
 * ============================================================================
 *
 * This app's production case, conv_mvmo31du2s97yka: the same manager's other
 * chats about Test Employee (Dodge, NE; Kearney) were recalled into a fresh
 * chat about Grand Island, and the reply said "last time you told me…". And
 * the Ask Sunny turns (a repeated situation; a lone "asdasd") replayed here
 * with invented people. The flag is read by `server-ask.ts`; here it arrives
 * as `crossChatGuard`.
 */
describe("recallPeople with the cross-chat guard", () => {
  const GRAND_ISLAND = "Test Employee at Grand Island out of dress code 3 shifts, coached on 2nd";
  const SITUATION =
    "an employee (Wren)  is talking negatively about co workers and customers. another employee, marlo, complained to the store manager about Wren";
  const ROSTER = [{ id: "e1", firstName: "Wren", lastName: "Calder", locationIds: ["loc-0101"] }];
  const guarded = { crossChatGuard: true, roster: async () => ROSTER };

  it("does not quote the Dodge and Kearney chats into a fresh Grand Island chat (flag off, it did)", async () => {
    conversation({
      createdAt: "2026-10-23T17:21:43Z",
      turns: ["CA for Test Employee at Dodge, NE, register short $40 on 10-20, payroll deduct $40 applies"],
    });
    conversation({ createdAt: "2026-10-23T15:05:51Z", turns: ["CA for Test Employee at Kearney, out of dress code 10/11"] });

    // Production today: both chats are quoted.
    const today = await recall(GRAND_ISLAND);
    expect(today).toContain("Dodge, NE");
    expect(today).toContain("Kearney");

    expect(await recall(GRAND_ISLAND, guarded)).toBeNull();
  });

  it('"asdasd" recalls nothing: a lone keystroke is not a person (flag off, it recalled the earlier chat)', async () => {
    conversation({ createdAt: "2026-08-26T09:09:12Z", turns: ["asdasd"] });

    expect(await recall("asdasd")).toContain("2026-08-26");

    expect(await recall("asdasd", guarded)).toBeNull();
    expect(await recall("asdasd", { crossChatGuard: true })).toBeNull();
  });

  it("a name typed as a whole turn is still recalled when the roster has that person", async () => {
    conversation({ turns: ["Wren Calder was late again last week"] });
    const history = [
      { role: "user", content: "she was late again" },
      { role: "assistant", content: "Who is this about?" },
    ];
    expect(await recall("Wren Calder", { ...guarded, history })).toContain("> Wren Calder was late again last week");
  });

  it("lists a form on file only when the manager refers back, labelled as a record", async () => {
    conversation({ createdAt: "2026-10-23T20:46:08Z", turns: [SITUATION, "create coaching form for wren calder"] });
    db.tables.form_instances!.push({
      employee_name: "Wren Calder",
      status: "draft",
      form_date: "2026-10-23",
      created_by: ME,
      archived_at: null,
      created_at: "2026-10-23T20:50:00Z",
      form_templates: { name: "Coaching Form" },
    });

    // Changed on purpose (QA follow-up, 25 Oct): forms from other
    // conversations stay out too unless the manager refers back. The first
    // version of this guard still listed them.
    expect(await recall(SITUATION, guarded)).toBeNull();

    const block = await recall("what about her earlier CA? Wren Calder", guarded);
    expect(block).toContain("- Coaching Form for Wren Calder — dated 2026-10-23, draft, not finalized");
    expect(block).toContain("records from OTHER conversations");
    expect(block).toContain("a form discussed, requested or proposed in an earlier conversation was not created");
  });

  it("A2: 'Her name is Test Employee' after 'I need to coach an employee' recalls nothing, and asks nothing of the database", async () => {
    conversation({ createdAt: "2026-10-22T15:00:00Z", turns: ["verbal CA for Test Employee, late to open 10-22, no payroll"] });
    conversation({ createdAt: "2026-10-23T15:05:51Z", turns: ["CA for Test Employee at Kearney, out of dress code 10/11"] });
    const history = [
      { role: "user", content: "I need to coach an employee" },
      { role: "assistant", content: "Happy to help you build this out. What did you observe?" },
    ];

    // Production today: both chats are quoted.
    expect(await recall("Her name is Test Employee", { history })).toContain("Kearney");

    db.queries = 0;
    expect(await recall("Her name is Test Employee", { ...guarded, history })).toBeNull();
    expect(db.queries).toBe(0);
  });

  it("A1: another chat from this same day is not quoted, even when the manager refers back (ported same-day skip)", async () => {
    conversation({
      createdAt: "2026-10-24T13:00:00Z",
      turns: ["CA for Test Employee at Grand Island, late to open 10-19, verbal, no payroll"],
    });
    conversation({ createdAt: "2026-10-12T15:05:51Z", turns: ["CA for Test Employee at Kearney, out of dress code 10/11"] });
    const asked = "Test Employee at Grand Island was out of dress code again on 10-18, no name tag and wrong shirt";

    // Production today: the same-day chat is quoted ("You told me earlier today…").
    expect(await recall(asked, { todayIso: "2026-10-24" })).toContain("late to open 10-19");

    const block = await recall(asked, { ...guarded, todayIso: "2026-10-24" });
    expect(block).toContain("CA for Test Employee at Kearney, out of dress code 10/11");
    expect(block).not.toContain("late to open 10-19");
    expect(block).not.toContain("2026-10-24");
  });

  it("quotes the earlier chat when the manager refers back to it", async () => {
    conversation({ createdAt: "2026-10-23T15:05:51Z", turns: ["CA for Test Employee at Kearney, out of dress code 10/11"] });
    const block = await recall("Test Employee is out of dress code again, same as last time", guarded);
    expect(block).toContain("Kearney");
    expect(block).toContain("records from OTHER conversations");
  });
});
