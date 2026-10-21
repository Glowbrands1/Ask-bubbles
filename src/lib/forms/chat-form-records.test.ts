import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope } from "@/types";

/**
 * ============================================================================
 * "DOES ELLIE SENDGRAFF HAVE PREVIOUS COACHINGS?" — READ FROM THE FORMS REGISTER
 * ============================================================================
 *
 * Ported from the reference platform, where the assistant said it could not
 * look that up and sent the manager to the screen that holds the answer.
 *
 * These prove the gate fires on that class of question, that the read is the
 * Forms Register's own rule and nothing wider — the stores the visibility
 * names, the reader's own forms only while their stored scope still covers the
 * store, exit forms only for roles that may create them — and that the block
 * reports only what the record holds.
 *
 * The visibility RESOLVER is stubbed (it reads Woven; `forms-visibility` has
 * its own tests). Everything after it is real: `instanceListFilterFor`, the
 * `listInstances` query against the fake client, and `visibleInstances`.
 * Names and stores are synthetic.
 */

const state = vi.hoisted(() => ({
  visibility: null as AccessScope | null,
  visibilityCalls: [] as unknown[],
  fail: false,
}));

const store: FakeStore = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
};

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => fakeSupabase(store),
}));

vi.mock("./forms-visibility", () => ({
  resolveFormsVisibility: async (identity: unknown) => {
    state.visibilityCalls.push(identity);
    if (state.fail) throw new Error("db down");
    return state.visibility;
  },
}));

const {
  isFormRecordsQuestion,
  asksOnlyAboutFormsOnFile,
  candidateNameWords,
  loadFormRecords,
  FORM_RECORDS_HEADING,
} = await import("./chat-form-records");

const KEARNEY = "loc-0309";
const GRAND_ISLAND = "loc-0307";
const WORNALL = "loc-0306";

let sequence = 0;
function row(overrides: Record<string, unknown>) {
  sequence += 1;
  return {
    id: `form-${sequence}`,
    template_id: "tpl-coaching",
    template_key: "coaching",
    template_name: "Coaching Form",
    template_short_name: "Coaching",
    layout_family: "coaching",
    template_version_id: "v1",
    template_version: 1,
    variant_key: null,
    employee_name: "Ellie Sendgraff",
    employee_role: "Production Associate",
    location_id: KEARNEY,
    location_name: "NE Kearney",
    created_by: "someone-else",
    created_by_role: "location_manager",
    source: "assistant",
    status: "finalized",
    form_date: "2026-09-12",
    follow_up_date: null,
    followed_up_at: null,
    followed_up_by: null,
    finalized_at: null,
    exported_at: null,
    archived_at: null,
    revises_instance_id: null,
    created_at: `2026-09-12T15:00:${String(sequence % 60).padStart(2, "0")}Z`,
    updated_at: "2026-09-12T15:00:00Z",
    ...overrides,
  };
}

const KEARNEY_ONLY: AccessScope = { level: "location", primaryAreaId: KEARNEY, alsoCoversAreaIds: [] };

const MANAGER = {
  subject: "user-1",
  verified: true,
  role: "location_manager" as const,
  scope: KEARNEY_ONLY,
};

beforeEach(() => {
  store.form_instances.length = 0;
  state.visibility = KEARNEY_ONLY;
  state.visibilityCalls = [];
  state.fail = false;
});

describe("isFormRecordsQuestion", () => {
  it.each([
    "does employee ellie sendgraff have previous coachings",
    "Has Dana been written up before?",
    "Was she ever coached?",
    "what is Dana Moss's coaching history",
    "any open follow-ups at my store?",
    "Is there anything on file for Marcus?",
    "how many coaching forms have I filed this month",
    "show me the write-ups for Jordan",
    "Any prior corrective action for Ellie?",
    "past coaching file for ellie sendgraff",
    "does ellie have a past coaching file",
    "past ca for ellie sendgraff",
    "any past CAs for Dana?",
    "does dana have a previous CA form",
    "past corrective action form for Marcus",
    "what's in the forms register for Dana Moss",
  ])("fires on %s", (question) => {
    expect(isFormRecordsQuestion(question)).toBe(true);
  });

  it.each([
    "create a coaching form for Ellie Sendgraff",
    "do we have a coaching form?",
    "what is our corrective action process?",
    "what should I focus on today?",
    "how do I coach someone on guest greetings?",
  ])("stays quiet on %s", (question) => {
    expect(isFormRecordsQuestion(question)).toBe(false);
  });
});

