import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { APPROVED_GOOGLE_STORES } from "@/config/company/google-reviews";
import { goalContext, type GoalRow } from "@/lib/google-reviews/goals";

import { isGoogleReviewQuestion, storeCodesNamedIn } from "./google-reviews-chat";

/**
 * Port from Ask Sunny, QA T11 (25 Oct 2026, a 1-star chat): "Ask Sunny denies
 * data the app has." The chat answered Google review questions with "I don't
 * have review counts" while /reviews showed the month to date against the
 * goal. Ask Bubbles reads only the stored inventory in chat, so it has the
 * same gap.
 *
 * QA's three wordings, verbatim, except that the store QA named is swapped
 * for one of this app's own stores (Lee's Summit) — the store, not the words.
 *
 * Flag off, no month-to-date figure reaches the model and the prompt says it
 * has no report figures. Flag on, the model gets the page's own goal counts
 * for the caller's stores, and a role without View reports gets a decline.
 */

const ORIGINAL = "How many google reviews do we have this far";
const THIS_MONTH = "google reviews this month";
const NAMED_STORE =
  "Can you tell me how many Google reviews Lee's Summit has this month and whether we are on track for the goal of 10?";

const TODAY = "2026-10-25";

/** 63 qualifying across the seven, Lee's Summit on 9. */
const MONTH_TO_DATE: Record<string, number> = {
  "219": 9, "225": 8, "236": 10, "264": 12, "338": 6, "66": 7, "67": 11,
};

function row(code: string): GoalRow {
  const store = APPROVED_GOOGLE_STORES.find((entry) => entry.code === code)!;
  return {
    storeCode: code,
    displayName: store.displayName,
    monthlyTarget: 10,
    baselineReviewId: `baseline-${code}`,
    baselineReviewTime: "2026-09-01T05:00:00.000Z",
    countFrom: null,
    qualifyingThisWeek: 2,
    qualifyingLastWeek: 3,
    qualifyingMonthToDate: MONTH_TO_DATE[code]!,
    historical: 40,
  };
}

const state = vi.hoisted(() => ({
  claudeInput: null as Record<string, unknown> | null,
  goalReads: 0,
}));

vi.mock("@/lib/config/server-env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server-env")>()),
  liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }),
  supabaseReadiness: () => ({ ready: true, missing: [] }),
}));

vi.mock("@/lib/google-reviews/views", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google-reviews/views")>()),
  readGoalData: async () => {
    state.goalReads += 1;
    return { context: goalContext(TODAY), rows: APPROVED_GOOGLE_STORES.map((store) => row(store.code)) };
  },
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
      return [];
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

vi.mock("@/lib/forms/chat-form-records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/forms/chat-form-records")>()),
  loadFormRecords: async () => null,
}));

vi.mock("./call-claude", () => ({
  callClaude: async (input: Record<string, unknown>) => {
    state.claudeInput = input;
    return "Answer.";
  },
}));

type Actor = {
  role: "owner" | "location_manager" | "employee";
  scope: { level: "global" | "location"; primaryAreaId: string | null; alsoCoversAreaIds: string[] };
  subject: string;
  verified: boolean;
};

const OWNER: Actor = {
  role: "owner",
  scope: { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] },
  subject: "user-owner",
  verified: true,
};
const LEES_SUMMIT_MANAGER: Actor = {
  role: "location_manager",
  scope: { level: "location", primaryAreaId: "loc-219", alsoCoversAreaIds: [] },
  subject: "user-manager",
  verified: true,
};
const OMAHA_MANAGER: Actor = { ...LEES_SUMMIT_MANAGER, scope: { ...LEES_SUMMIT_MANAGER.scope, primaryAreaId: "loc-264" } };
const LEES_SUMMIT_EMPLOYEE: Actor = { ...LEES_SUMMIT_MANAGER, role: "employee", subject: "user-employee" };

async function ask(question: string, actor: Actor) {
  const { answerQuestion } = await import("./server-ask");
  await answerQuestion(
    {
      question,
      mode: "standard",
      history: [],
      scopeId: "bcs-core",
      context: { userName: "Quill Varden", locationName: "Lee's Summit, MO", todayIso: TODAY },
    } as never,
    actor as never,
  );
  return {
    reportData: (state.claudeInput?.reportData as string | null) ?? "",
    system: (state.claudeInput?.system as string) ?? "",
  };
}

/* The first import of the chat path is slow; it is not what is under test. */
beforeAll(async () => {
  await import("./server-ask");
}, 60_000);

const DENIAL = "You have NO report figures for this question";

