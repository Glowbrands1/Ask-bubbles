import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";

import type { FormDocument } from "./document";

/**
 * ============================================================================
 * ONE DRAFT PER REQUEST, DATED ON THE BUSINESS DAY
 * ============================================================================
 *
 * Two persisted-state guarantees, asserted on the stored rows:
 *
 *   1. DUPLICATES. A chat create whose response was lost, or the same card
 *      pressed in a second tab, used to file a second record. The server now
 *      finds the draft this manager started from chat for this form, person
 *      and location in the last few minutes and returns it
 *      (`findRecentAssistantDraft`). Another manager's draft, a finalized
 *      form, a different person, a different location or an older draft is
 *      never returned.
 *
 *   2. THE DATE. A form with no typed date was dated by the database's
 *      `current_date` — the UTC day — so a form started at 9:30pm Eastern was
 *      dated tomorrow. It is now always written as the business day.
 *
 * All people are synthetic.
 */

const store: FakeStore = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
};

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => fakeSupabase(store),
}));

const { createInstance, findRecentAssistantDraft, DUPLICATE_DRAFT_WINDOW_MINUTES } = await import("./instances");

const TEMPLATE_ID = "tpl-coaching";
const V2 = "version-2";

/** The shape replacing it: a different list, and a section v1 does not have. */
function documentV2(): FormDocument {
  return {
    paper: "letter",
    blocks: [
      { kind: "letterhead", brand: "EXAMPLE BRAND", title: "Coaching Form" },
      { kind: "section", label: "Employee Information" },
      {
        kind: "field_row",
        fields: [
          { key: "employee_name", label: "Employee Name", input: "text", responsibility: "system" },
          { key: "form_date", label: "Date", input: "date", responsibility: "system" },
        ],
      },
      { kind: "section", label: "NEW OFFICIAL SECTION" },
      {
        kind: "checkbox_group",
        key: "coaching_topics",
        label: "Topic Of Coaching",
        options: [
          { key: "new_topic_punctuality", label: "NEW TOPIC PUNCTUALITY" },
          { key: "new_topic_other", label: "NEW TOPIC OTHER" },
        ],
        responsibility: "ai",
        columns: 2,
      },
      {
        kind: "field",
        field: {
          key: "coaching_details",
          label: "Details",
          input: "long_text",
          responsibility: "ai",
        },
      },
    ],
  };
}

function versionRow(id: string, version: number, document: FormDocument) {
  return {
    id,
    template_id: TEMPLATE_ID,
    version,
    status: "published",
    document,
    variants: [],
    notes: "",
    created_by: "system",
    created_at: `2026-0${version}-01T00:00:00Z`,
    published_at: `2026-0${version}-01T00:00:00Z`,
    published_by: "system",
  };
}


beforeEach(() => {
  store.form_instances.length = 0;
  store.form_instance_values.length = 0;
  store.form_instance_events.length = 0;
  store.form_template_versions.length = 0;
  store.form_templates!.length = 0;
  store.form_template_current!.length = 0;
  store.form_templates!.push({ id: TEMPLATE_ID, key: "coaching", active: true });
  store.form_template_versions.push(versionRow(V2, 2, documentV2()));
  store.form_template_current!.push({ template_id: TEMPLATE_ID, version_id: V2 });
});

afterEach(() => {
  vi.useRealTimers();
});

function start(overrides: Partial<Parameters<typeof createInstance>[0]> = {}) {
  return createInstance({
    templateKey: "coaching",
    variantKey: null,
    employeeName: "Avery Testperson",
    locationId: "loc-0101",
    locationName: null,
    createdBy: "manager-a",
    createdByRole: "location_manager",
    source: "assistant",
    ...overrides,
  });
}

const lookup = (overrides: Partial<Parameters<typeof findRecentAssistantDraft>[0]> = {}) =>
  findRecentAssistantDraft({
    templateKey: "coaching",
    employeeName: "Avery Testperson",
    createdBy: "manager-a",
    locationId: "loc-0101",
    ...overrides,
  });

describe("the same draft, asked for twice, is one draft", () => {
  it("finds the draft this manager just started, in any case and spacing of the name", async () => {
    const first = await start();
    expect((await lookup())?.id).toBe(first.id);
    expect((await lookup({ employeeName: "  avery   TESTPERSON " }))?.id).toBe(first.id);
    expect(store.form_instances).toHaveLength(1);
  });

  it.each([
    ["another manager", { createdBy: "manager-b" }],
    ["another person", { employeeName: "Jordan Testperson" }],
    ["another location", { locationId: "loc-0202" }],
    ["another form", { templateKey: "dpoa" }],
  ])("never returns a draft for %s", async (_label, overrides) => {
    await start();
    expect(await lookup(overrides as never)).toBeNull();
  });

  it("never returns a finalized form, or one created outside chat", async () => {
    const finalized = await start();
    store.form_instances.find((row) => row.id === finalized.id)!.status = "finalized";
    await start({ source: "manual" });
    expect(await lookup()).toBeNull();
  });

  it(`only inside the ${DUPLICATE_DRAFT_WINDOW_MINUTES}-minute window`, async () => {
    const first = await start();
    const row = store.form_instances.find((entry) => entry.id === first.id)!;
    row.created_at = new Date(Date.now() - (DUPLICATE_DRAFT_WINDOW_MINUTES + 1) * 60_000).toISOString();
    expect(await lookup()).toBeNull();
    row.created_at = new Date(Date.now() - (DUPLICATE_DRAFT_WINDOW_MINUTES - 1) * 60_000).toISOString();
    expect((await lookup())?.id).toBe(first.id);
  });

  it("an unknown template is no draft, not an error", async () => {
    expect(await lookup({ templateKey: "no-such-form" })).toBeNull();
  });
});

describe("a form with no typed date is dated on the business day", () => {
  it("at 9:30pm Eastern the form is dated today, not tomorrow's UTC date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T01:30:00Z")); // 21:30 on 8 October in New York
    const form = await start();
    const row = store.form_instances.find((entry) => entry.id === form.id)!;
    expect(row.form_date).toBe("2026-10-08");
    const seeded = store.form_instance_values.find(
      (entry) => entry.instance_id === form.id && entry.field_key === "form_date",
    );
    expect(seeded?.value).toBe("2026-10-08");
  });

  it("a date the manager typed is kept as typed", async () => {
    const form = await start({ formDate: "2026-09-27" });
    expect(store.form_instances.find((entry) => entry.id === form.id)!.form_date).toBe("2026-09-27");
  });
});
