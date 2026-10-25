import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import manual151 from "@/test/fixtures/jba-manual-production-151.json";
import sweep from "@/test/fixtures/bubbles-live-policy-answers-oct25-sweep.json";

/**
 * ============================================================================
 * QA POLICY SWEEP, 25 OCT 2026 — through `answerQuestion`
 * ============================================================================
 *
 * Production (7174fdc, FULL_MANUAL_CONTEXT on) answered "Where should
 * employees park?" and "Are beards allowed?" from retrieval: neither names a
 * policy word, so the manual was not in the prompt. The model cited the
 * manual excerpt [S1]; every [S#] is taken out before the reply is shown, so
 * the manager saw a "Page 18 — Employee Parking" source beside a sentence with
 * no marker. "What is COBRA?" loaded no manual and retrieved no manual
 * excerpt.
 *
 * Here the retrieved row, the stored manual (151 production rows, through
 * the real loader) and the model's words are the live ones. The model's
 * reply is the stored text with the [S1] it cited put back.
 */

const MANUAL_ID = manual151.document_ids["ask-bubbles"];
const MANUAL_TITLE = "2025 JBA Policy Manual - Edited 5-2025";

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  replies: [] as string[],
  calls: [] as { grounding: string; cachedContext?: string }[],
}));

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
      return state.rows;
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

/* The manual tables, as the full-manual loader reads them. */
vi.mock("@/lib/supabase/server", async () => {
  const fixture = (await import("@/test/fixtures/jba-manual-production-151.json")).default;
  const tables: Record<string, unknown[]> = {
    knowledge_documents: [
      {
        id: fixture.document_ids["ask-bubbles"],
        title: "2025 JBA Policy Manual - Edited 5-2025",
        category: "policies_compliance",
        status: "indexed",
        indexed: true,
        version: 1,
      },
    ],
    knowledge_chunks: fixture.chunks,
  };
  const query = (rows: unknown[]) => {
    const result = { data: rows, error: null };
    const builder: Record<string, unknown> = {};
    for (const name of ["select", "eq", "is", "in", "order", "range", "limit", "neq", "gte", "lte", "match"]) {
      builder[name] = () => builder;
    }
    builder.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
    return builder;
  };
  return { getSupabaseAdmin: () => ({ from: (table: string) => query(tables[table] ?? []) }) };
});

vi.mock("./call-claude", () => ({
  callClaude: async (input: { grounding: string; cachedContext?: string }) => {
    state.calls.push({ grounding: input.grounding, cachedContext: input.cachedContext });
    return state.replies.shift() ?? "An answer.";
  },
}));

const ACTOR = {
  role: "location_manager" as never,
  scope: { level: "location", primaryAreaId: "loc-0101", alsoCoversAreaIds: [] } as never,
};

function recorded(conversationId: string) {
  const found = sweep.answers.find((answer) => answer.conversationId === conversationId);
  if (!found) throw new Error(`missing live reply ${conversationId}`);
  return found;
}

/** The stored manual row the turn retrieved, as `match` returns it. */
function manualRow(chunkIndex: number, similarity: number) {
  const chunk = manual151.chunks.find((row) => row.chunk_index === chunkIndex)!;
  return {
    chunk_id: `chunk-${chunkIndex}`,
    document_id: MANUAL_ID,
    document_title: MANUAL_TITLE,
    category: "policies_compliance",
    locator: chunk.locator,
    page: chunk.page,
    section: chunk.section,
    content: chunk.content,
    similarity,
  };
}

const otherRow = {
  chunk_id: "other-1",
  document_id: "doc-other",
  document_title: "Track and Trace User Guide",
  category: "operations",
  locator: "Page 2",
  page: 2,
  section: "TRACK AND TRACE USER GUIDE",
  content: "Scan each batch label before it leaves the makery.",
  similarity: 0.79,
};

async function ask(question: string, conversationId: string) {
  const { answerQuestion } = await import("./server-ask");
  return answerQuestion(
    {
      question,
      mode: "standard",
      history: [],
      scopeId: "bcs-core",
      conversationId,
      context: { userName: "Test Manager", locationName: "All areas", todayIso: "2026-10-25" },
    } as never,
    ACTOR,
  );
}

beforeAll(async () => {
  await import("./server-ask");
}, 60_000);

beforeEach(() => {
  state.rows = [];
  state.replies = [];
  state.calls = [];
  process.env.FULL_MANUAL_CONTEXT_ENABLED = "1";
});

afterEach(() => {
  delete process.env.FULL_MANUAL_CONTEXT_ENABLED;
  delete process.env.FULL_MANUAL_WIDE_GATE_ENABLED;
});

