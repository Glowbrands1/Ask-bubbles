import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * THE SIX EMPLOYEE PERFORMANCE PLANS ARE HIDDEN (QA DECISION, 26 OCT 2026)
 * ============================================================================
 *
 * The SDIT, TSD, ASD-SDIT and FTTC EPPs and both DMIT EPP readings came over
 * from the sibling app with the rest of the library and carry its content;
 * Buff City Soap has no EPP of its own yet. Production has no form filed from
 * any of them. QA decided to hide all six the way the three interview forms
 * are hidden: `HIDDEN_TEMPLATE_KEYS` (`config/company/forms/hidden.ts`).
 *
 * Every place a district manager — the role that holds `create_epp` — could be
 * offered one or reach one is checked here: the template list, the forms
 * library the chat reads, the proposal flow for the plan named in the
 * manager's words, the EPP picker, and `POST /api/forms/instances`. Each
 * refuses the same way it refuses the hidden Tanning Consultant Interview
 * (`app/api/chat/hidden-form-no-card-oct25.test.ts`): "not published", and no
 * card. Every other template is listed exactly as before. The name below is
 * invented.
 */

const EPP_KEYS = ["sdit-epp", "tsd-epp", "asd-sdit-epp", "fttc-epp", "dmit-epp-tsd", "dmit-epp-dmit"] as const;
const INTERVIEW_KEYS = ["tanning-consultant-interview", "management-interview-round-1", "management-interview-round-2"] as const;
const NAME = "Rowan Placeholder";
const NOT_PUBLISHED = /not published in Ask Bubbles/;
/** Any of the six plans, by the name or short name the library prints. */
const AN_EPP = /\bEPP\b|Performance Plan/i;

const store: FakeStore = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
};

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));
vi.mock("@/lib/api/respond", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/respond")>()),
  assertLiveMode: () => {},
  assertNoConfigurationProblems: () => {},
  assertWithinRateLimit: () => {},
}));
const LOCATION_SCOPE = { level: "location", primaryAreaId: "loc-0310", alsoCoversAreaIds: [] } as AccessScope;
vi.mock("@/lib/auth/server", async () => {
  const { AuthError } = await import("@/lib/auth/types");
  const { DEFAULT_PERMISSION_MATRIX, hasPermission } = await import("@/lib/permissions");
  return {
    authorizeRequest: async (_request: Request, permission: string) => {
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, "district_manager" as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: "qa-dm",
          email: "qa-dm@example.test",
          displayName: "QA District Manager",
          role: "district_manager",
          scope: { level: "location", primaryAreaId: "loc-0310", alsoCoversAreaIds: [] },
          verified: true,
        },
        permission,
        provider: "supabase",
      };
    },
  };
});
vi.mock("@/lib/forms/employee-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return {
    ...actual,
    loadScopedRoster: async (scope: AccessScope | null) => actual.scopeRoster([], scope),
    loadScopedRosterResult: async () => ({ status: "not_checked", reason: "no_scope" }),
  };
});

const { HIDDEN_TEMPLATE_KEYS, isHiddenTemplate } = await import("@/config/company/forms/hidden");
const { ensureTemplateLibrary, getTemplateByKey, listTemplateSummaries } = await import("./repository");
const { TEMPLATE_SEEDS } = await import("./library");
const { buildFormInventory, publishedEntries } = await import("./inventory");
const { buildFormInventoryBlock } = await import("@/lib/ai/form-answers");
const { proposeFormForTurn } = await import("@/lib/ai/form-proposal");
const instancesRoute = await import("@/app/api/forms/instances/route");

const DM = { role: "district_manager" as const, scope: LOCATION_SCOPE };
let turn = 0;
const said = (content: string): ChatMessage => ({ id: `m-${(turn += 1)}`, role: "user", content, createdAt: "2026-10-26T15:00:00Z" });

async function propose(question: string, earlier: readonly string[] = []) {
  const history = earlier.map(said);
  const asked = said(question);
  return proposeFormForTurn({
    history,
    question,
    questionMessageId: asked.id,
    actor: DM as never,
    summaries: await listTemplateSummaries(),
    today: "2026-10-26",
  });
}

beforeAll(async () => {
  await ensureTemplateLibrary("system");
});
beforeEach(() => {
  store.form_instances = [];
});

describe("the six EPP templates are hidden in this deployment", () => {
  it("all six are on the hidden list, after the three interviews", () => {
    expect([...HIDDEN_TEMPLATE_KEYS]).toEqual([...INTERVIEW_KEYS, ...EPP_KEYS]);
    for (const key of EPP_KEYS) expect(isHiddenTemplate(key), key).toBe(true);
  });

  it("their seeds and rows are untouched: still in the library, still active", async () => {
    for (const key of EPP_KEYS) {
      expect(TEMPLATE_SEEDS.map((seed) => seed.key), key).toContain(key);
      expect((await getTemplateByKey(key))?.active, key).toBe(true);
    }
  });
});

