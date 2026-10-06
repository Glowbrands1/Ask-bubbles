import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ============================================================================
 * BUFF CITY SOAP WOVEN CONTENT → ASK BUBBLES CHAT, END TO END
 * ============================================================================
 *
 * FIXTURE QA, NOT LIVE QA. The fake Woven serves sanitized shapes from the
 * verified handoff for TWO companies (Buff City Soap / Midwest Soap Makers,
 * and JB & Associates / Sun Tan City), plus a third for this test. Everything
 * from the HTTP client down is production code:
 *
 *   fake Woven → BCS connector + company guard → sync engine + reconciliation
 *   → Supabase sync store + knowledge sink → ingestion → knowledge tables
 *   (the repository's migrations on PGlite) → match_knowledge_chunks
 *   → answerQuestion (the /api/chat answer path)
 *
 * Only the model call and the embedder are replaced: the model records what
 * it was sent and cites every source it was given, so "never retrieved" is
 * checked on what actually reached the model.
 */

vi.setConfig({ hookTimeout: 120_000, testTimeout: 120_000 });

vi.mock("@/lib/config/server-env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server-env")>()),
  liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }),
}));
vi.mock("@/lib/config/models", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config/models")>();
  /* The lexical test embedder scores below the production floor; lowered for this test only. */
  return { ...actual, RETRIEVAL: { ...actual.RETRIEVAL, minSimilarity: 0.3 } };
});
const model = vi.hoisted(() => ({ input: null as Record<string, unknown> | null }));
/** What the model was last sent; read through a function so the reset in `ask` does not narrow it. */
const sent = (): Record<string, unknown> | null => model.input;
vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async (input: Record<string, unknown>) => {
    model.input = input;
    const markers = [...String(input.grounding ?? "").matchAll(/^\[S(\d+)\]/gm)].map((m) => `[S${m[1]}]`);
    return markers.length ? `Here is what the procedure says ${markers.join("")}. Also [S9].` : "The knowledge base does not have that.";
  },
}));
vi.mock("@/lib/forms/repository", () => ({ listTemplateSummaries: async () => [] }));

const { EMBEDDING_DIMENSIONS } = await import("@/lib/config/models");
const { __setEmbeddingProvider } = await import("@/lib/embeddings");
const { __setSupabaseAdmin } = await import("@/lib/supabase/server");
const { bagOfWordsEmbedding, createKnowledgeTestDatabase } = await import("@/test/pglite-knowledge-db");
const { audienceKey } = await import("../../access");
const { createSupabaseKnowledgeSink } = await import("../../sink");
const { createSupabaseKnowledgeSyncStore } = await import("../../store");
const { WovenTeamClient } = await import("../http");
const { createWovenKnowledgeConnector, runWovenKnowledgeSync } = await import("../sync");
const support = await import("./test-support");
const { BCS_COMPANY_ID, JBA_COMPANY_ID, UNKNOWN_COMPANY_ID, FakeBcsWoven, PASSWORD, USERNAME, bcsId, noSleep } = support;
const { activeKnowledgeCorpus } = await import("@/lib/knowledge/corpus");
const { answerQuestion } = await import("@/lib/ai/server-ask");

/** The fake's third Woven company, which the same login can open. Nothing of it may ever arrive. */
const OTHER_ID = UNKNOWN_COMPANY_ID;

type Database = Awaited<ReturnType<typeof createKnowledgeTestDatabase>>;

class Harness {
  readonly fake = new FakeBcsWoven();
  clock = new Date("2026-10-06T12:00:00Z");
  private constructor(readonly database: Database, readonly store: ReturnType<typeof createSupabaseKnowledgeSyncStore>) {
    this.fake.content[OTHER_ID] = {
      policies: [],
      handbooks: [],
      procedures: [{ id: bcsId(8301), title: "Other Company Opening", categories: ["General Operations"], badges: [], positions: "All Positions", steps: [{ id: bcsId(83011), text: "Other company opening steps." }] }],
      fileLibrary: [],
      communications: [],
    };
  }

  static async create(): Promise<Harness> {
    const database = await createKnowledgeTestDatabase();
    __setSupabaseAdmin(database.client);
    __setEmbeddingProvider({
      name: "bag of words (test)",
      model: "bag-of-words-test",
      dimensions: EMBEDDING_DIMENSIONS,
      configured: true,
      embedDocuments: async (texts: string[]) => texts.map((text) => bagOfWordsEmbedding(text, EMBEDDING_DIMENSIONS)),
      embedQuery: async (text: string) => bagOfWordsEmbedding(text, EMBEDDING_DIMENSIONS),
    } as never);
    return new Harness(database, createSupabaseKnowledgeSyncStore(database.client));
  }

