import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * THE WIRING of `resolveChatEntities` into the real `answerQuestion`: a pure
 * lookup is answered with no retrieval and no model call; any other question
 * that names someone or a store reaches the model with the verified records
 * and the rule about them; a question that names nobody is untouched.
 */

const seen = vi.hoisted(() => ({
  model: null as Record<string, unknown> | null,
  system: "" as string,
  retrievals: 0,
  entities: { block: null as string | null, direct: null as unknown },
}));

vi.mock("@/lib/config/server-env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server-env")>()),
  liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }),
}));
vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async (input: Record<string, unknown>) => {
    seen.model = input;
    seen.system = String(input.system);
    return "General guidance only.";
  },
}));
vi.mock("@/lib/forms/repository", () => ({ listTemplateSummaries: async () => [] }));
vi.mock("@/lib/ai/entity-facts", () => ({ resolveChatEntities: async () => seen.entities }));
vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    async match() {
      seen.retrievals += 1;
      return [];
    }
    async fetchRoleGrounding() {
      return { ok: false, failure: { code: "none" } };
    }
    async fetchNamedHandbook() {
      return null;
    }
  },
}));

const { answerQuestion } = await import("./server-ask");

const request = (question: string) =>
  ({
    question,
    history: [],
    mode: "standard",
    context: { todayIso: "2026-10-19" },
    scopeId: "scope",
  }) as never;
const actor = { role: "location_manager" as never, scope: { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] } as never };

beforeEach(() => {
  seen.model = null;
  seen.retrievals = 0;
  seen.entities = { block: null, direct: null };
});

describe("general chat resolves stores and verifies employees", () => {
  it("answers a pure lookup outright: no retrieval, no model", async () => {
    seen.entities = { block: null, direct: { content: "**Sarah Miller**'s job title in Woven is **Production Associate**.", citations: [] } };
    const answer = await answerQuestion(request("What is Sarah Miller's job title?"), actor);
    expect(answer.content).toContain("Production Associate");
    expect(seen.retrievals).toBe(0);
    expect(seen.model).toBeNull();
  });

  it("hands the model the verified records, and the rule that they are the only source", async () => {
    seen.entities = { block: "VERIFIED RECORDS (x)\n\nEmployee: Sarah Miller — Woven job title: Production Associate.", direct: null };
    await answerQuestion(request("Is Sarah Miller eligible for the attendance bonus?"), actor);
    expect(seen.model!.verifiedRecords).toContain("Woven job title: Production Associate");
    expect(seen.system).toContain("Verified records");
    expect(seen.system).toContain("Never state any of them from anywhere else");
  });

  it("the prompt never lets the model state a title the deterministic records did not give it", async () => {
    await answerQuestion(request("What is the attendance policy?"), actor);
    // Always on, with or without a record attached.
    expect(seen.system).toContain("Never state a particular employee's job title, store assignment or employment status unless a VERIFIED RECORDS section below gives it");
    seen.entities = { block: "VERIFIED RECORDS (x)\n\nEmployee: Sarah Miller — NOT VERIFIED.", direct: null };
    await answerQuestion(request("Is Sarah Miller eligible for the attendance bonus?"), actor);
    // And where somebody's wording differs from the record, neither is silently adopted.
    expect(seen.system).toContain("never silently adopt either");
    expect(seen.system).toContain("Where it says to ask which store or person, ask rather than choose");
  });

  it("leaves an ordinary question exactly as it was", async () => {
    await answerQuestion(request("What is the attendance policy?"), actor);
    expect(seen.model!.verifiedRecords).toBeNull();
    expect(seen.system).not.toContain("Verified records");
  });
});
