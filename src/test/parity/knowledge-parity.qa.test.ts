import { writeFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * ============================================================================
 * KNOWLEDGE CHAT, SIDE BY SIDE — THE SAME CONVERSATIONS THROUGH EACH APP
 * ============================================================================
 *
 * Runs unchanged in both repositories. Each app's REAL `answerQuestion`, real
 * `SupabaseKnowledgeProvider`, real `match_knowledge_chunks` (its own
 * migrations on PGlite + pgvector) and real ingestion pipeline answer the
 * same questions over the same small FICTIONAL corpus. Only the model call is
 * replaced: it records what it was sent and answers with markers, so
 * grounding, citations, coverage and history handling are all observable.
 *
 * The embedder is a deterministic bag of words, so the similarity floor is
 * lowered — identically in both apps — to let natural questions match. What
 * is under test is the pipeline's behaviour, not ranking quality.
 */

vi.setConfig({ hookTimeout: 120_000, testTimeout: 120_000 });

vi.mock("@/lib/config/models", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config/models")>();
  return { ...actual, RETRIEVAL: { ...actual.RETRIEVAL, minSimilarity: 0.3 } };
});

vi.mock("@/lib/config/server-env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server-env")>()),
  liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }),
}));

const model = vi.hoisted(() => ({
  calls: [] as Record<string, unknown>[],
  answer: ((): string => "") as (input: Record<string, unknown>) => string,
}));
vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async (input: Record<string, unknown>) => {
    model.calls.push(input);
    return model.answer(input);
  },
}));

/* Not under test, and each reads tables the knowledge schema does not carry. */
vi.mock("@/lib/forms/repository", () => ({ listTemplateSummaries: async () => [] }));
vi.mock("@/lib/reporting/read/report-briefing", () => ({ loadReportBriefing: async () => null }));
vi.mock("@/lib/reporting/read/employee-facts", () => ({
  loadEmployeeFacts: async () => ({ available: false, block: null, reason: "no dataset" }),
  NO_EMPLOYEE_DATASET_REASON: "no dataset",
  EMPLOYEE_DATA_HEADING: "CURRENT EMPLOYEE PERFORMANCE DATA",
}));

const { EMBEDDING_DIMENSIONS } = await import("@/lib/config/models");
const { __setEmbeddingProvider } = await import("@/lib/embeddings");
const { __setSupabaseAdmin } = await import("@/lib/supabase/server");
const { bagOfWordsEmbedding, createKnowledgeTestDatabase } = await import("@/test/pglite-knowledge-db");
const { ingestDocument } = await import("@/lib/ingestion/pipeline");
const { activeKnowledgeCorpus } = await import("@/lib/knowledge/corpus");
const { answerQuestion } = await import("@/lib/ai/server-ask");
const { ACTIVE_BRAND } = await import("@/lib/brand");

const APP = ACTIVE_BRAND.id === "bcs" ? "bubbles" : "sunny";
const ACTOR =
  APP === "bubbles"
    ? { role: "location_manager", scope: { level: "location", primaryAreaId: "loc-0101", alsoCoversAreaIds: [] } }
    : { role: "salon_director", scope: { level: "salon", primaryAreaId: "salon-0101", alsoCoversAreaIds: [] } };

/** A fictional corpus. No company's real policy. */
const CORPUS: { title: string; text: string; scope?: string }[] = [
  {
    title: "Attendance Policy",
    text: "Attendance Policy\n\nTeam members must arrive on time for every scheduled shift. If you will be late, call the manager on duty at least two hours before your shift starts. Three late arrivals within thirty days lead to a documented attendance conversation with your manager.",
  },
  {
    title: "Attendance FAQ for Part-Time Team Members",
    text: "Attendance FAQ for Part-Time Team Members\n\nPart-time team members follow the same attendance policy as full-time team members. Part-time team members who will be late must also call the manager on duty at least two hours before the shift starts.",
  },
  {
    title: "Break Policy",
    text: "Break Policy\n\nTeam members receive a paid ten-minute rest break for every four hours worked during a shift. A thirty-minute unpaid meal break is taken after six hours worked. Breaks are scheduled by the manager on duty.",
  },
  {
    title: "Store Opening Procedure",
    text: "Store Opening Procedure\n\nThe opening manager unlocks the store thirty minutes before opening, counts the register drawer, and completes the opening checklist before the doors open to guests.",
  },
  {
    title: "Dress Code",
    text: "Dress Code\n\nTeam members wear a clean store apron, closed-toe shoes and a name tag on every shift. Open-toe shoes and sandals are not permitted on the sales floor.",
  },
  {
    /* ANOTHER COMPANY'S CORPUS in the same database: must never be retrieved. */
    title: "Other Company Attendance Policy",
    scope: "other-company-core",
    text: "Other Company Attendance Policy\n\nTeam members must arrive on time for every scheduled shift and call the manager on duty if they will be late. Five late arrivals lead to a final warning.",
  },
];

type Turn = { role: "user" | "assistant"; content: string };
type Report = Record<string, unknown>;
const report: Record<string, Report> = {};

/** The model's stand-in: cite every source it was given, plus one invalid marker. */
function citingAnswer(input: Record<string, unknown>): string {
  const markers = [...String(input.grounding ?? "").matchAll(/^\[S(\d+)\]/gm)].map((match) => `[S${match[1]}]`);
  return markers.length > 0
    ? `Here is what the policy says ${markers.join("")}. Also [S9].`
    : "The knowledge base does not have that.";
}