describe("asksOnlyAboutFormsOnFile — the register, not a new form", () => {
  it.each([
    "does dana have a previous CA form",
    "past corrective action form for Marcus",
    "past ca for ellie sendgraff",
    "has Dana Moss been written up before?",
  ])("answers %s from the register", (question) => {
    expect(asksOnlyAboutFormsOnFile(question)).toBe(true);
  });

  it.each([
    "Create a CA for Dana Moss, she's been coached before",
    "write a CA for Dana, she has previous coachings",
    "I need a coaching form for Ellie — any prior write-ups are in the register",
    // Two new forms, not a question about existing ones.
    "coaching forms for Avery Testperson and Jordan Testperson",
  ])("keeps the form request in %s", (question) => {
    expect(asksOnlyAboutFormsOnFile(question)).toBe(false);
  });
});

describe("candidateNameWords", () => {
  it("keeps the name and drops the question's vocabulary", () => {
    expect(candidateNameWords("does employee ellie sendgraff have previous coachings")).toEqual([
      "ellie",
      "sendgraff",
    ]);
    expect(candidateNameWords("What is Dana Moss's coaching history?")).toEqual(["dana", "moss"]);
    expect(candidateNameWords("past ca for ellie sendgraff")).toEqual(["ellie", "sendgraff"]);
    expect(candidateNameWords("past coaching file for Ellie Sendgraff")).toEqual(["ellie", "sendgraff"]);
    expect(candidateNameWords("any write-ups for the store manager at my store")).toEqual([]);
  });
});

