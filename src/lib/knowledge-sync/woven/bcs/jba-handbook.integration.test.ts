import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import chunkFixture from "@/test/fixtures/jba-manual-brand-chunks.json";
import { pagedPdf } from "@/test/paged-pdf";

/**
 * ============================================================================
 * THE CONFIRMED JBA HANDBOOK, FROM WOVEN TO A CITED POLICY — ISOLATED
 * ============================================================================
 *
 * The owner confirmed one Woven handbook for Buff City Soap ("2025 JBA Policy
 * Manual - Edited 5-2025", `WOVEN_KNOWLEDGE_OWNERSHIP_REVIEW`). This runs the
 * whole path on an in-process Postgres with the repository's own knowledge
 * migrations — never a live database:
 *
 *   fake Woven (Buff City Soap's company) → BCS connector + company guard →
 *   handbook manage page → version download (signed blob link) → sync engine
 *   → knowledge sink → PDF ingestion → official-manual lookup → brand reading
 *   → section lookup → the form's citation
 *
 * THE FILE IS A TEST MANUAL, NOT THE HANDBOOK. Its pages are the JBA manual's
 * own wording, verbatim from `jba-manual-brand-chunks.json` (the dress code
 * with every brand's block, the tanning-only chapter), laid out as sheets with
 * the manual's printed "N | P a g e" footers. The real handbook file is
 * verified separately, read-only, before any release.
 */

vi.setConfig({ hookTimeout: 120_000, testTimeout: 120_000 });

vi.mock("@/lib/config/server-env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server-env")>()),
  liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }),
}));

const { EMBEDDING_DIMENSIONS } = await import("@/lib/config/models");
const { __setEmbeddingProvider } = await import("@/lib/embeddings");
const { __setSupabaseAdmin } = await import("@/lib/supabase/server");
const { bagOfWordsEmbedding, createKnowledgeTestDatabase } = await import("@/test/pglite-knowledge-db");
const { audienceKey } = await import("../../access");
const { createSupabaseKnowledgeSink } = await import("../../sink");
const { createSupabaseKnowledgeSyncStore } = await import("../../store");
const { WovenTeamClient } = await import("../http");
const { createWovenKnowledgeConnector, runWovenKnowledgeSync } = await import("../sync");
const { BCS_COMPANY_ID, FakeBcsWoven, PASSWORD, USERNAME, bcsId, noSleep } = await import("./test-support");
const { WOVEN_KNOWLEDGE_OWNERSHIP_REVIEW } = await import("@/config/company/woven");
const { SupabaseKnowledgeProvider } = await import("@/lib/knowledge/providers/supabase");
const { findManualSection, manualDisplayTitle } = await import("@/lib/forms/official-policy-manual");
const { manualGroundedPolicies, policyFieldValue } = await import("@/lib/forms/policy-citation");

const CONFIRMED_ID = "42486200-20b0-415c-9bad-c4425bc096ce";
const CONFIRMED_TITLE = "2025 JBA Policy Manual - Edited 5-2025";
const VERSION_ID = "da80a2b9-0000-4000-8000-000000000001";
/** Another manual-titled handbook nobody confirmed: it stays held and is never opened. */
const UNCONFIRMED_ID = bcsId(202);

/* ------------------------------------------------- the test manual's sheets -- */

/*
 * The text the reference platform extracted joins a heading onto the line
 * before it ("… employee folder. Client Tanning Policies …"); the sheet prints
 * it on a line of its own, which is why ingestion recorded it as a heading
 * (the chunk's `h`). Each recorded heading is put back on its own line.
 */
const chunk = new Map(
  chunkFixture.chunks.map((entry) => {
    let text = entry.c;
    for (const heading of entry.h) {
      const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      text = text.replace(new RegExp(`([.!?)])[ \\t]+(${escaped})(?=\\n|$)`, "g"), "$1\n$2");
    }
    return [entry.i, text] as const;
  }),
);

/** A chunk's text without the overlap it repeats from the chunk before it. */
function withoutOverlap(previous: string, next: string): string {
  for (let length = Math.min(previous.length, next.length); length >= 20; length -= 1) {
    if (next.startsWith(previous.slice(previous.length - length))) return next.slice(length).replace(/^\s+/, "");
  }
  return next;
}

const lines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "" && !/^\d+ \| P a g e$/.test(line.trim()));

const SHEETS: string[][] = [
  ["2025 JBA Policy Manual", "Edited 5-2025"],
  /*
   * Page 15 opens as the manual does (the reference platform's indexed chunk
   * 44, quoted in `policy-citation.test.ts`), then continues with chunk 35.
   */
  [
    "Dress Code for The Company",
    "The Company Employees are to keep a neat, clean, professional appearance at all times. Anyone",
    ...lines(chunk.get(35)!).slice(1),
    "15 | P a g e",
  ],
  [...lines(chunk.get(36)!), ...lines(withoutOverlap(chunk.get(36)!, chunk.get(37)!)), "16 | P a g e"],
  [...lines(chunk.get(38)!), ...lines(withoutOverlap(chunk.get(38)!, chunk.get(39)!)), "17 | P a g e"],
  [...lines(chunk.get(104)!), ...lines(withoutOverlap(chunk.get(104)!, chunk.get(105)!)), "48 | P a g e"],
  [...lines(chunk.get(108)!), "50 | P a g e"],
];