describe("(i) none of the six is offered", () => {
  it("the template list (Form Templates, GET /api/forms/templates, the chat's library) leaves them out", async () => {
    const keys = (await listTemplateSummaries()).map((summary) => summary.key);
    for (const key of EPP_KEYS) expect(keys, key).not.toContain(key);
  });

  it("the forms inventory — 'which forms can I create' — and the library block the model reads name none of them", async () => {
    const inventory = buildFormInventory(await listTemplateSummaries(), DM);
    for (const key of EPP_KEYS) expect(inventory.entries.map((entry) => entry.templateKey), key).not.toContain(key);
    expect(publishedEntries(inventory).map((entry) => entry.name).join("\n")).not.toMatch(AN_EPP);
    expect(buildFormInventoryBlock(inventory)).not.toMatch(AN_EPP);
  });

  it.each([
    `create an sdit epp for ${NAME}`,
    `Create an SDIT EPP for ${NAME}`,
    `do a tsd epp for ${NAME}`,
    `Do a TSD EPP for ${NAME}`,
    `create an asd-sdit epp for ${NAME}`,
    `Create an FTTC EPP for ${NAME}`,
    `create a dmit epp tsd review for ${NAME}`,
    `Create a DMIT EPP DMIT review for ${NAME}`,
    `Create a Management Performance Plan for ${NAME}`,
  ])("%s: not published, and no card — the hidden interviews' answer", async (question) => {
    const reply = await propose(question);
    expect(reply?.formProposal, reply?.content).toBeUndefined();
    expect(reply?.content).toMatch(NOT_PUBLISHED);
    // The list of what can be started instead names no plan.
    expect(reply?.content).not.toMatch(AN_EPP);
  });

  it("the hidden interviews answer the same way today (the outcome the plans now share)", async () => {
    const reply = await propose(`create a tanning consultant interview form for ${NAME}`);
    expect(reply?.formProposal).toBeUndefined();
    expect(reply?.content).toMatch(NOT_PUBLISHED);
  });

  it("a role stated earlier plus 'make an EPP' does not reach the SDIT plan", async () => {
    const reply = await propose("make an EPP from this conversation", [`${NAME} is an SDIT at our store and has been late several times.`]);
    expect(reply?.formProposal?.templateKey ?? null).toBeNull();
    expect(JSON.stringify(reply?.formSelection ?? null)).not.toMatch(AN_EPP);
  });

  it("the plain family ('create an epp') offers no plan in its picker", async () => {
    const reply = await propose(`create an epp for ${NAME}`);
    expect(reply?.formProposal?.templateKey ?? null).toBeNull();
    expect(JSON.stringify(reply?.formSelection ?? null)).not.toMatch(AN_EPP);
  });

  it("a proposal carried over from before the change (continueTemplateKey) opens no card", async () => {
    const asked = said("yes");
    const reply = await proposeFormForTurn({
      history: [],
      question: "yes",
      questionMessageId: asked.id,
      actor: DM as never,
      continueTemplateKey: "sdit-epp",
      summaries: await listTemplateSummaries(),
      today: "2026-10-26",
    });
    expect(reply?.formProposal?.templateKey ?? null).not.toBe("sdit-epp");
  });

  it.each(EPP_KEYS)("POST /api/forms/instances refuses %s with a 404 and creates nothing", async (key) => {
    const response = await instancesRoute.POST(
      new Request("https://app.test/api/forms/instances", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateKey: key, employeeName: NAME, variantKey: null }),
      }),
    );
    expect(response.status).toBe(404);
    expect(store.form_instances).toHaveLength(0);
  });
});

describe("(ii) every other template is listed exactly as before", () => {
  it("the list is the library minus the nine hidden templates, each active and published under its own name", async () => {
    const summaries = await listTemplateSummaries();
    const hidden = new Set<string>([...INTERVIEW_KEYS, ...EPP_KEYS]);
    const expected = TEMPLATE_SEEDS.filter((seed) => !hidden.has(seed.key));
    expect(summaries.map((summary) => summary.key).sort()).toEqual(expected.map((seed) => seed.key).sort());
    expect(summaries.length).toBe(TEMPLATE_SEEDS.length - 9);
    for (const seed of expected) {
      const summary = summaries.find((entry) => entry.key === seed.key)!;
      expect(summary.name, seed.key).toBe(seed.name);
      expect(summary.active, seed.key).toBe(true);
      expect(summary.currentVersion?.status, seed.key).toBe("published");
    }
  });

  it("a form outside the six still makes its card", async () => {
    const reply = await propose(`create a coaching form for ${NAME}, late to her shift on 10-20`);
    expect(reply?.formProposal?.templateKey).toBe("coaching");
  });
});
