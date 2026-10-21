import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * THE CHAT ROUTE SENDS "REDRAFT IT" TO THE OPEN FORM
 * ============================================================================
 *
 * The revision itself is proven in `api/forms/coaching-feedback-e2e.test.ts`.
 * This proves the wiring: with a created form named by the browser, the route
 * tries the correction, then a policy change, then the redraft, then the
 * revision, then a form on file asked for by name ("change exit for …"),
 * and only then an ordinary answer — which is told which form is open — and
 * without a named form it never tries any of the open-form paths.
 */

const ORIGINAL = { ...process.env };

async function load(
  revision: unknown,
  redraft: unknown = null,
  policyChange: unknown = null,
  reopened: unknown = null,
) {
  vi.resetModules();
  const seen = {
    answered: 0,
    revised: [] as unknown[],
    redrafted: [] as unknown[],
    policy: [] as unknown[],
    reopen: [] as Record<string, unknown>[],
    asked: [] as Record<string, unknown>[],
  };

  vi.doMock("@/lib/auth/server", () => ({
    authorizeRequest: async (_request: Request, permission: string) => ({
      identity: {
        subject: "user-1",
        email: "sd@example.com",
        displayName: "SD",
        role: "location_manager",
        scope: { level: "location", primaryAreaId: "loc-0310", alsoCoversAreaIds: [] },
        verified: true,
      },
      permission,
      provider: "supabase",
    }),
  }));
  vi.doMock("@/lib/ai/server-ask", () => ({
    answerQuestion: async (request: Record<string, unknown>) => {
      seen.answered += 1;
      seen.asked.push(request);
      return { content: "An ordinary answer.", citations: [] };
    },
  }));
  vi.doMock("@/lib/forms/chat-correction", () => ({ correctActiveForm: async () => null }));
  vi.doMock("@/lib/forms/chat-policy-change", () => ({
    changeActiveFormPolicy: async (input: unknown) => {
      seen.policy.push(input);
      return policyChange;
    },
  }));
  vi.doMock("@/lib/forms/open-form-summary", () => ({
    describeOpenForm: async (_request: Request, id: string) => ({
      templateName: "Corrective Action Form",
      employeeName: "Pat Rivera",
      status: "draft",
      lines: [],
      unverifiedPolicy: [],
      id,
    }),
  }));
  vi.doMock("@/lib/forms/chat-revision", () => ({
    reviseActiveForm: async (input: unknown) => {
      seen.revised.push(input);
      return revision;
    },
  }));
  vi.doMock("@/lib/forms/chat-redraft", () => ({
    redraftActiveForm: async (input: unknown) => {
      seen.redrafted.push(input);
      return redraft;
    },
  }));
  vi.doMock("@/lib/forms/chat-reopen", () => ({
    reopenRequestedForm: async (input: Record<string, unknown>) => {
      seen.reopen.push(input);
      return reopened;
    },
  }));
  vi.doMock("@/lib/supabase/server", () => ({
    getSupabaseAdmin: () => ({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        insert: async () => ({ error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    }),
  }));

  const route = await import("./route");
  return { route, seen };
}

const INSTANCE = "0b6b6f0e-1111-4c2a-9a55-000000000042";

function ask(body: Record<string, unknown>): Request {
  return new Request("https://app.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "Redraft it and change the timeframe to one week.", ...body }),
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.SUPABASE_SECRET_KEY = ["sb", "secret", "TESTFIXTURE"].join("_");
  process.env.ANTHROPIC_API_KEY = "test";
});

afterEach(() => {
  vi.useRealTimers();
  process.env = { ...ORIGINAL };
  for (const path of [
    "@/lib/auth/server",
    "@/lib/ai/server-ask",
    "@/lib/forms/chat-correction",
    "@/lib/forms/chat-policy-change",
    "@/lib/forms/open-form-summary",
    "@/lib/forms/chat-revision",
    "@/lib/forms/chat-redraft",
    "@/lib/forms/chat-reopen",
    "@/lib/supabase/server",
  ]) {
    vi.doUnmock(path);
  }
  vi.resetModules();
});

describe("a revision of the open form", () => {
  it("is answered by the revision, with the form update the editor listens for", async () => {
    const { route, seen } = await load({
      content: "Updated the **Coaching Form** for **Kaitlyn Brook**: Next Follow-Up.",
      citations: [],
      coverage: "not_applicable",

      formUpdate: { instanceId: INSTANCE, updated: ["next_follow_up"] },
    });
    const response = await route.POST(ask({ activeFormInstanceId: INSTANCE, history: [] }));
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.formUpdate).toEqual({ instanceId: INSTANCE, updated: ["next_follow_up"] });
    expect(seen.answered).toBe(0);
    expect(seen.revised).toHaveLength(1);
  });

  it("is given the business day, so a typed follow-up date can be read", async () => {
    /*
     * THE SERVER'S CLOCK, PINNED. The route takes the day from `businessToday()`
     * and ignores the browser's `todayIso`. Noon Eastern on 2 October, and a
     * browser date that disagrees, so the assertion names the day and proves
     * it is the server's.
     */
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T16:00:00Z"));
    const { route, seen } = await load({
      content: "Set the follow-up date to **Thursday, October 15, 2026**.",
      citations: [],
      coverage: "not_applicable",

      formUpdate: { instanceId: INSTANCE, updated: ["follow_up_date"] },
    });
    const response = await route.POST(
      ask({
        activeFormInstanceId: INSTANCE,
        history: [],
        question: "Change the follow-up date to 10/15",
        context: { userName: "Dana", locationName: "NE Lincoln O Street", todayIso: "2026-01-01" },
      }),
    );
    expect(response.status).toBe(200);
    expect(seen.revised[0]).toMatchObject({ question: "Change the follow-up date to 10/15", today: "2026-10-02" });
  });

  it("falls through to an ordinary answer when the turn is not a revision", async () => {
    const { route, seen } = await load(null);
    const response = await route.POST(ask({ activeFormInstanceId: INSTANCE, history: [] }));
    expect((await response.json()).content).toBe("An ordinary answer.");
    expect(seen.answered).toBe(1);
  });

  it("is never tried without a form the conversation created", async () => {
    const { route, seen } = await load({ content: "should not be used" });
    await route.POST(ask({ history: [] }));
    expect(seen.revised).toHaveLength(0);
    expect(seen.answered).toBe(1);
  });
});

/*
 * "HERE'S WHAT HAPPENED" on a Corrective Action Form created from a name alone
 * is a redraft of that form (`chat-redraft.ts`), tried after the correction and
 * the policy change and BEFORE the revision — a Corrective Action Form can be
 * revised in place now, and on a form Ask Bubbles wrote nothing on the whole
 * redraft is what the account is for — and only where the browser named a
 * created form.
 */
describe("an account of what happened, on the open form", () => {
  it("is answered by the redraft, with the form update the editor listens for", async () => {
    const { route, seen } = await load(null, {
      content: "Redrafted the **Corrective Action Form** for **Pat Rivera** from what you described.",
      citations: [],
      coverage: "not_applicable",
      formUpdate: { instanceId: INSTANCE, updated: ["observation", "policy_language"] },
    });
    const response = await route.POST(
      ask({
        activeFormInstanceId: INSTANCE,
        history: [],
        question: "Pat was scheduled to open the store at 9:30 and did not arrive until 11:23",
      }),
    );
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.formUpdate).toEqual({ instanceId: INSTANCE, updated: ["observation", "policy_language"] });
    expect(seen.redrafted).toHaveLength(1);
    expect(seen.redrafted[0]).toMatchObject({ instanceId: INSTANCE });
    expect(seen.answered).toBe(0);
  });

  it("is tried before the revision, which is not tried when the redraft answered the turn", async () => {
    const { route, seen } = await load(
      { content: "should not be used" },
      { content: "Redrafted.", citations: [], coverage: "not_applicable" },
    );
    const payload = await (await route.POST(ask({ activeFormInstanceId: INSTANCE, history: [] }))).json();
    expect(payload.content).toBe("Redrafted.");
    expect(seen.redrafted).toHaveLength(1);
    expect(seen.revised).toHaveLength(0);
  });

  it("is never tried without a form the conversation created", async () => {
    const { route, seen } = await load(null, { content: "should not be used" });
    await route.POST(ask({ history: [] }));
    expect(seen.redrafted).toHaveLength(0);
    expect(seen.answered).toBe(1);
  });
});