/* --------------------------------------------------------------- harness -- */

type Database = Awaited<ReturnType<typeof createKnowledgeTestDatabase>>;

class Harness {
  readonly fake = new FakeBcsWoven();
  clock = new Date("2026-10-08T12:00:00Z");
  private constructor(
    readonly database: Database,
    readonly store: ReturnType<typeof createSupabaseKnowledgeSyncStore>,
  ) {
    const bcs = this.fake.content[BCS_COMPANY_ID]!;
    bcs.handbooks = [
      { id: CONFIRMED_ID, name: CONFIRMED_TITLE, statusKey: "2", statusLabel: "Published", audience: "Public", updated: "2026-03-24 20:52:34" },
      { id: UNCONFIRMED_ID, name: "2024 JBA Policy Manual - Edited 10-2024", statusKey: "2", statusLabel: "Published", audience: "Public", updated: "2025-05-01 09:00:00" },
    ];
    this.fake.handbookFiles = {
      // Each line exactly as the manual's text breaks it: no wrapping, small type.
      [CONFIRMED_ID]: { versionId: VERSION_ID, fileName: `${CONFIRMED_TITLE}.pdf`, bytes: pagedPdf(SHEETS, { fontSize: 6, width: 10_000, pageWidth: 1600 }) },
      [UNCONFIRMED_ID]: { versionId: bcsId(203), fileName: "2024 JBA Policy Manual - Edited 10-2024.pdf", bytes: pagedPdf([["Unconfirmed manual"]]) },
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

  async documents() {
    const { rows } = await this.database.db.query<{ id: string; title: string; source: string; tags: string[]; status: string; knowledge_scope_id: string; original_filename: string; version: number }>(
      "select id, title, source, tags, status, knowledge_scope_id, original_filename, version from public.knowledge_documents order by title",
    );
    return rows;
  }

  async item(entityId: string) {
    const { rows } = await this.database.db.query<{ state: string; reason: string | null; in_knowledge_base: boolean }>(
      "select state, reason, in_knowledge_base from public.knowledge_sync_items where entity_id = $1",
      [entityId],
    );
    return rows;
  }
}

let harness: Harness;

beforeEach(async () => {
  harness = await Harness.create();
});

afterEach(async () => {
  await harness.close();
});

/**
 * Preview, the administrator's audience decision for "Public" (the second,
 * human gate in production — on the Woven Knowledge page), then a sync.
 */
async function synced() {
  expect((await harness.run("preview")).status).toBe("succeeded");
  await harness.store.saveDecision({ source: "woven", audienceKey: audienceKey(["Public"]), decision: "company_wide", decidedBy: "admin:test", decidedAt: harness.clock.toISOString() });
  const outcome = await harness.run("sync");
  expect(outcome.status).toMatch(/^succeeded/);
  return outcome;
}

async function manual() {
  const [document] = (await harness.documents()).filter((row) => row.title === CONFIRMED_TITLE);
  expect(document, "the handbook was ingested").toBeDefined();
  const result = await new SupabaseKnowledgeProvider().fetchOfficialPolicyManual(document!.knowledge_scope_id);
  if (!result.ok) throw new Error(`manual not resolved: ${result.reason}`);
  return result;
}

describe("the confirmed handbook only", () => {
  it("is the one confirmed id", () => {
    expect(WOVEN_KNOWLEDGE_OWNERSHIP_REVIEW.confirmedEntityIds).toEqual([CONFIRMED_ID]);
  });

  it("is downloaded from Buff City Soap's own company and indexed once, as a Woven handbook", async () => {
    await synced();
    const documents = (await harness.documents()).filter((row) => /JBA/.test(row.title));
    expect(documents.map((row) => row.title)).toEqual([CONFIRMED_TITLE]);
    expect(documents[0]).toMatchObject({ source: "woven", status: "indexed", original_filename: "2025-JBA-Policy-Manual-Edited-5-2025.pdf" });
    expect(documents[0]!.tags).toContain("woven-handbook");
    // Every content read was in Buff City Soap's company, and none was a write.
    expect(harness.fake.writes()).toEqual([]);
    expect(harness.fake.contentReads().every((request) => request.company === BCS_COMPANY_ID)).toBe(true);
  });

  it("waits for an administrator's audience decision: without one, nothing is downloaded or indexed", async () => {
    expect((await harness.run("preview")).status).toBe("succeeded");
    expect((await harness.run("sync")).status).toMatch(/^succeeded/);
    expect(await harness.item(CONFIRMED_ID)).toEqual([expect.objectContaining({ state: "NEEDS_REVIEW", reason: "audience_needs_review", in_knowledge_base: false })]);
    expect((await harness.documents()).map((row) => row.title)).not.toContain(CONFIRMED_TITLE);
    expect(harness.fake.log.some((request) => request.path === "/KnowledgeCenter/_Handbook_DownloadVersion")).toBe(false);
  });

  it("the Public decision releases nothing else: every other Public item stays excluded", async () => {
    await synced();
    const { rows } = await harness.database.db.query<{ title: string; reason: string }>(
      "select title, reason from public.knowledge_sync_items where 'Public' = any(audience) and entity_id <> $1 order by title",
      [CONFIRMED_ID],
    );
    expect(rows.length).toBeGreaterThan(0);
    // Each is excluded for a reason of its own (unverified audience, ownership, not visible), and none is indexed.
    for (const row of rows) expect(row.reason, row.title).not.toBeNull();
    const indexed = (await harness.documents()).map((row) => row.title);
    for (const row of rows) expect(indexed, row.title).not.toContain(row.title);
  });

  it("leaves an unconfirmed manual-titled handbook held, never opened and never downloaded", async () => {
    await synced();
    expect(await harness.item(UNCONFIRMED_ID)).toEqual([expect.objectContaining({ state: "NEEDS_REVIEW", reason: "ownership_review", in_knowledge_base: false })]);
    expect(harness.fake.log.some((request) => request.path.includes(UNCONFIRMED_ID))).toBe(false);
    expect(harness.fake.log.some((request) => request.body.includes(UNCONFIRMED_ID))).toBe(false);
  });

  it("keeps the policy record titled after the manual out", async () => {
    await synced();
    const titles = (await harness.documents()).map((row) => row.title);
    expect(titles).not.toContain("JBA Policy Manual 2025");
  });
});

describe("no duplicate handbook entries", () => {
  it("a second sync updates nothing and adds nothing", async () => {
    await synced();
    const first = (await harness.documents()).filter((row) => row.title === CONFIRMED_TITLE);
    await harness.run("sync");
    const second = (await harness.documents()).filter((row) => row.title === CONFIRMED_TITLE);
    expect(second).toHaveLength(1);
    expect(second[0]!.id).toBe(first[0]!.id);
    expect(second[0]!.version).toBe(first[0]!.version);
  });

  it("is the one official policy manual — resolved, not ambiguous", async () => {
    await synced();
    const result = await manual();
    expect(result.documentTitle).toBe(CONFIRMED_TITLE);
    expect(manualDisplayTitle(result.documentTitle)).toBe("JBA Policy Manual");
  });
});

describe("read as Buff City Soap", () => {
  it("keeps the company-wide rules, Buff City Soap's block and the office block", async () => {
    await synced();
    const text = (await manual()).chunks.map((entry) => entry.content).join("\n");
    expect(text).toContain("All Locations Dress Code:");
    expect(text).toContain("Name tags are to be worn and visible at all times while working.");
    expect(text).toContain("Buff City Soap:");
    expect(text).toContain("Any BCS Employee can wear any plain black, white, or gray t-shirt");
    expect(text).toContain("JB & Associates Office:");
    expect(text).toContain("Any JBA franchise Branded top");
  });

  it("drops Sun Tan City-only and Crunch-only rules, and the tanning-only chapter", async () => {
    await synced();
    const text = (await manual()).chunks.map((entry) => entry.content).join("\n");
    expect(text).not.toMatch(/Any STC Employee|consistent tanning schedule|ASD and above/);
    expect(text).not.toMatch(/Two uniform shirts|Group Fitness Instructors|Zumba/);
    expect(text).not.toMatch(/Client Tanning Policies|One Tanner per Room|only one client allowed per/);
  });
});

describe("a form's citation", () => {
  it("quotes the section verbatim and names the page the manual prints", async () => {
    await synced();
    const result = await manual();
    const section = findManualSection(result.chunks, ["Dress Code for The Company"]);
    expect(section, "the dress code section is found").not.toBeNull();
    const value = policyFieldValue(manualGroundedPolicies({ documentId: result.documentId, documentTitle: result.documentTitle, chunks: result.chunks }, [section!]))!;
    // The section's own wording, stopping at the next printed heading — as the reference platform cites it.
    expect(value).toBe(
      "The Company Employees are to keep a neat, clean, professional appearance at all times. Anyone\nviolating their Brand’s Dress code policy will be sent home to change into proper work attire and\nmay be subject to disciplinary action, up to and potentially including termination.\n\n" +
        "Source: JBA Policy Manual — Dress Code for The Company, p. 15",
    );
    // Every sentence quoted is the manual's own.
    const manualText = SHEETS.flat().join(" ").replace(/\s+/g, " ");
    for (const sentence of value.split("\n\nSource:")[0]!.split(/(?<=\.)\s+/)) {
      if (sentence.trim()) expect(manualText).toContain(sentence.trim().replace(/\s+/g, " "));
    }
  });
});