async function ask(id: string, question: string, history: Turn[] = []) {
  model.calls = [];
  model.answer = citingAnswer;
  const response = await answerQuestion(
    {
      question,
      mode: "standard",
      history: history.map((turn, index) => ({ id: `h${index}`, createdAt: "2026-10-06T12:00:00Z", ...turn })),
      scopeId: activeKnowledgeCorpus(),
      context: { userName: "Dana Reyes", locationName: "Example Location 101", todayIso: "2026-10-06" },
    } as never,
    ACTOR as never,
  );
  const sent = model.calls[0] ?? null;
  const grounding = String(sent?.grounding ?? "");
  const entry: Report = {
    question,
    modelCalled: sent !== null,
    groundingTitles: [...grounding.matchAll(/^\[S\d+\] (.+?)(?: — .*)?$/gm)].map((match) => match[1]),
    historySent: (sent?.history as unknown[] | undefined)?.length ?? null,
    promptSaysNoDocuments: String(sent?.system ?? "").includes("no company documents matched this question"),
    citations: response.citations.map((citation) => citation.documentTitle),
    coverage: response.coverage,
    content: response.content,
  };
  report[id] = entry;
  return { response, entry, sent };
}

let close: () => Promise<void>;

beforeAll(async () => {
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
  for (const doc of CORPUS) {
    await ingestDocument({
      file: new Blob([doc.text], { type: "text/plain" }),
      fileName: `${doc.title}.txt`,
      mimeType: "text/plain",
      title: doc.title,
      category: "policies_compliance",
      scopeId: doc.scope ?? activeKnowledgeCorpus(),
      uploadedByName: "QA",
    } as never);
  }
  close = async () => {
    __setSupabaseAdmin(null);
    __setEmbeddingProvider(null);
    await database.close();
  };
});

afterAll(async () => {
  await close?.();
  if (process.env.PARITY_OUT) writeFileSync(process.env.PARITY_OUT, JSON.stringify({ app: APP, report }, null, 2));
});

describe(`knowledge chat parity (${APP})`, () => {
  it("K1 simple question with a source", async () => {
    const { entry } = await ask("K1", "What does the attendance policy say about arriving late for a shift?");
    expect(entry.groundingTitles).toContain("Attendance Policy");
    expect(entry.citations).toContain("Attendance Policy");
    expect(entry.coverage).toBe("grounded");
  });

  it("K2 question with several possible source documents", async () => {
    const { entry } = await ask("K2", "What is the attendance policy for part-time team members who will be late?");
    expect(entry.groundingTitles).toEqual(expect.arrayContaining(["Attendance Policy", "Attendance FAQ for Part-Time Team Members"]));
  });

  it("K3 no reliable source: says so, cites nothing", async () => {
    const { entry } = await ask("K3", "How many weeks of parental leave do we offer?");
    expect(entry.citations).toEqual([]);
    expect(entry.coverage).toBe("insufficient");
    expect(entry.promptSaysNoDocuments).toBe(true);
  });

  it("K4 follow-up on a new subject keeps the conversation and finds its own source", async () => {
    const history: Turn[] = [
      { role: "user", content: "What does the attendance policy say about arriving late for a shift?" },
      { role: "assistant", content: "Team members must arrive on time and call the manager on duty two hours before." },
    ];
    const { entry } = await ask("K4", "What about breaks during a shift?", history);
    expect(entry.historySent).toBe(2);
    expect(entry.groundingTitles).toContain("Break Policy");
  });

  it("K5 elliptical follow-up referring to the previous answer", async () => {
    const history: Turn[] = [
      { role: "user", content: "What does the attendance policy say about arriving late for a shift?" },
      { role: "assistant", content: "Team members must arrive on time and call the manager on duty two hours before." },
    ];
    const { entry } = await ask("K5", "and for part-timers?", history);
    expect(entry.historySent).toBe(2);
  });

  it("K6 citations come from retrieved rows; an invalid marker never becomes a card", async () => {
    const { entry } = await ask("K6", "What is the dress code for shoes on the sales floor?");
    expect(entry.citations).toContain("Dress Code");
    expect(String(entry.content)).not.toMatch(/\[S\d+\]/);
    expect((entry.citations as string[]).length).toBeLessThanOrEqual((entry.groundingTitles as string[]).length);
  });

  it("K7 ambiguous question", async () => {
    await ask("K7", "What's the policy?");
  });

  it("K8 correction to the previous message", async () => {
    const history: Turn[] = [
      { role: "user", content: "What's the policy on shoes for returns?" },
      { role: "assistant", content: "The knowledge base does not have that." },
    ];
    const { entry } = await ask("K8", "Sorry, I meant the dress code — which shoes are allowed on the sales floor?", history);
    expect(entry.groundingTitles).toContain("Dress Code");
  });

  it("K9 multi-turn conversation: prior turns travel (callClaude then keeps the last 10)", async () => {
    const history: Turn[] = Array.from({ length: 14 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: index % 2 === 0 ? `Question ${index}` : `Answer ${index}`,
    })) as Turn[];
    const { entry } = await ask("K9", "How does the store opening procedure work?", history);
    expect(entry.historySent).toBe(14);
    expect(entry.groundingTitles).toContain("Store Opening Procedure");
  });

  it("K10 another company's documents are never retrieved", async () => {
    const { entry, sent } = await ask("K10", "Other company attendance policy: how many late arrivals lead to a final warning?");
    expect(entry.groundingTitles).not.toContain("Other Company Attendance Policy");
    expect(String(sent?.grounding ?? "")).not.toContain("Five late arrivals");
  });
});
