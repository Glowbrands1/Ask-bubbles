import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * ============================================================================
 * PINNED DOCUMENTS THROUGH THE REAL ANSWER PATH
 * ============================================================================
 *
 * The company configuration ships with no pinned rule document and no
 * handbook, so this test supplies FICTIONAL ones and asks through the real
 * `answerQuestion`, provider and `match_knowledge_chunks` on PGlite. Only the
 * model call is replaced. It proves the wiring the unit tests cannot:
 *
 *   - a follow-up ("and on weekends?") keeps the rule document its anchor
 *     pinned, and an unrelated question does not inherit it;
 *   - a question naming the handbook pins its table of contents and tells
 *     the prompt so.
 */

vi.setConfig({ hookTimeout: 120_000, testTimeout: 120_000 });

const config = vi.hoisted(() => ({
  headings: [] as string[],
}));

vi.mock("@/config/company/knowledge", () => ({
  KNOWLEDGE_SOURCES: [],
  PINNED_KNOWLEDGE_ROLES: [
    {
      role: {
        id: "fixture_closing_rules",
        tag: "fixture-closing-rules",
        fallbackFilenames: [],
        fallbackTitles: [],
        ruleGroups: [{ id: "body", label: "The closing rules", headings: config.headings }],
        maxMandatoryChunks: 4,
      },
      triggers: [/\bclosing\b/i],
      onUnavailable: "degrade",
      unavailableMessage: "The closing rules are unavailable.",
    },
  ],
  NAMED_HANDBOOK: {
    identity: { tag: "fixture-team-handbook", fallbackFilenames: [], fallbackTitles: [] },
    namedBy: [/\bhandbook\b/i],
    notATopic: [],
  },
}));

vi.mock("@/lib/config/server-env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server-env")>()),
  liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }),
}));

const model = vi.hoisted(() => ({ input: null as Record<string, unknown> | null }));
vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async (input: Record<string, unknown>) => {
    model.input = input;
    return "Answer [S1].";
  },
}));
vi.mock("@/lib/forms/repository", () => ({ listTemplateSummaries: async () => [] }));

const { EMBEDDING_DIMENSIONS } = await import("@/lib/config/models");
const { __setEmbeddingProvider } = await import("@/lib/embeddings");
const { __setSupabaseAdmin } = await import("@/lib/supabase/server");
const { bagOfWordsEmbedding, createKnowledgeTestDatabase } = await import("@/test/pglite-knowledge-db");
const { ingestDocument } = await import("@/lib/ingestion/pipeline");
const { activeKnowledgeCorpus } = await import("@/lib/knowledge/corpus");
const { answerQuestion } = await import("./server-ask");

const CLOSING = "Closing Rules\n\nThe closing manager counts the register drawer, completes the closing checklist and locks every door before leaving the store.";
const HANDBOOK = "Example Team Handbook\n\nTable of Contents\nAttendance ........ 3\nBreaks ........ 4\nDress Code ........ 5\nClosing Duties ........ 6";

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
  for (const [title, text, tag] of [
    ["Closing Rules", CLOSING, "fixture-closing-rules"],
    ["Example Team Handbook", HANDBOOK, "fixture-team-handbook"],
  ] as const) {
    await ingestDocument({
      file: new Blob([text], { type: "text/plain" }),
      fileName: `${title}.txt`,
      mimeType: "text/plain",
      title,
      category: "policies_compliance",
      tags: [tag],
      scopeId: activeKnowledgeCorpus(),
      uploadedByName: "QA",
    } as never);
  }
  /* The rule group is satisfied by the closing document's own locator, whatever ingestion named it. */
  const { rows } = await database.db.query<{ locator: string }>(
    "select c.locator from public.knowledge_chunks c join public.knowledge_documents d on d.id = c.document_id where d.title = 'Closing Rules'",
  );
  config.headings.push(...rows.map((row) => row.locator));
  close = async () => {
    __setSupabaseAdmin(null);
    __setEmbeddingProvider(null);
    await database.close();
  };
});

afterAll(async () => close?.());

async function ask(question: string, history: { role: "user" | "assistant"; content: string }[] = []) {
  model.input = null;
  return answerQuestion(
    {
      question,
      mode: "standard",
      history: history.map((turn, index) => ({ id: `h${index}`, createdAt: "2026-10-06T12:00:00Z", ...turn })),
      scopeId: activeKnowledgeCorpus(),
      context: { userName: "Dana Reyes", locationName: "Example Location 101", todayIso: "2026-10-06" },
    } as never,
    { role: "location_manager" as never, scope: { level: "location", primaryAreaId: "loc-0101", alsoCoversAreaIds: [] } } as never,
  );
}

const system = () => String(model.input?.system ?? "");
const grounding = () => String(model.input?.grounding ?? "");

describe("a pinned rule document survives a follow-up", () => {
  it("is pinned for the question that needs it", async () => {
    await ask("What are the closing duties?");
    expect(system()).toContain('One of the numbered sources above is "Closing Rules"');
  });

  it("is still pinned for 'and on weekends?' after it", async () => {
    await ask("and on weekends?", [
      { role: "user", content: "What are the closing duties?" },
      { role: "assistant", content: "The closing manager counts the drawer." },
    ]);
    expect(system()).toContain('One of the numbered sources above is "Closing Rules"');
    expect(grounding()).toContain("Closing Rules");
  });

  it("is not inherited by a question that stands on its own", async () => {
    await ask("What is the dress code?", [
      { role: "user", content: "What are the closing duties?" },
      { role: "assistant", content: "The closing manager counts the drawer." },
    ]);
    expect(system()).not.toContain('One of the numbered sources above is "Closing Rules"');
  });
});

describe("a question naming the handbook reads it by identity", () => {
  it("pins the table of contents and tells the prompt it holds all of it", async () => {
    const response = await ask("What policies are in the team handbook?");
    expect(grounding()).toContain("Example Team Handbook");
    expect(system()).toContain("ITS COMPLETE TABLE OF CONTENTS IS INCLUDED");
    expect(response.citations.map((citation) => citation.documentTitle)).toContain("Example Team Handbook");
  });

  it("adds nothing when the question does not name it", async () => {
    await ask("What are the breaks?");
    expect(system()).not.toContain("TABLE OF CONTENTS");
  });
});
