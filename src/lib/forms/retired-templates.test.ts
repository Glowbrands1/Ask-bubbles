import { beforeEach, describe, expect, it, vi } from "vitest";

import { EXAMPLE_CHECK_IN_KEY, EXAMPLE_CHECK_IN_SEED } from "@/config/company/forms/example-check-in";
import { RETIRED_TEMPLATE_KEYS } from "@/config/company/forms/retired";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";

/**
 * ============================================================================
 * THE PLACEHOLDER FORM IS SWITCHED OFF, NEVER DELETED
 * ============================================================================
 *
 * "Team Member Check-In (Example)" was this deployment's only template before
 * the migrated HR library. With all the migrated forms through QA it is retired:
 * the next library install sets it inactive. Its template row, its versions
 * and every check-in already filed stay exactly as they are.
 *
 * The Tanning Consultant Interview Form joined it on 21 Nov 2026 (the sibling
 * company's role, not a Buff City Soap form; Pau, via QA): its seed was removed
 * from the hiring library and its key retired, so a row already installed is
 * switched off the same way and never deleted.
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

const { ensureTemplateLibrary, getTemplateByKey, listTemplateSummaries } = await import("./repository");
const { createInstance, loadInstance } = await import("./instances");

/** The database as it stands today: the placeholder installed, published, with one check-in filed. */
function withPlaceholderInstalled() {
  store.form_templates!.push({
    id: "tpl-example",
    key: EXAMPLE_CHECK_IN_KEY,
    name: EXAMPLE_CHECK_IN_SEED.name,
    short_name: EXAMPLE_CHECK_IN_SEED.shortName,
    description: EXAMPLE_CHECK_IN_SEED.description,
    category: "examples",
    layout_family: EXAMPLE_CHECK_IN_SEED.layoutFamily,
    required_permission: EXAMPLE_CHECK_IN_SEED.requiredPermission,
    display_order: 99,
    active: true,
  });
  store.form_template_versions.push({
    id: "ver-example-1",
    template_id: "tpl-example",
    version: 1,
    status: "published",
    document: EXAMPLE_CHECK_IN_SEED.document,
    variants: [],
    seed_revision: 1,
  });
  store.form_template_current!.push({ template_id: "tpl-example", version_id: "ver-example-1" });
  store.form_instances.push({
    id: "check-in-1",
    template_id: "tpl-example",
    template_version_id: "ver-example-1",
    variant_key: null,
    employee_name: "Jordan Testperson",
    status: "finalized",
    source: "manual",
    created_by: "manager-1",
    form_date: "2026-09-30",
    // The columns the overview view joins in.
    template_key: EXAMPLE_CHECK_IN_KEY,
    template_name: EXAMPLE_CHECK_IN_SEED.name,
    layout_family: EXAMPLE_CHECK_IN_SEED.layoutFamily,
    template_version: 1,
  });
}

beforeEach(() => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
});

describe("retiring the placeholder", () => {
  // Two keys, not one: the Tanning Consultant Interview was retired on 21 Nov 2026 (Pau). See the block below.
  it("is one of the two retired keys", () => {
    expect(RETIRED_TEMPLATE_KEYS).toEqual([EXAMPLE_CHECK_IN_KEY, TCI_KEY]);
  });

  it("switches it off on the next install, and says so", async () => {
    withPlaceholderInstalled();
    const result = await ensureTemplateLibrary("system");
    expect(result.retired).toEqual([EXAMPLE_CHECK_IN_KEY]);
    expect((await getTemplateByKey(EXAMPLE_CHECK_IN_KEY))?.active).toBe(false);
  });

  it("deletes nothing: the template, its version and the filed check-in are all still there", async () => {
    withPlaceholderInstalled();
    const versions = JSON.stringify(store.form_template_versions.filter((row) => row.template_id === "tpl-example"));
    const filed = JSON.stringify(store.form_instances);
    await ensureTemplateLibrary("system");
    expect(store.form_templates!.filter((row) => row.key === EXAMPLE_CHECK_IN_KEY)).toHaveLength(1);
    expect(JSON.stringify(store.form_template_versions.filter((row) => row.template_id === "tpl-example"))).toBe(versions);
    expect(store.form_template_current!.find((row) => row.template_id === "tpl-example")?.version_id).toBe("ver-example-1");
    expect(JSON.stringify(store.form_instances)).toBe(filed);
  });

  it("a check-in already filed still opens against the version it was pinned to", async () => {
    withPlaceholderInstalled();
    await ensureTemplateLibrary("system");
    const loaded = await loadInstance("check-in-1");
    expect(loaded?.instance.templateKey).toBe(EXAMPLE_CHECK_IN_KEY);
    expect(loaded?.version.id).toBe("ver-example-1");
  });

  it("can no longer be chosen for a new form", async () => {
    withPlaceholderInstalled();
    await ensureTemplateLibrary("system");
    await expect(
      createInstance({ templateKey: EXAMPLE_CHECK_IN_KEY, variantKey: null, employeeName: "Jordan Testperson", createdBy: "manager-1" } as never),
    ).rejects.toThrow("not active");
    const summary = (await listTemplateSummaries()).find((entry) => entry.key === EXAMPLE_CHECK_IN_KEY);
    expect(summary?.active).toBe(false);
  });

  it("is retired once: a second install changes nothing and reports nothing", async () => {
    withPlaceholderInstalled();
    await ensureTemplateLibrary("system");
    const after = JSON.stringify(store.form_templates);
    const again = await ensureTemplateLibrary("system");
    expect(again.retired).toBeUndefined();
    expect(JSON.stringify(store.form_templates)).toBe(after);
  });

  it("a fresh database never installs it at all", async () => {
    await ensureTemplateLibrary("system");
    expect(await getTemplateByKey(EXAMPLE_CHECK_IN_KEY)).toBeNull();
    // Sixteen, not seventeen: the Tanning Consultant Interview was removed from the library (Pau, 21 Nov 2026).
    expect(store.form_templates).toHaveLength(16);
  });
});