describe("a policy named for the open form", () => {
  it("is answered by the policy change, before any redraft or revision is tried", async () => {
    const { route, seen } = await load(
      { content: "should not be used" },
      { content: "should not be used" },
      {
        content: "Updated Direct policy from official manual on the **Corrective Action Form** for **Pat Rivera**.",
        citations: [],
        coverage: "not_applicable",
        formUpdate: { instanceId: INSTANCE, updated: ["policy_language"] },
      },
    );
    const response = await route.POST(
      ask({ activeFormInstanceId: INSTANCE, history: [], question: "add the attendance policy to this form" }),
    );
    const payload = await response.json();
    expect(payload.formUpdate).toEqual({ instanceId: INSTANCE, updated: ["policy_language"] });
    expect(seen.policy).toHaveLength(1);
    expect(seen.redrafted).toHaveLength(0);
    expect(seen.revised).toHaveLength(0);
    expect(seen.answered).toBe(0);
  });

  it("is never tried without a form the conversation created", async () => {
    const { route, seen } = await load(null);
    await route.POST(ask({ history: [], question: "add the attendance policy to this form" }));
    expect(seen.policy).toHaveLength(0);
  });
});

describe("an ordinary answer while a form is open", () => {
  it("is told which form is open, read by the server", async () => {
    const { route, seen } = await load(null);
    await route.POST(ask({ activeFormInstanceId: INSTANCE, history: [], openForm: { templateName: "Forged" } }));
    expect(seen.asked[0]?.openForm).toMatchObject({ templateName: "Corrective Action Form", id: INSTANCE });
  });

  it("is told nothing when the conversation created no form, whatever the body claims", async () => {
    const { route, seen } = await load(null);
    await route.POST(ask({ history: [], openForm: { templateName: "Forged" } }));
    expect(seen.asked[0]?.openForm ?? null).toBeNull();
  });
});

