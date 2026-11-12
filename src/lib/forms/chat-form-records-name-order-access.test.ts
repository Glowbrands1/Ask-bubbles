import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope } from "@/types";

/**
 * ============================================================================
 * NAME-ORDER MATCHES IN THE FORMS ON FILE BLOCK FOLLOW THE FORMS REGISTER'S ACCESS (QA, Bubbles 17h live test,
 * 11 Nov 2026)
 * ============================================================================
 *
 * As Admin, "Corrective action for Team Member <name not on the roster>" got no card. The reply listed drafts "on file
 * for an employee listed as <the same name, last name first>" at another store. The question asked here: could a store
 * manager see ANOTHER store's employee's form history this way? The name match ignores word order
 * (`matchRowsToQuestion`), so a reversed name is a full match. These tests prove the rows come only through the Forms
 * Register's own filter: an administrator sees them, the manager of the store that holds them sees them, and a manager
 * of another store sees neither the rows nor the name. The visibility resolver is stubbed, as in
 * `chat-form-records.test.ts`; `instanceListFilterFor`, the query and `visibleInstances` are real. Names are invented.
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

const { loadFormRecords } = await import("./chat-form-records");

const KEARNEY = "loc-0309";
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
    employee_name: "Tallis Wren",
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

/** The tester's wording; the person is invented and not on the roster. */
const QUESTION = "Corrective action for Team Member Wren Tallis";
const WORNALL_ONLY: AccessScope = { level: "location", primaryAreaId: WORNALL, alsoCoversAreaIds: [] };
const EVERY_STORE: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

/** Drafts filed at Wornall for the same person, last name first. */
function wornallDrafts(): void {
  store.form_instances.push(
    row({ template_key: "dpoa", template_name: "Corrective Action Form", status: "draft", location_id: WORNALL, location_name: "MO Kansas City Wornall" }),
    row({ template_key: "dpoa", template_name: "Corrective Action Form", status: "draft", location_id: WORNALL, location_name: "MO Kansas City Wornall" }),
    row({ status: "draft", location_id: WORNALL, location_name: "MO Kansas City Wornall" }),
  );
}

async function blockFor(role: "admin" | "location_manager", scope: AccessScope): Promise<string> {
  state.visibility = scope;
  const result = await loadFormRecords({ actor: { ...MANAGER, role, scope }, question: QUESTION, today: "2026-11-11" });
  return result?.block ?? "";
}

describe("a reversed name in \"Corrective action for Team Member Wren Tallis\": the Forms Register's access, nothing wider", () => {
  it("an administrator (every store) is shown the Wornall drafts filed as \"Tallis Wren\" (the live reply)", async () => {
    wornallDrafts();
    const block = await blockFor("admin", EVERY_STORE);
    expect(block).toContain("Tallis Wren");
    expect(block).toContain("MO Kansas City Wornall");
  });

  it("the manager of the store holding them (Wornall) is shown them too", async () => {
    wornallDrafts();
    const block = await blockFor("location_manager", WORNALL_ONLY);
    expect(block).toContain("Tallis Wren");
  });

  it("NO LEAK: a manager of another store (Kearney) sees neither the drafts, the store nor the name", async () => {
    wornallDrafts();
    const block = await blockFor("location_manager", KEARNEY_ONLY);
    expect(block, block).not.toContain("Tallis Wren");
    expect(block, block).not.toContain("Wornall");
    expect(block, block).not.toMatch(/Corrective Action Form/);
    // The visibility asked for is the caller's own, never a wider one.
    expect(state.visibilityCalls).toEqual([{ subject: "user-1", role: "location_manager", scope: KEARNEY_ONLY }]);
  });
});

describe("FORMS_ON_FILE_ORDER_MATCH_POSSIBLE: a reversed name is a possible match, never the person's own", () => {
  const FLAG = "FORMS_ON_FILE_ORDER_MATCH_POSSIBLE_ENABLED";

  it("flag off (as on main 8ff2e3ba): \"Tallis Wren\" is listed as naming the person asked about", async () => {
    // The off behaviour pins its own flag off, so it holds once production turns the flag on (Gate-Sunny's off-pin on the
    // sibling app, 12 Nov 2026).
    vi.stubEnv(FLAG, "");
    try {
      wornallDrafts();
      const block = await blockFor("admin", EVERY_STORE);
      expect(block).toMatch(/Forms naming the person in the question \(\d+\)[\s\S]*Tallis Wren/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("flag on: \"Tallis Wren\" is a possible match, and \"Wren Tallis\" still names them", async () => {
    process.env[FLAG] = "true";
    try {
      wornallDrafts();
      const reversed = await blockFor("admin", EVERY_STORE);
      expect(reversed).not.toMatch(/Forms naming the person in the question/);
      expect(reversed).toMatch(/Possible matches[\s\S]*Tallis Wren/);

      store.form_instances.length = 0;
      store.form_instances.push(row({ employee_name: "Wren Tallis", location_id: WORNALL, location_name: "MO Kansas City Wornall" }));
      const same = await blockFor("admin", EVERY_STORE);
      expect(same).toMatch(/Forms naming the person in the question \(1\)[\s\S]*Wren Tallis/);
    } finally {
      delete process.env[FLAG];
    }
  });
});

describe("R795F (QA, 12 Nov 2026): a name written \"Last, First\" is the asked order", () => {
  const FLAG = "FORMS_ON_FILE_ORDER_MATCH_POSSIBLE_ENABLED";

  it("flag on: \"CA for Calder, Remy\" names Remy Calder's forms; \"CA for Calder Remy\" (no comma) stays possible", async () => {
    const { matchRowsToQuestion, candidateNameWords } = await import("./chat-form-records");
    const remy = { id: "f-remy", employeeName: "Remy Calder" } as never;
    process.env[FLAG] = "true";
    try {
      const comma = "CA for Calder, Remy";
      expect(matchRowsToQuestion([remy], candidateNameWords(comma), comma).named).toHaveLength(1);
      const bare = "CA for Calder Remy";
      const split = matchRowsToQuestion([remy], candidateNameWords(bare), bare);
      expect(split.named).toHaveLength(0);
      expect(split.possible).toHaveLength(1);
    } finally {
      delete process.env[FLAG];
    }
  });
});
