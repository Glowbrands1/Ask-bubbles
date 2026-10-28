import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMigratedTestDatabase } from "@/test/pglite-knowledge-db";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";

/**
 * QA, 28 Oct 2026: a finalized form whose only open revision draft is
 * ARCHIVED, and "Edit as new draft" pressed again. The unique index
 * `form_instances_one_open_revision` (open drafts, archived or not) is modelled
 * as in t9. The answer must be the archived draft reopened (as Ask Sunny does
 * today), never an error. Whether `findOpenRevision` filters archived drafts
 * is Pau's decision (protected file); this pins what the manager gets.
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

/** Whether the fake refuses a second open draft of one form, as the index does. */
let indexApplied = false;

type Result = { data: unknown; error: unknown };

/**
 * The index, modelled where the fake inserts: the check and the insert run in
 * the same synchronous step, as the database does them in one statement.
 */
function withOneOpenRevision(client: ReturnType<typeof fakeSupabase>) {
  return {
    from(table: string) {
      const query = client.from(table);
      if (table !== "form_instances") return query;
      const insert = query.insert.bind(query);
      (query as { insert: unknown }).insert = (payload: Record<string, unknown>) => {
        const real = insert(payload as never);
        const refused = () =>
          indexApplied &&
          !Array.isArray(payload) &&
          payload.status === "draft" &&
          payload.revises_instance_id != null &&
          store.form_instances.some(
            (row) => row.status === "draft" && row.revises_instance_id === payload.revises_instance_id,
          );
        const chain = {
          select: () => chain,
          single: () => {
            real.single();
            return chain;
          },
          then: (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) =>
            refused()
              ? Promise.resolve({
                  data: null,
                  error: {
                    code: "23505",
                    message: 'duplicate key value violates unique constraint "form_instances_one_open_revision"',
                  },
                }).then(resolve, reject)
              : real.then(resolve as never, reject),
        };
        return chain;
      };
      return query;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => withOneOpenRevision(fakeSupabase(store)),
}));

const { ensureTemplateLibrary } = await import("./repository");
const { createInstance, reviseInstance } = await import("./instances");

beforeEach(async () => {
  store.form_instances = [];
  store.form_instance_values = [];
  store.form_instance_events = [];
  store.form_template_versions = [];
  store.form_templates = [];
  store.form_template_current = [];
  store.form_template_assets = [];
  indexApplied = false;
  await ensureTemplateLibrary("system");
});

async function finalizedCoachingForm() {
  const instance = await createInstance({
    templateKey: "coaching",
    variantKey: null,
    employeeName: "Rowan Pell",
    employeeRole: "Store Associate",
    locationId: "loc-1",
    locationName: "Test Store",
    createdBy: "manager-a",
    source: "manual",
    formDate: "2026-10-20",
  });
  const row = store.form_instances.find((entry) => entry.id === instance.id)!;
  row.status = "finalized";
  row.finalized_at = "2026-10-20T12:00:00Z";
  return instance;
}

const openRevisionsOf = (id: string) =>
  store.form_instances.filter((row) => row.status === "draft" && row.revises_instance_id === id);

describe("an archived open revision draft, and Edit as new draft again", () => {
  it("returns that draft, never a duplicate-key error", async () => {
    indexApplied = true;
    const original = await finalizedCoachingForm();
    const first = await reviseInstance(original.id, "manager-a", "revised");
    store.form_instances.find((entry) => entry.id === first.id)!.archived_at = "2026-10-27T12:00:00Z";
    const again = await reviseInstance(original.id, "manager-a", "revised");
    expect(again.id).toBe(first.id);
    expect(openRevisionsOf(original.id)).toHaveLength(1);
  });
});