describe("a form on file, asked for by name", () => {
  const opened = {
    content: "The **Resignation/Exit Form** for **Jordan Smith** was finalized, so I opened a new draft of it.",
    citations: [],
    coverage: "not_applicable",
    formOpened: { instanceId: INSTANCE, templateName: "Resignation/Exit Form", revisesInstanceId: "0b6b6f0e-1111-4c2a-9a55-000000000041" },
  };

  it("is answered by the reopen path, with the form the chat puts in the thread", async () => {
    const { route, seen } = await load(null, null, null, opened);
    const response = await route.POST(
      ask({ history: [], question: "change exit for Jordan Smith", continueProposalTemplateKey: "coaching" }),
    );
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload.formOpened).toEqual(opened.formOpened);
    expect(seen.answered).toBe(0);
    expect(seen.reopen).toHaveLength(1);
    // What the reopen path is told: the question, and the proposal still on screen.
    expect(seen.reopen[0]).toMatchObject({ question: "change exit for Jordan Smith", continuingTemplateKey: "coaching" });
  });

  it("is given the conversation's open form, which it prefers when it is the one meant", async () => {
    const { route, seen } = await load(null, null, null, opened);
    await route.POST(ask({ activeFormInstanceId: INSTANCE, history: [], question: "edit the exit form" }));
    expect(seen.reopen[0]).toMatchObject({ activeInstanceId: INSTANCE });
  });

  it("is tried only after the open form's own paths, and not when one answered", async () => {
    const { route, seen } = await load(
      { content: "Revised.", citations: [], formUpdate: { instanceId: INSTANCE, updated: ["details"] } },
      null,
      null,
      opened,
    );
    await route.POST(ask({ activeFormInstanceId: INSTANCE, history: [], question: "change the details to say she called" }));
    expect(seen.revised).toHaveLength(1);
    expect(seen.reopen).toHaveLength(0);
  });

  it("is not even loaded for a turn with no edit or show verb", async () => {
    const { route, seen } = await load(null, null, null, opened);
    await route.POST(ask({ history: [], question: "what is the dress code?" }));
    expect(seen.reopen).toHaveLength(0);
    expect(seen.answered).toBe(1);
  });

  it("falls through to an ordinary answer when nothing on file was asked for", async () => {
    const { route, seen } = await load(null);
    await route.POST(ask({ history: [], question: "how do I change the schedule?" }));
    expect(seen.reopen).toHaveLength(1);
    expect(seen.answered).toBe(1);
  });
});