  async close() {
    __setSupabaseAdmin(null);
    __setEmbeddingProvider(null);
    await this.database.close();
  }

  get bcs() {
    return this.fake.content[BCS_COMPANY_ID]!;
  }

  procedure(title: string) {
    const found = this.bcs.procedures.find((p) => p.title === title);
    if (!found) throw new Error(`no fixture procedure ${title}`);
    return found;
  }

  async run(mode: "preview" | "sync") {
    const config = {
      enabled: true,
      baseUrl: "https://app.woven.team",
      tenantProblem: null,
      downloads: { fileLibrary: false },
      credentials: { username: USERNAME, password: PASSWORD },
      missingCredentials: [],
      problems: [],
      previewTestModeAllowed: false,
    };
    const client = new WovenTeamClient({ baseUrl: config.baseUrl, fetch: this.fake.fetch, sleep: noSleep, transport: { minIntervalMs: 0, baseBackoffMs: 0 } });
    const outcome = await runWovenKnowledgeSync(
      { mode, trigger: "manual", requestedBy: "admin:test" },
      { config, store: this.store, sink: createSupabaseKnowledgeSink("woven"), connector: createWovenKnowledgeConnector(config, client), now: () => this.clock },
    );
    this.clock = new Date(this.clock.getTime() + 86_400_000);
    return outcome;
  }

  async initial() {
    expect((await this.run("preview")).status).toBe("succeeded");
    await this.store.saveDecision({ source: "woven", audienceKey: audienceKey(["All Positions"]), decision: "company_wide", decidedBy: "admin:test", decidedAt: this.clock.toISOString() });
    const outcome = await this.run("sync");
    expect(outcome.status).toMatch(/^succeeded/);
    return outcome;
  }

  async indexedTitles(): Promise<string[]> {
    const { rows } = await this.database.db.query<{ title: string }>(
      "select title from public.knowledge_documents where status = 'indexed' and indexed order by title",
    );
    return rows.map((row) => row.title);
  }

  async allChunkText(): Promise<string> {
    const { rows } = await this.database.db.query<{ content: string }>("select content from public.knowledge_chunks");
    return rows.map((row) => row.content).join("\n");
  }
}

type Turn = { role: "user" | "assistant"; content: string };

async function ask(question: string, history: Turn[] = []) {
  model.input = null;
  const response = await answerQuestion(
    {
      question,
      mode: "standard",
      history: history.map((turn, index) => ({ id: `h${index}`, createdAt: "2026-10-06T12:00:00Z", ...turn })),
      scopeId: activeKnowledgeCorpus(),
      context: { userName: "Dana Reyes", locationName: "Example Location 101", todayIso: "2026-10-06" },
    } as never,
    { role: "location_manager", scope: { level: "location", primaryAreaId: "loc-0101", alsoCoversAreaIds: [] } } as never,
  );
  const grounding = String(sent()?.grounding ?? "");
  return {
    response,
    grounding,
    grounded: [...grounding.matchAll(/^\[S\d+\] (.+?)(?: — .*)?$/gm)].map((m) => m[1]!),
    cited: response.citations.map((c) => c.documentTitle),
  };
}

let h: Harness;
beforeEach(async () => {
  h = await Harness.create();
});
afterEach(async () => {
  await h.close();
});

const OPENING = "How do I open the Makery? Unlock the front door and disarm the alarm?";

describe("knowledge through chat", () => {
  it("a named procedure is grounded and cited by its Woven title; an invalid marker never becomes a card", async () => {
    await h.initial();
    const answer = await ask(OPENING);
    expect(answer.cited).toEqual(["Opening the Makery"]);
    expect(answer.response.coverage).toBe("grounded");
    expect(answer.response.content).not.toMatch(/\[S\d+\]/);
    expect(answer.response.citations[0]).toMatchObject({ documentTitle: "Opening the Makery" });
  });

  it("a question two procedures answer cites both", async () => {
    await h.initial();
    const answer = await ask("Opening the Makery and fire extinguisher use: unlock the door, pull the pin?");
    expect(answer.cited).toEqual(expect.arrayContaining(["Opening the Makery", "Fire Extinguisher Use"]));
  });

  it("no supported answer: nothing cited, coverage insufficient", async () => {
    await h.initial();
    const answer = await ask("How many weeks of parental leave do we offer?");
    expect(answer.cited).toEqual([]);
    expect(answer.response.coverage).toBe("insufficient");
  });

  it("'and then what?' after a procedure answer retrieves through the manager's question, never the answer text", async () => {
    await h.initial();
    const answer = await ask("and then what?", [
      { role: "user", content: OPENING },
      { role: "assistant", content: "QUOTED ANSWER TEXT about extinguishers and lye." },
    ]);
    expect(answer.grounded).toContain("Opening the Makery");
  });

  it("an unrelated whole question after a previous topic does not inherit it", async () => {
    await h.initial();
    const answer = await ask("How do I use a fire extinguisher?", [
      { role: "user", content: OPENING },
      { role: "assistant", content: "Unlock the front door." },
    ]);
    expect(answer.grounded).toEqual(["Fire Extinguisher Use"]);
  });
});

