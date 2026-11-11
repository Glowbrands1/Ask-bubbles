import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * QUERY_REWRITE_KEEPS_NOUNS_ENABLED (port of the sibling app's mechanism, QA 11 Nov 2026). The rewrite phrased an
 * operational how-to "in the manual's terms" and the manager's own equipment and action words were lost from the
 * search. The model is a stand-in that answers with a policy heading. The wording is this app's (invented).
 */
const HEADING = "Care and Cleaning of Equipment and Facilities";
vi.mock("./call-claude", () => ({ callClaudeTool: vi.fn(async () => ({ query: HEADING })) }));

const { rewriteRetrievalQuery } = await import("./query-rewrite-claude");
const { operationalHowTo } = await import("./query-rewrite");

const rewrite = (question: string) => rewriteRetrievalQuery({ question, history: [], fallback: question });

describe("QUERY_REWRITE_KEEPS_NOUNS_ENABLED", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["how do I reset the register after closing?", ["reset", "register"]],
    ["what are the steps for cleaning the display shelves?", ["cleaning", "shelves"]],
  ])("on: %s keeps the manager's words beside the rewrite", async (question, words) => {
    vi.stubEnv("QUERY_REWRITE_KEEPS_NOUNS_ENABLED", "true");
    const query = (await rewrite(question)).toLowerCase();
    for (const word of words) expect(query).toContain(word);
  });

  it("off: the rewrite as before", async () => {
    vi.stubEnv("QUERY_REWRITE_KEEPS_NOUNS_ENABLED", "");
    expect(await rewrite("how do I reset the register after closing?")).toBe(HEADING);
  });

  it("a policy question is not an operational how-to; the rewrite as before", async () => {
    vi.stubEnv("QUERY_REWRITE_KEEPS_NOUNS_ENABLED", "true");
    expect(operationalHowTo("what is our policy on cleaning the store?")).toBe(false);
    expect(await rewrite("what is our policy on cleaning the store?")).toBe(HEADING);
  });
});