/* ------------------------------------------- the Tanning Consultant Interview --- */

const TCI_KEY = "tanning-consultant-interview";

/** The database as production has it: the interview installed and published, with one form filed against it. */
function withTanningConsultantInterviewInstalled() {
  store.form_templates!.push({
    id: "tpl-tci",
    key: TCI_KEY,
    name: "Tanning Consultant Interview Form",
    short_name: "Tanning Consultant Interview",
    description: "Interview form.",
    category: "hiring",
    layout_family: "interview",
    required_permission: "forms.create",
    display_order: 40,
    active: true,
  });
  store.form_template_versions.push({
    id: "ver-tci-1",
    template_id: "tpl-tci",
    version: 1,
    status: "published",
    document: { paper: "letter", blocks: [{ kind: "letterhead", brand: "BUFF CITY SOAP", title: "Tanning Consultant Interview Form" }] },
    variants: [],
    seed_revision: 1,
  });
  store.form_template_current!.push({ template_id: "tpl-tci", version_id: "ver-tci-1" });
  store.form_instances.push({
    id: "tci-1",
    template_id: "tpl-tci",
    template_version_id: "ver-tci-1",
    variant_key: null,
    employee_name: "Jordan Testperson",
    status: "finalized",
    source: "manual",
    created_by: "manager-1",
    form_date: "2026-10-30",
    template_key: TCI_KEY,
    template_name: "Tanning Consultant Interview Form",
    layout_family: "interview",
    template_version: 1,
  });
}

describe("retiring the Tanning Consultant Interview (Pau, 21 Nov 2026)", () => {
  it("is no longer in the code library", async () => {
    const { TEMPLATE_SEEDS } = await import("./library");
    expect(TEMPLATE_SEEDS.map((seed) => seed.key)).not.toContain(TCI_KEY);
    expect(RETIRED_TEMPLATE_KEYS).toContain(TCI_KEY);
  });

  it("an installed row is switched off on the next install, and the install says so", async () => {
    withTanningConsultantInterviewInstalled();
    const result = await ensureTemplateLibrary("system");
    expect(result.retired).toEqual([TCI_KEY]);
    expect((await getTemplateByKey(TCI_KEY))?.active).toBe(false);
  });

  it("deletes nothing: the row, its version, its current pointer and the filed form are all still there, unchanged", async () => {
    withTanningConsultantInterviewInstalled();
    const versions = JSON.stringify(store.form_template_versions.filter((row) => row.template_id === "tpl-tci"));
    const filed = JSON.stringify(store.form_instances);
    await ensureTemplateLibrary("system");
    expect(store.form_templates!.filter((row) => row.key === TCI_KEY)).toHaveLength(1);
    expect(JSON.stringify(store.form_template_versions.filter((row) => row.template_id === "tpl-tci"))).toBe(versions);
    expect(store.form_template_current!.find((row) => row.template_id === "tpl-tci")?.version_id).toBe("ver-tci-1");
    expect(JSON.stringify(store.form_instances)).toBe(filed);
    const loaded = await loadInstance("tci-1");
    expect(loaded?.version.id).toBe("ver-tci-1");
  });

  it("can no longer be chosen for a new form", async () => {
    withTanningConsultantInterviewInstalled();
    await ensureTemplateLibrary("system");
    await expect(
      createInstance({ templateKey: TCI_KEY, variantKey: null, employeeName: "Jordan Testperson", createdBy: "manager-1" } as never),
    ).rejects.toThrow();
    expect((await listTemplateSummaries()).map((entry) => entry.key)).not.toContain(TCI_KEY);
  });

  it("a fresh database never installs it", async () => {
    await ensureTemplateLibrary("system");
    expect(await getTemplateByKey(TCI_KEY)).toBeNull();
  });
});