describe("only authorised Midwest Soap Makers content is ever answerable", () => {
  it("indexes exactly the published, company-wide procedures — and nothing else", async () => {
    await h.initial();
    expect(await h.indexedTitles()).toEqual(["Fire Extinguisher Use", "Opening the Makery"]);
    const text = await h.allChunkText();
    for (const excluded of [
      "Lye is handled by managers only", // managers-only procedure
      "Draft text.", // drafts
      "Sun Tan City", // the other company
      "Other company opening steps.", // a third company
      "Manual text.", // JBA policy manual
      "Phones stay in the back room", // policy awaiting publication verification
      "Soap loaf cutting", // File Library, downloads disabled
    ]) {
      expect(text, excluded).not.toContain(excluded);
    }
  });

  it.each([
    ["managers-only procedure", "Chemical handling: who handles lye? Managers only?", "Lye is handled by managers only"],
    ["draft procedure", "What is on the closing checklist? Draft text.", "Draft text."],
    ["unpublished File Library item", "Seasonal flyer", "Seasonal Flyer"],
    ["ambiguous-audience File Library item", "Legacy notice", "Legacy Notice"],
    ["JBA document", "What does the JBA Policy Manual say? Manual text.", "Manual text."],
    ["Sun Tan City document", "Tanning bed safety and bed cleaning steps?", "Sun Tan City"],
    ["another company's document", "Other company opening steps?", "Other company opening steps."],
    ["policy awaiting publication verification", "Cell phone policy: phones stay in the back room?", "Phones stay in the back room"],
    ["File Library document while downloads are disabled", "Soap loaf cutting guide: wire cutter at 1 inch?", "wire cutter"],
  ])("%s fails closed", async (_label, question, marker) => {
    await h.initial();
    const answer = await ask(question);
    expect(answer.grounding).not.toContain(marker);
    expect(JSON.stringify(answer.response.citations)).not.toContain(marker);
  });
});

describe("an administrator cannot share a narrow audience", () => {
  it("approving the managers-only audience still never brings it into chat", async () => {
    expect((await h.run("preview")).status).toBe("succeeded");
    for (const audience of [["All Positions"], ["General Manager", "District Manager"], ["General Manager, District Manager"]]) {
      await h.store.saveDecision({ source: "woven", audienceKey: audienceKey(audience), decision: "company_wide", decidedBy: "admin:test", decidedAt: h.clock.toISOString() });
    }
    expect((await h.run("sync")).status).toMatch(/^succeeded/);
    expect(await h.indexedTitles()).not.toContain("Chemical Handling");
    const answer = await ask("Chemical handling: who handles lye? Managers only?");
    expect(answer.grounding).not.toContain("Lye is handled by managers only");
  });
});

