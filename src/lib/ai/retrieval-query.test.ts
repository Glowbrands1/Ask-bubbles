import { beforeEach, describe, expect, it, vi } from "vitest";

import { citedSections, pointsBack, retrievalPlanFor } from "./retrieval-query";
import type { OpenFormSummary } from "./types";

/**
 * A short turn about "the policy" is searched with what it points at — the
 * open form's cited sections, and the manager's earlier turn as the fallback.
 * Ported from the reference platform; see `retrieval-query.ts`. At the bottom,
 * the production follow-up run through `answerQuestion`, to show the searches
 * the knowledge base receives.
 */

const state = vi.hoisted(() => ({
  queries: [] as string[],
  system: "",
  rowsFor: (() => []) as (query: string) => unknown[],
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
    async match(query: { query: string }) {
      state.queries.push(query.query);
      return state.rowsFor(query.query);
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
  callClaude: async (input: { system: string }) => {
    state.system = input.system;
    return "An answer.";
  },
}));

const user = (content: string) => ({ role: "user", content });
const bubbles = (content: string) => ({ role: "assistant", content });

const OPEN_CA: OpenFormSummary = {
  templateName: "Corrective Action Form",
  employeeName: "Pat Rivera",
  status: "draft",
  lines: [
    { label: "Type of Warning", value: "Verbal Warning" },
    {
      label: "Direct policy from official manual",
      value: "When an employee assigned to open a location is unable to open…\n\nSource: JBA Policy Manual — Late Opening, p. 15",
    },
  ],
  unverifiedPolicy: [],
};

const VERIFIED = "I have independently verified and the policy is correct you may issue";
const ADDED = user("can you add late opening policy to the direct policy section of this form");

describe("which turns point back", () => {
  it.each([VERIFIED, "is that the right section?", "the wording is fine", "and for part-timers?", "does that apply to managers?"])(
    "%s → points back",
    (question) => {
      expect(pointsBack(question)).toBe(true);
    },
  );

  it.each([
    "What is the attendance policy?",
    "Does the attendance policy apply here?",
    "is it ok to wear jeans?",
    "Pat was 20 minutes late again and I want to know what the manual says about repeated tardiness for an operator who has already had a verbal warning this month",
  ])("%s → stands on its own", (question) => {
    expect(pointsBack(question)).toBe(false);
  });
});

describe("what a follow-up is searched with", () => {
  it("adds the open form's cited sections as a query, and the manager's earlier turn as the fallback", () => {
    const plan = retrievalPlanFor({
      question: VERIFIED,
      history: [ADDED, bubbles("Here's the manual's own language on Late Opening…")],
      openForm: OPEN_CA,
      enabled: true,
    });
    expect(plan.queries[0]).toBe(VERIFIED);
    expect(plan.queries).toContain(`${VERIFIED}\nLate Opening`);
    expect(plan.anchor).toBe(ADDED.content);
    expect(plan.fallback).toContain(ADDED.content);
    expect(plan.fallback).toContain(VERIFIED);
  });

  it("never anchors on Ask Bubbles' own words", () => {
    const plan = retrievalPlanFor({
      question: "is that the right section?",
      history: [user("what is the dress code?"), bubbles("The Late Opening section says…")],
      enabled: true,
    });
    expect(plan.anchor).toBe("what is the dress code?");
    expect(plan.fallback).not.toMatch(/Late Opening/);
  });

  it("plans a question with its own topic exactly as before, form or no form", () => {
    for (const question of ["What is the attendance policy?", "is it ok to wear jeans?"]) {
      const plan = retrievalPlanFor({ question, history: [user("what is the dress code?")], openForm: OPEN_CA, enabled: true });
      expect(plan.queries).toEqual([question]);
      expect(plan.fallback).toBeNull();
    }
  });

  it("adds nothing on the first turn without a form, or when switched off", () => {
    expect(retrievalPlanFor({ question: "is that right section?", history: [], enabled: true })).toEqual({
      queries: ["is that right section?"],
      fallback: null,
      anchor: null,
    });
    const off = retrievalPlanFor({ question: VERIFIED, history: [ADDED], openForm: OPEN_CA, enabled: false });
    expect(off.queries).toEqual([VERIFIED]);
    expect(off.fallback).toBeNull();
  });

  it("reads each section a form cites, preferring the provenance the server read", () => {
    expect(citedSections(OPEN_CA)).toEqual(["Late Opening"]);
    expect(
      citedSections({
        ...OPEN_CA,
        lines: [{ label: "Direct policy", value: "A\n\nSource: JBA Policy Manual — Attendance, pp. 13–14\n\nB\n\nSource: JBA Policy Manual — Late Opening, p. 15" }],
      }),
    ).toEqual(["Attendance", "Late Opening"]);
    expect(citedSections({ ...OPEN_CA, lines: [{ label: "Direct policy", value: "A long quotation, clipped…" }], cited: ["Attendance"] })).toEqual([
      "Attendance",
    ]);
    expect(citedSections(null)).toEqual([]);
  });
});

describe("the production follow-up, through answerQuestion", () => {
  beforeEach(() => {
    state.queries = [];
    state.system = "";
    state.rowsFor = () => [];
  });

  async function ask(openForm: OpenFormSummary | null) {
    const { answerQuestion } = await import("./server-ask");
    return answerQuestion(
      {
        question: VERIFIED,
        mode: "standard",
        history: [
          { id: "u1", role: "user", content: ADDED.content, createdAt: "2026-10-20T20:15:00Z" },
          { id: "a1", role: "assistant", content: "Here's the manual's own language on Late Opening.", createdAt: "2026-10-20T20:15:05Z" },
        ],
        scopeId: "bcs-core",
        context: { userName: "Dana Reyes", locationName: "Synthetic Store", todayIso: "2026-10-20" },
        openForm,
      } as never,
      { role: "location_manager" as never, scope: { level: "location", primaryAreaId: "loc-0101", alsoCoversAreaIds: [] } as never },
    );
  }

  it("searches the knowledge base for the section the form cites, not only for 'verified' and 'correct'", async () => {
    await ask(OPEN_CA);
    expect(state.queries[0]).toBe(VERIFIED);
    expect(state.queries).toContain(`${VERIFIED}\nLate Opening`);
    // Nothing came back, so the manager's earlier turn was searched too.
    expect(state.queries.some((query) => query.includes("can you add late opening policy"))).toBe(true);
    expect(state.system).toContain("A FORM IS OPEN IN THIS CONVERSATION");
  });

  it("does not search the earlier turn when the question and the form's sections already found something", async () => {
    state.rowsFor = (query) =>
      query.includes("Late Opening")
        ? [
            {
              chunk_id: "c-late",
              document_id: "doc-manual",
              document_title: "JBA Policy Manual",
              category: "policies_compliance",
              locator: "Page 15",
              page: 15,
              section: "Late Opening",
              content: "When an employee assigned to open a location is unable to open the location…",
              similarity: 0.86,
            },
          ]
        : [];
    await ask(OPEN_CA);
    expect(state.queries.some((query) => query.includes("can you add late opening policy"))).toBe(false);
  });
});
