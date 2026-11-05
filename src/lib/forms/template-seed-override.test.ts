import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";

/**
 * TEMPLATE_SEED_OVERRIDE (ported from the sibling app, 5 Nov 2026): a version
 * an administrator published (`seed_revision` 0) holds the seed's revision
 * back; the override names one key at one revision.
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

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => fakeSupabase(store),
}));

const { ensureTemplateLibrary } = await import("./repository");
const { TEMPLATE_SEEDS } = await import("./library");
const { seedOverrideAllows } = await import("./template-seed-override");
const { default: REVISION_6 } = await import("@/test/fixtures/forms/corrective-action-revision-6.json");

const caSeed = TEMPLATE_SEEDS.find((seed) => seed.key === "dpoa")!;
const DPOA_REVISION = caSeed.revision;
/** An administrator's own document (the revision 6 form, published by hand). */
const AUTHORED = REVISION_6;

function templateRow(key: string) {
  return store.form_templates!.find((row) => row.key === key)!;
}
function versionsOf(key: string) {
  const id = templateRow(key).id;
  return store.form_template_versions.filter((row) => row.template_id === id);
}
function currentVersionOf(key: string) {
  const id = templateRow(key).id;
  const pointer = store.form_template_current!.find((row) => row.template_id === id);
  return store.form_template_versions.find((row) => row.id === pointer?.version_id);
}

/** As production stands: seeded versions archived, an administrator's their version current. */
function asProduction(key: string, document: unknown) {
  const template = templateRow(key);
  for (const row of versionsOf(key)) {
    row.seed_revision = Math.min(5, TEMPLATE_SEEDS.find((seed) => seed.key === key)!.revision - 1);
    row.status = "archived";
  }
  store.form_template_versions.push({
    id: `authored-${key}`,
    template_id: template.id,
    version: 7,
    status: "published",
    document,
    variants: [],
    seed_revision: 0,
    notes: "Published by an administrator.",
    created_by: "admin",
  });
  const pointer = store.form_template_current!.find((row) => row.template_id === template.id)!;
  pointer.version_id = `authored-${key}`;
}

let info: { mock: { calls: unknown[][] }; mockRestore: () => void };

beforeEach(async () => {
  store.form_templates = [];
  store.form_template_versions = [];
  store.form_template_current = [];
  store.form_template_assets = [];
  delete process.env.TEMPLATE_SEED_OVERRIDE;
  await ensureTemplateLibrary("system");
  asProduction("dpoa", AUTHORED);
  info = vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  delete process.env.TEMPLATE_SEED_OVERRIDE;
  info.mockRestore();
});

describe("TEMPLATE_SEED_OVERRIDE", () => {
  it("unset: the seed's revision is held back under the administrator's version", async () => {
    const result = await ensureTemplateLibrary("system");
    expect(result.revised).toEqual([]);
    expect(result.heldBack.map((entry) => entry.key)).toEqual(["dpoa"]);
    expect(currentVersionOf("dpoa")?.id).toBe("authored-dpoa");
  });

  it("dpoa:<revision>: the revision is published as the seed's document, their version archived as it was, and the log says so", async () => {
    process.env.TEMPLATE_SEED_OVERRIDE = `dpoa:${DPOA_REVISION}`;
    const result = await ensureTemplateLibrary("system");

    expect(result.revised).toEqual(["dpoa"]);
    expect(result.heldBack).toEqual([]);
    const current = currentVersionOf("dpoa")!;
    expect(current).toMatchObject({ status: "published", seed_revision: DPOA_REVISION, version: 8 });
    expect(current.document).toEqual(caSeed.document);
    const old = versionsOf("dpoa").find((row) => row.id === "authored-dpoa");
    expect(old).toMatchObject({ status: "archived", seed_revision: 0 });
    // Forms filed on their version keep the document they were signed on.
    expect(old?.document).toEqual(AUTHORED);

    const logged: string[] = info.mock.calls.map((call) => String(call[0]));
    expect(logged.some((line) => line.includes("forms.template_sync.override") && line.includes('"key":"dpoa"'))).toBe(true);
  });

  it("idempotent: a second visit with the override still set publishes nothing", async () => {
    process.env.TEMPLATE_SEED_OVERRIDE = `dpoa:${DPOA_REVISION}`;
    await ensureTemplateLibrary("system");
    const versions = versionsOf("dpoa").length;

    const again = await ensureTemplateLibrary("system");
    expect(again.revised).toEqual([]);
    expect(again.heldBack).toEqual([]);
    expect(again.existing).toContain("dpoa");
    expect(versionsOf("dpoa")).toHaveLength(versions);
  });

  it("only the named key at the named revision: another revision or another key stays held back", async () => {
    asProduction("coaching", { paper: "letter", blocks: [] });

    process.env.TEMPLATE_SEED_OVERRIDE = `dpoa:${DPOA_REVISION - 1}`;
    let result = await ensureTemplateLibrary("system");
    expect(result.heldBack.map((entry) => entry.key).sort()).toEqual(["coaching", "dpoa"]);

    process.env.TEMPLATE_SEED_OVERRIDE = `dpoa:${DPOA_REVISION}`;
    result = await ensureTemplateLibrary("system");
    expect(result.revised).toEqual(["dpoa"]);
    expect(result.heldBack.map((entry) => entry.key)).toEqual(["coaching"]);
    expect(currentVersionOf("coaching")?.id).toBe("authored-coaching");
  });

  it("an open draft still holds the publish back", async () => {
    store.form_template_versions.push({
      id: "draft-dpoa",
      template_id: templateRow("dpoa").id,
      version: 8,
      status: "draft",
      document: AUTHORED,
      variants: [],
      seed_revision: 0,
      notes: "A draft.",
      created_by: "admin",
    });
    process.env.TEMPLATE_SEED_OVERRIDE = `dpoa:${DPOA_REVISION}`;
    const result = await ensureTemplateLibrary("system");
    expect(result.revised).toEqual([]);
    expect(result.heldBack[0]?.reason).toContain("draft");
  });
});

describe("seedOverrideAllows", () => {
  it("reads key:revision entries, exactly", () => {
    expect(seedOverrideAllows("dpoa", 8, { TEMPLATE_SEED_OVERRIDE: "dpoa:8" })).toBe(true);
    expect(seedOverrideAllows("dpoa", 8, { TEMPLATE_SEED_OVERRIDE: " coaching:3 , dpoa:8 " })).toBe(true);
    expect(seedOverrideAllows("dpoa", 8, { TEMPLATE_SEED_OVERRIDE: "dpoa:7" })).toBe(false);
    expect(seedOverrideAllows("dpoa", 8, { TEMPLATE_SEED_OVERRIDE: "dpoa" })).toBe(false);
    expect(seedOverrideAllows("dpoa", 8, { TEMPLATE_SEED_OVERRIDE: "dpoa:8x" })).toBe(false);
    expect(seedOverrideAllows("dpoa", 8, {})).toBe(false);
  });
});
