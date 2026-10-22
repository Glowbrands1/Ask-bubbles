import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";

/**
 * ============================================================================
 * A CORRECTIVE ACTION SAVED FROM THE FORM CARD KEEPS ITS SOURCED POLICY
 * ============================================================================
 *
 * Ported from the reference platform's fix for its 7 Oct 2026 feedback ("it is
 * not letting me complete it due to policy verification being incomplete even
 * though it is listed above"). Ask Bubbles had the same defect: the form card
 * saves EVERY field, and the save rewrote all of them as the manager's with no
 * provenance — so a Direct policy quote taken from the official manual lost
 * its verification the moment the manager edited anything else, and Finalize
 * then asked for an override nobody should have needed.
 *
 * Driven through the real routes the card calls: PATCH (save), GET (reopen),
 * POST finalize. Only identity and the database are stand-ins. The manual text
 * is a generic standards-of-conduct sentence and the employee is synthetic.
 */

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

vi.mock("@/lib/api/respond", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/respond")>();
  return {
    ...actual,
    assertLiveMode: () => {},
    assertNoConfigurationProblems: () => {},
    assertWithinRateLimit: () => {},
  };
});

vi.mock("@/lib/auth/server", () => ({
  authorizeRequest: async (_request: Request, permission: string) => ({
    identity: {
      subject: "qa-admin",
      email: "qa@example.test",
      displayName: "QA Admin",
      role: "admin",
      scope: { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] },
      verified: true,
    },
    permission,
    provider: "supabase",
  }),
}));

process.env.NEXT_PUBLIC_DEMO_MODE = "false";

const { ensureTemplateLibrary } = await import("@/lib/forms/repository");
const { applyAssistantDraft, createInstance } = await import("@/lib/forms/instances");
const route = await import("./instances/[id]/route");

const SOURCED = {
  grounded: true,
  verified: true,
  source: "official_policy_manual",
  documentId: "doc-manual",
  documentTitle: "Synthetic Policy Manual",
};
const POLICY_TEXT =
  "The Company expects Employees to follow rules of conduct that will protect the interests and safety of all customers, Employees, and The Company.";

function call(method: string, id: string, body?: unknown) {
  const request = new Request(`http://localhost/api/forms/instances/${id}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const handler = route[method as "GET" | "PATCH" | "POST"];
  return handler(request, { params: Promise.resolve({ id }) });
}

type Reopened = {
  values: { fieldKey: string; value: string | null; checked: string[]; filledBy: string; provenance: Record<string, unknown> }[];
  events: { kind: string; actor: string; detail: Record<string, unknown> }[];
};
const reopen = async (id: string) => (await (await call("GET", id)).json()) as Reopened;
const row = (form: Reopened, key: string) => form.values.find((entry) => entry.fieldKey === key);

async function draftedCorrectiveForm() {
  const instance = await createInstance({
    templateKey: "dpoa",
    variantKey: null,
    employeeName: "Jordan Testperson",
    createdBy: "qa-admin",
    source: "assistant",
    locationId: null,
  });
  await applyAssistantDraft(
    instance.id,
    {
      values: {
        observation: "Observed:\nThe closing checklist was not completed.",
        action_plan: "Complete the closing checklist on every assigned close.",
        policy_language: POLICY_TEXT,
      },
      checked: { offense_type: ["standards_of_conduct", "dress_code"] },
    },
    "bubbles",
    { policy_language: SOURCED },
  );
  return instance.id;
}

/** What the card sends: every value and every tick it holds, with the manager's edits. */
async function cardSave(id: string, edits: Record<string, string>, checkedEdits: Record<string, string[]> = {}) {
  const opened = await reopen(id);
  const values = Object.fromEntries(
    opened.values.filter((entry) => entry.value !== null).map((entry) => [entry.fieldKey, entry.value!]),
  );
  const checked = Object.fromEntries(
    opened.values.filter((entry) => entry.checked.length > 0).map((entry) => [entry.fieldKey, entry.checked]),
  );
  return call("PATCH", id, { values: { ...values, ...edits }, checked: { ...checked, ...checkedEdits } });
}

beforeEach(async () => {
  for (const key of Object.keys(store)) store[key as keyof FakeStore] = [];
  await ensureTemplateLibrary("system");
});

describe("Corrective Action Form: draft, edit, save, reopen, finalize", () => {
  it("keeps the sourced policy when the manager edits other fields, and finalizes without an override", async () => {
    const id = await draftedCorrectiveForm();

    const saved = await cardSave(id, { prior_actions: "Written CA — signed 08/31/2026" });
    expect(saved.status).toBe(200);

    const reopened = await reopen(id);
    const policy = row(reopened, "policy_language")!;
    expect(policy.value).toBe(POLICY_TEXT);
    expect(policy.filledBy).toBe("ai");
    expect(policy.provenance).toEqual(SOURCED);
    expect(row(reopened, "prior_actions")!.filledBy).toBe("manager");

    const finalized = await call("POST", id, { action: "finalize" });
    expect(finalized.status, JSON.stringify(await finalized.clone().json())).toBe(200);
    const event = (await reopen(id)).events.find((entry) => entry.kind === "finalized")!;
    expect(event.detail.policyVerificationOverride).toBeUndefined();
    expect(event.detail.unverifiedPolicy).toBeUndefined();
  });

  it("the same ticks in another order are not an edit", async () => {
    const id = await draftedCorrectiveForm();
    await cardSave(id, {}, { offense_type: ["dress_code", "standards_of_conduct"] });
    expect(row(await reopen(id), "offense_type")!.filledBy).toBe("ai");
  });

  it("a changed tick is the manager's", async () => {
    const id = await draftedCorrectiveForm();
    await cardSave(id, {}, { offense_type: ["standards_of_conduct"] });
    const offense = row(await reopen(id), "offense_type")!;
    expect(offense.checked).toEqual(["standards_of_conduct"]);
    expect(offense.filledBy).toBe("manager");
  });

  it("asks again once the manager rewrites the policy, and records the override", async () => {
    const id = await draftedCorrectiveForm();
    await cardSave(id, { policy_language: `${POLICY_TEXT} (paraphrased by me)` });

    const policy = row(await reopen(id), "policy_language")!;
    expect(policy.filledBy).toBe("manager");
    expect(policy.provenance).toEqual({});

    const refused = await call("POST", id, { action: "finalize" });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({
      code: "policy_verification_required",
      fields: ["policy_language"],
    });

    const anyway = await call("POST", id, { action: "finalize", acknowledgeUnverifiedPolicy: true });
    expect(anyway.status).toBe(200);
    const event = (await reopen(id)).events.find((entry) => entry.kind === "finalized")!;
    expect(event.actor).toBe("qa-admin");
    expect(event.detail.unverifiedPolicy).toEqual(["policy_language"]);
    expect(event.detail.policyVerificationOverride).toBe(true);
  });

  it("clearing a field the model wrote is an edit", async () => {
    const id = await draftedCorrectiveForm();
    await cardSave(id, { action_plan: "" });
    const plan = row(await reopen(id), "action_plan");
    // Cleared by the manager: no longer the model's text.
    expect(plan?.value ?? "").not.toContain("Complete the closing checklist");
  });
});