beforeEach(() => {
  state.claudeInput = null;
  state.goalReads = 0;
});

afterEach(() => {
  delete process.env.GOOGLE_REVIEWS_IN_CHAT_ENABLED;
});

describe("QA T11: the production wordings are Google review questions", () => {
  it.each([ORIGINAL, THIS_MONTH, NAMED_STORE])("%s", (question) => {
    expect(isGoogleReviewQuestion(question)).toBe(true);
  });

  it("names Lee's Summit, and leaves other kinds of review alone", () => {
    expect(storeCodesNamedIn(NAMED_STORE)).toEqual(["219"]);
    expect(storeCodesNamedIn("google reviews at Sioux Falls")).toEqual(["225", "338"]);
    expect(storeCodesNamedIn(ORIGINAL)).toEqual([]);
    expect(isGoogleReviewQuestion("how many performance reviews are due this month")).toBe(false);
    expect(isGoogleReviewQuestion("can you review the attendance policy with me")).toBe(false);
  });
});

describe("QA T11, flag off: the path that denies the data", () => {
  it.each([ORIGINAL, THIS_MONTH, NAMED_STORE])("%s", async (question) => {
    const { reportData, system } = await ask(question, OWNER);
    expect(state.goalReads).toBe(0);
    expect(reportData).not.toContain("GOOGLE REVIEWS — MONTH TO DATE");
    expect(system).toContain(DENIAL);
  });
});

describe("QA T11, flag on: the /reviews goal counts reach the answer", () => {
  beforeEach(() => {
    process.env.GOOGLE_REVIEWS_IN_CHAT_ENABLED = "true";
  });

  it("Lee's Summit this month against the goal of 10, for its store manager", async () => {
    const { reportData, system } = await ask(NAMED_STORE, LEES_SUMMIT_MANAGER);
    expect(state.goalReads).toBe(1);
    expect(reportData).toContain("GOOGLE REVIEWS — MONTH TO DATE");
    expect(reportData).toContain("Period: October 2026 month to date, Oct 1 – Oct 25 (Central time).");
    expect(reportData).toContain(
      "- Lee's Summit, MO (store 219): 9 qualifying reviews month to date of the 10 goal, 1 still needed. Status: On pace (on pace today means at least 8).",
    );
    expect(reportData).not.toContain("store 264");
    expect(system).not.toContain(DENIAL);
  });

  it("the original wording, for the owner, carries every store and the total", async () => {
    const { reportData, system } = await ask(ORIGINAL, OWNER);
    expect(reportData).toContain("Lee's Summit, MO (store 219): 9 qualifying");
    expect(reportData).toContain("Bellevue, NE (store 67): 11 qualifying");
    expect(reportData).toContain(
      "Total for the 7 counting stores above: 63 qualifying reviews month to date against a combined goal of 70.",
    );
    expect(system).not.toContain(DENIAL);
  });

  it("google reviews this month, for a store manager, carries only their store", async () => {
    const { reportData } = await ask(THIS_MONTH, LEES_SUMMIT_MANAGER);
    expect(reportData).toContain("Lee's Summit, MO (store 219): 9 qualifying");
    expect(reportData).not.toContain("store 264");
    expect(reportData).not.toContain("Total for the");
  });

  it("a store outside the caller's scope is named without a figure", async () => {
    const { reportData } = await ask(NAMED_STORE, OMAHA_MANAGER);
    expect(state.goalReads).toBe(0);
    expect(reportData).toContain("Lee's Summit, MO: not one of the stores this account may see. No figure is given for it.");
    expect(reportData).not.toMatch(/\d+ qualifying/);
  });

  it.each([ORIGINAL, THIS_MONTH, NAMED_STORE])("an Employee is declined and nothing is read: %s", async (question) => {
    const { reportData, system } = await ask(question, LEES_SUMMIT_EMPLOYEE);
    expect(state.goalReads).toBe(0);
    expect(reportData).toContain("This account's role does not include View reports.");
    expect(reportData).not.toMatch(/\d+ qualifying/);
    expect(system).toContain(DENIAL);
  });
});

describe("QA T11: one review block per turn", () => {
  it("CHAT_DATA_TOOLS does not read the inventory again once the month-to-date block is attached", async () => {
    const { loadChatDataBlock } = await import("./chat-data-tools");
    const block = await loadChatDataBlock({
      enabled: true,
      question: NAMED_STORE,
      role: "owner",
      breakdown: false,
      reviewsHandled: true,
    });
    expect(block.data).toBeNull();
  });
});