describe("(1) a reply answered from retrieval shows its [p.N] beside its source", () => {
  it('"Where should employees park?" → the sentence carries [p.18], the source is Page 18 — Employee Parking', async () => {
    const live = recorded("conv_mvnq2qk32hw0pah");
    state.rows = [manualRow(55, 0.925)];
    state.replies = [live.content.replace(/\.$/, " [S1].")];
    const response = await ask(live.question, live.conversationId);
    expect(state.calls[0]?.cachedContext).toBeUndefined();
    expect(response.content).toBe(
      "Employees shouldn't park in the spots closest to the front of the location — those are reserved for customers [p.18].",
    );
    expect(response.citations.map((citation) => citation.locator)).toEqual(["Page 18 — Employee Parking"]);
  }, 30_000);

  it('"Are beards allowed?" → [p.16], Facial Hair (the row is "Pages 15–16 — Hair")', async () => {
    const live = recorded("conv_mvnq2i4c2o7tyfj");
    state.rows = [manualRow(46, 0.86)];
    state.replies = [live.content.replace(/\.$/, " [S1].")];
    const response = await ask(live.question, live.conversationId);
    expect(response.content).toBe("Yes — facial hair is acceptable as long as it's clean, well-groomed, and trimmed [p.16].");
    expect(response.citations.map((citation) => citation.locator)).toEqual(["Page 16 — Facial Hair"]);
  }, 30_000);

  it("a source from another document is still shown, with no page marker", async () => {
    state.rows = [otherRow];
    state.replies = ["Scan each batch label before it leaves the makery [S1]."];
    const response = await ask("How do I scan a batch?", "conv_test_other");
    expect(response.content).toBe("Scan each batch label before it leaves the makery.");
    expect(response.citations.map((citation) => citation.documentTitle)).toEqual(["Track and Trace User Guide"]);
  }, 30_000);

  it("with the full manual off, the reply is as before", async () => {
    delete process.env.FULL_MANUAL_CONTEXT_ENABLED;
    const live = recorded("conv_mvnq2qk32hw0pah");
    state.rows = [manualRow(55, 0.925)];
    state.replies = [live.content.replace(/\.$/, " [S1].")];
    const response = await ask(live.question, live.conversationId);
    expect(response.content).toBe(live.content);
    expect(response.citations.map((citation) => citation.locator)).toEqual(["Page 18 — Employee Parking"]);
  }, 30_000);
});

describe("(2) What is COBRA? (FULL_MANUAL_WIDE_GATE_ENABLED)", () => {
  it("off (as live): the manual is not loaded for it", async () => {
    const live = recorded("conv_mvnq5p7s278vzdm");
    state.rows = [otherRow];
    await ask(live.question, live.conversationId);
    expect(state.calls[0]?.cachedContext).toBeUndefined();
  }, 30_000);

  it("on: the question names a heading the manual prints, so p.45 is in the prompt", async () => {
    process.env.FULL_MANUAL_WIDE_GATE_ENABLED = "1";
    const live = recorded("conv_mvnq5p7s278vzdm");
    state.rows = [otherRow];
    state.replies = [
      "COBRA requires continuation coverage to be offered to covered employees, their spouses, their former spouses, and their dependent children when group health coverage would otherwise be lost due to certain specific events [p.45].",
    ];
    const response = await ask(live.question, live.conversationId);
    expect(state.calls[0]?.cachedContext).toMatch(/\[p\.45\][\s\S]*Group Health Plan Continuation Coverage Under COBRA/);
    expect(response.content).toContain("[p.45]");
    expect(response.citations.map((citation) => citation.locator)).toEqual([
      "Page 45 — Group Health Plan Continuation Coverage Under COBRA",
    ]);
  }, 30_000);

  it("on: retrieval's best excerpt from the manual also loads it", async () => {
    process.env.FULL_MANUAL_WIDE_GATE_ENABLED = "1";
    const live = recorded("conv_mvnq2qk32hw0pah");
    state.rows = [manualRow(55, 0.925)];
    state.replies = ["Employees are not allowed to park directly in front of the location [p.18]."];
    const response = await ask(live.question, live.conversationId);
    expect(state.calls[0]?.cachedContext).toContain("Employee Parking");
    expect(response.citations.map((citation) => citation.locator)).toEqual(["Page 18 — Employee Parking"]);
  }, 30_000);
});

/*
 * Sunny sweep E1 (25 Oct 2026): the sibling app read "when does it start?"
 * as a form command and kept the manual out. Here the gate has no
 * form-command check: the same question reads the manual and its reply is
 * cited on p.41.
 */
describe("E1 parity: Who is eligible for PTO and when does it start?", () => {
  it("reads the whole manual, and its reply is cited on printed pages", async () => {
    state.rows = [manualRow(137, 0.889)];
    state.replies = [
      "All salaried managers, full-time corporate office personnel, and full-time Assistant Salon Directors/Assistant Makery Managers begin accruing PTO after 90 days of employment in that position [p.41].",
    ];
    const response = await ask("Who is eligible for PTO and when does it start?", "conv_e1_parity");
    expect(state.calls[0]?.cachedContext).toMatch(/\[p\.41\]/);
    expect(response.content).toContain("[p.41]");
    expect(response.citations.map((citation) => citation.locator)).toEqual(["Page 41 — Eligibility"]);
  }, 30_000);
});