describe("the company guard", () => {
  it("a sign-in that lands in JB & Associates reads nothing and ingests nothing — at the scan and at the sync", async () => {
    h.fake.companyForLogin = () => JBA_COMPANY_ID;
    /* The initial scan is the run that signs in and reads; it must stop at the Company page. */
    const scan = await h.run("preview");
    expect(scan.status).not.toMatch(/^succeeded/);
    expect(h.fake.logins).toBeGreaterThan(0);
    expect(h.fake.log.some((r) => r.path === "/Company")).toBe(true);
    expect(h.fake.contentReads()).toEqual([]);
    /* And after a good scan, a sync whose sign-in goes astray reads and writes nothing either. */
    h.fake.companyForLogin = null;
    expect((await h.run("preview")).status).toBe("succeeded");
    h.fake.companyForLogin = () => JBA_COMPANY_ID;
    const readsBefore = h.fake.contentReads().length;
    const sync = await h.run("sync");
    expect(sync.status).not.toMatch(/^succeeded/);
    expect(h.fake.contentReads().filter((r) => r.company !== BCS_COMPANY_ID)).toEqual([]);
    expect(h.fake.contentReads().length).toBe(readsBefore);
    expect(await h.indexedTitles()).toEqual([]);
  });

  it("a sign-in that lands in a third company reads nothing and ingests nothing — at the scan and at the sync", async () => {
    h.fake.companyForLogin = () => OTHER_ID;
    /* The initial scan is the run that signs in and reads; it must stop at the Company page. */
    const scan = await h.run("preview");
    expect(scan.status).not.toMatch(/^succeeded/);
    expect(h.fake.logins).toBeGreaterThan(0);
    expect(h.fake.log.some((r) => r.path === "/Company")).toBe(true);
    expect(h.fake.contentReads()).toEqual([]);
    /* And after a good scan, a sync whose sign-in goes astray reads and writes nothing either. */
    h.fake.companyForLogin = null;
    expect((await h.run("preview")).status).toBe("succeeded");
    h.fake.companyForLogin = () => OTHER_ID;
    const readsBefore = h.fake.contentReads().length;
    const sync = await h.run("sync");
    expect(sync.status).not.toMatch(/^succeeded/);
    expect(h.fake.contentReads().filter((r) => r.company !== BCS_COMPANY_ID)).toEqual([]);
    expect(h.fake.contentReads().length).toBe(readsBefore);
    expect(await h.indexedTitles()).toEqual([]);
  });

  it("a session that switches to JB & Associates mid-run ingests nothing of it, and removes nothing of ours", async () => {
    await h.initial();
    const before = await h.indexedTitles();
    h.fake.switchCompanyAfter = 2;
    const outcome = await h.run("sync");
    expect(outcome.status).not.toBe("succeeded");
    expect(await h.indexedTitles()).toEqual(before);
    expect(await h.allChunkText()).not.toContain("Sun Tan City");
    expect((await ask("Tanning bed safety and bed cleaning steps?")).grounding).not.toContain("Sun Tan City");
  });
});

describe("reconciliation: what leaves Woven leaves chat", () => {
  async function retrievable(question: string, title: string) {
    return (await ask(question)).grounded.includes(title);
  }

  it("unpublished (no longer visible) in Woven: no longer retrievable", async () => {
    await h.initial();
    expect(await retrievable(OPENING, "Opening the Makery")).toBe(true);
    h.procedure("Opening the Makery").badges.push("Unpublished");
    expect((await h.run("sync")).status).toMatch(/^succeeded/);
    expect(await h.indexedTitles()).not.toContain("Opening the Makery");
    expect(await retrievable(OPENING, "Opening the Makery")).toBe(false);
  });

  it("restricted to managers: no longer retrievable", async () => {
    await h.initial();
    h.procedure("Fire Extinguisher Use").positions = "General Manager, District Manager";
    expect((await h.run("sync")).status).toMatch(/^succeeded/);
    expect(await retrievable("How do I use a fire extinguisher?", "Fire Extinguisher Use")).toBe(false);
  });

  it("moved to an unclear audience: no longer retrievable", async () => {
    await h.initial();
    h.procedure("Fire Extinguisher Use").positions = null;
    expect((await h.run("sync")).status).toMatch(/^succeeded/);
    expect(await retrievable("How do I use a fire extinguisher?", "Fire Extinguisher Use")).toBe(false);
  });

  it("deleted from Woven: no longer retrievable", async () => {
    await h.initial();
    const index = h.bcs.procedures.findIndex((p) => p.title === "Fire Extinguisher Use");
    h.bcs.procedures.splice(index, 1);
    expect((await h.run("sync")).status).toMatch(/^succeeded/);
    expect(await retrievable("How do I use a fire extinguisher?", "Fire Extinguisher Use")).toBe(false);
  });

  it("an administrator withdraws the 'All Positions' approval: everything it shared leaves chat", async () => {
    await h.initial();
    expect(await retrievable(OPENING, "Opening the Makery")).toBe(true);
    await h.store.saveDecision({ source: "woven", audienceKey: audienceKey(["All Positions"]), decision: "excluded", decidedBy: "admin:test", decidedAt: h.clock.toISOString() });
    expect((await h.run("sync")).status).toMatch(/^succeeded/);
    expect(await h.indexedTitles()).toEqual([]);
    expect(await retrievable(OPENING, "Opening the Makery")).toBe(false);
  });

  it("a newly shared procedure becomes retrievable after the next sync", async () => {
    await h.initial();
    h.procedure("Chemical Handling").positions = "All Positions";
    expect((await h.run("sync")).status).toMatch(/^succeeded/);
    expect(await retrievable("Chemical handling: who handles lye?", "Chemical Handling")).toBe(true);
  });
});