describe("loadFormRecords", () => {
  const question = "does employee ellie sendgraff have previous coachings";

  it("reads the register under the forms visibility and lists that person's forms", async () => {
    store.form_instances.push(
      row({ form_date: "2026-09-12", follow_up_date: "2026-09-26", followed_up_at: "2026-09-25T00:00:00Z" }),
      row({ form_date: "2026-10-02", status: "draft" }),
      // Another store's coaching record for the same name: never visible.
      row({ form_date: "2026-08-01", location_id: WORNALL, location_name: "MO Kansas City Wornall" }),
      row({ employee_name: "Ellie Park", form_date: "2026-07-01" }),
    );

    const result = await loadFormRecords({ actor: MANAGER, question, today: "2026-10-20" });

    // As the authorized account, with its stored scope — nothing from the request.
    expect(state.visibilityCalls).toEqual([{ subject: "user-1", role: "location_manager", scope: KEARNEY_ONLY }]);

    const block = result!.block;
    expect(block.startsWith(FORM_RECORDS_HEADING)).toBe(true);
    expect(block).toContain("Forms naming the person in the question (2)");
    expect(block).toContain("2026-09-12 — Coaching Form");
    expect(block).toContain("follow-up: Followed up");
    expect(block).toContain("2026-10-02 — Coaching Form");
    expect(block).toContain("draft — not finalized");
    expect(block).toContain("store: NE Kearney");
    expect(block).not.toContain("Wornall");
    // A first-name-only match is offered as a question, not as theirs.
    expect(block).toMatch(/Possible matches[\s\S]*Ellie Park/);
    expect(block).toContain("the stores whose forms this user may see in the Forms Register (NE Kearney)");
    expect(block).toContain("Forms → Forms Register");
    expect(block).not.toMatch(/salon|Form Monitoring/i);
  });

  it("reads every store Woven assigns them, and only those", async () => {
    state.visibility = { level: "location", primaryAreaId: KEARNEY, alsoCoversAreaIds: [GRAND_ISLAND] };
    store.form_instances.push(
      row({ form_date: "2026-09-12" }),
      row({ form_date: "2026-09-20", location_id: GRAND_ISLAND, location_name: "NE Grand Island" }),
      row({ form_date: "2026-09-25", location_id: WORNALL, location_name: "MO Kansas City Wornall" }),
    );

    const block = (await loadFormRecords({ actor: MANAGER, question, today: "2026-10-20" }))!.block;

    expect(block).toContain("Forms naming the person in the question (2)");
    expect(block).toContain("NE Grand Island");
    expect(block).not.toContain("Wornall");
    expect(block).toContain("(NE Kearney, NE Grand Island)");
  });

  it("includes a form they created at another store only while their stored scope covers it", async () => {
    // A district manager reads Kearney, but their stored scope also covers Wornall.
    const actor = {
      ...MANAGER,
      role: "district_manager" as const,
      scope: { level: "location" as const, primaryAreaId: KEARNEY, alsoCoversAreaIds: [WORNALL] },
    };
    store.form_instances.push(
      row({ form_date: "2026-09-25", location_id: WORNALL, location_name: "MO Kansas City Wornall", created_by: "user-1" }),
      // Their own, at a store neither the visibility nor the stored scope covers.
      row({ form_date: "2026-09-26", location_id: GRAND_ISLAND, location_name: "NE Grand Island", created_by: "user-1" }),
    );

    const block = (await loadFormRecords({ actor, question, today: "2026-10-20" }))!.block;

    expect(block).toContain("Forms naming the person in the question (1)");
    expect(block).toContain("MO Kansas City Wornall");
    expect(block).not.toContain("Grand Island");
  });

  it("leaves exit forms out for a role that may not create them", async () => {
    store.form_instances.push(
      row({ form_date: "2026-09-12" }),
      row({ form_date: "2026-10-01", template_key: "exit", template_name: "Resignation/Exit Form", layout_family: "exit" }),
    );

    const assistant = { ...MANAGER, role: "assistant_manager" as const };
    const forAssistant = (await loadFormRecords({ actor: assistant, question, today: "2026-10-20" }))!.block;
    expect(forAssistant).toContain("Forms naming the person in the question (1)");
    expect(forAssistant).not.toContain("Resignation/Exit Form");

    const forManager = (await loadFormRecords({ actor: MANAGER, question, today: "2026-10-20" }))!.block;
    expect(forManager).toContain("Resignation/Exit Form");
  });

  it("finds a person's older forms by name, however many newer ones there are", async () => {
    store.form_instances.push(row({ form_date: "2025-01-05", created_at: "2025-01-05T15:00:00Z" }));
    for (let index = 0; index < 80; index += 1) {
      store.form_instances.push(row({ employee_name: `Synthetic Person${String.fromCharCode(97 + (index % 26))}` }));
    }

    const block = (await loadFormRecords({ actor: MANAGER, question, today: "2026-10-20" }))!.block;
    expect(block).toContain("2025-01-05 — Coaching Form");
  });

  it("says nothing is on file when the named person has no forms, without listing anybody else's", async () => {
    store.form_instances.push(row({ employee_name: "Dana Moss" }));

    const result = await loadFormRecords({ actor: MANAGER, question, today: "2026-10-20" });

    expect(result!.block).toContain("No form on file names the person in the question");
    expect(result!.block).not.toContain("Dana Moss");
  });

  it("finds the name in the previous turn when the question names nobody", async () => {
    store.form_instances.push(row({}));

    const result = await loadFormRecords({
      actor: MANAGER,
      question: "has she been written up before?",
      previousQuestion: "tell me about ellie sendgraff",
      today: "2026-10-20",
    });

    expect(result!.block).toContain("Forms naming the person in the question (1)");
  });

  it("covers every store for an administrator", async () => {
    state.visibility = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
    store.form_instances.push(row({ location_id: WORNALL, location_name: "MO Kansas City Wornall" }));

    const result = await loadFormRecords({
      actor: { ...MANAGER, role: "admin", scope: state.visibility },
      question,
      today: "2026-10-20",
    });

    expect(result!.block).toContain("MO Kansas City Wornall");
    expect(result!.block).toContain("every store");
  });

  it("reads nothing for an unverified caller or a role without the Forms Register", async () => {
    expect(await loadFormRecords({ actor: { ...MANAGER, verified: false }, question })).toBeNull();
    expect(await loadFormRecords({ actor: { ...MANAGER, role: "employee" }, question })).toBeNull();
    expect(await loadFormRecords({ actor: { role: "admin", scope: null }, question })).toBeNull();
    expect(state.visibilityCalls).toHaveLength(0);
  });

  it("says it could not check, rather than implying nothing is on file, when the read fails", async () => {
    state.fail = true;
    const result = await loadFormRecords({ actor: MANAGER, question, today: "2026-10-20" });

    expect(result!.block).toContain("could not be read");
    expect(result!.block).toContain("Forms → Forms Register");
  });
});
