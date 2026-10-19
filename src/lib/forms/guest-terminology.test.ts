import { describe, expect, it, beforeEach, vi } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import approved from "@/test/fixtures/approved-template-changes.json";

import { checkboxGroupsForVariant, fieldsForVariant, parseFormDocument } from "./document";
import { TEMPLATE_SEEDS } from "./library";
import { renderFormPdf } from "./pdf-render";

/**
 * ============================================================================
 * GUEST TERMINOLOGY — the six approved corrections (SD-2, TS-5, TI-4, TI-5,
 * M1-6, X-1), and nothing else
 * ============================================================================
 *
 * Approved 2026-10-19: "client"/"customer" becomes "guest" ONLY where the word
 * refers to a Buff City Soap guest, with each question's meaning preserved.
 * Everything the business has not approved is pinned here as UNCHANGED, so a
 * later edit cannot widen this change by accident: the tanning role play, the
 * "Client Engagement Strategies" line, "New Client Documents", the second
 * round's membership scenario and the District Manager's purpose statement.
 *
 * Keys are identifiers, not wording: `client_service`, `walkthrough_client_service`
 * and the rest keep their names, so stored values and version history stay
 * valid.
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

const { ensureTemplateLibrary } = await import("./repository");

const PRODUCTION = { VERCEL: "1", VERCEL_ENV: "production", NODE_ENV: "production" };
const ISSUED = ["sdit-epp", "tsd-epp", "tanning-consultant-interview", "management-interview-round-1", "management-interview-round-2"];

/** [what production holds now (guest-free), what the release ships]. */
const PAIRS: [string, string][] = [
  ["Personally, provide excellent client service.", "Personally, provide excellent guest service."],
  ["Coach team to provide, and personally provide, excellent client service.", "Coach team to provide, and personally provide, excellent guest service."],
  ["delivered excellent customer service", "delivered excellent guest service"],
  ["helping several customers at once", "helping several guests at once"],
  ["recommending products and services to clients", "recommending products and services to guests"],
  ["Sales drive and client service focus", "Sales drive and guest service focus"],
  ["Sales & Client Service", "Sales & Guest Service"],
  ["while maintaining excellent client service", "while maintaining excellent guest service"],
  ["turned an unhappy client into a satisfied one", "turned an unhappy guest into a satisfied one"],
  ["Client service leadership", "Guest service leadership"],
  ["Client service interactions", "Guest service interactions"],
  ["fails to greet a client promptly", "fails to greet a guest promptly"],
];

/** Wording the business has NOT approved changing. It must still be there, byte for byte. */
const UNCHANGED: [string, string][] = [
  ["sdit-epp", "Follow through with Client Engagement Strategies with every client."],
  ["management-interview-round-1", "A client approaches the counter upset because the tanning bed they reserved is unavailable"],
  ["management-interview-round-2", "Customer visits have dropped 20% over the past month and lotions and memberships sales are at their lowest in six months."],
  ["dmit-epp-tsd", "ensuring the highest level of client service throughout the stores"],
  ["dmit-epp-dmit", "ensuring the highest level of client service throughout the stores"],
];

const seed = (key: string) => TEMPLATE_SEEDS.find((entry) => entry.key === key)!;
const text = (key: string) => JSON.stringify([seed(key).document, seed(key).variants]);

describe("the six approved guest corrections", () => {
  it.each(PAIRS)("ships %s → %s", (_old, now) => {
    const where = ISSUED.filter((key) => text(key).includes(now.replace(/"/g, '\\"')));
    expect(where.length, now).toBeGreaterThan(0);
  });

  it("leaves no replaced wording behind in the five re-issued templates", () => {
    for (const key of ISSUED) {
      for (const [old] of PAIRS) expect(text(key), `${key}: ${old}`).not.toContain(old);
    }
  });

  it("keeps the unapproved wording exactly as it was", () => {
    for (const [key, wording] of UNCHANGED) expect(text(key), `${key}: ${wording}`).toContain(wording);
  });

  it("touches only labels and text — never a key, option key, variant or field identifier", () => {
    const changes = (approved.changes as { path: string; from: unknown; to: unknown }[]).filter(
      (change) => typeof change.to === "string" && /guest/i.test(change.to as string) && /client|customer/i.test(String(change.from)),
    );
    expect(changes.length).toBeGreaterThanOrEqual(PAIRS.length);
    for (const change of changes) expect(change.path, change.path).toMatch(/\.(label|text|body\[\d+\])$/);
    // Stored option/field keys that still say "client" are deliberate identifiers.
    expect(text("management-interview-round-1")).toContain('"client_service"');
    expect(text("management-interview-round-1")).toContain('"walkthrough_client_service"');
    expect(text("sdit-epp")).toContain('"client_service"');
  });

  it("changes no variant: SDIT and TSD keep their roles, labels and abbreviations", () => {
    expect(seed("sdit-epp").variants).toEqual([
      { key: expect.any(String), label: "SDIT review", role: "Training Store Director", roleAbbr: "SDIT" },
    ]);
    expect(seed("tsd-epp").variants).toEqual([
      { key: expect.any(String), label: "TSD review", role: "District Manager", roleAbbr: "TSD" },
    ]);
  });

  it("re-issues exactly the five templates, one revision each, and no other", () => {
    const revisions = Object.fromEntries(TEMPLATE_SEEDS.map((entry) => [entry.key, entry.revision]));
    expect(revisions).toMatchObject({
      "sdit-epp": 5,
      "tsd-epp": 4,
      "tanning-consultant-interview": 3,
      "management-interview-round-1": 3,
      "management-interview-round-2": 3,
      "fttc-epp": 2,
      "asd-sdit-epp": 2,
      "dmit-epp-tsd": 2,
      "dmit-epp-dmit": 2,
      "prescreen-phone-interview": 3,
      "resignation-exit": 3,
      coaching: 2,
      dpoa: 5,
      "policy-review": 2,
      "follow-up-coaching": 2,
      demotion: 1,
      "position-transfer": 1,
    });
  });
});

describe("the generated PDFs", () => {
  async function pdfText(key: string) {
    const entry = seed(key);
    const document = parseFormDocument(entry.document);
    const out: string[] = [];
    for (const variant of entry.variants.length > 0 ? entry.variants : [null]) {
      const variantKey = (variant as { key?: string } | null)?.key ?? null;
      const values: Record<string, string> = {};
      for (const field of fieldsForVariant(document, variantKey)) values[field.key] = field.input === "date" ? "2026-10-01" : "Sample text";
      const checked: Record<string, string[]> = {};
      for (const group of checkboxGroupsForVariant(document, variantKey)) checked[group.key] = group.options.length > 0 ? [group.options[0]!.key] : [];
      const bytes = renderFormPdf(document, variant as never, { values, checked }, {
        templateName: entry.name,
        templateVersion: entry.revision,
        employeeName: "Avery Testperson",
        formDate: "2026-10-01",
        locationName: "Test Store 1",
        reference: "qa-guest",
        status: "draft",
      });
      const proxy = await getDocumentProxy(bytes);
      out.push((await extractText(proxy, { mergePages: true })).text.replace(/\s+/g, " "));
    }
    return out.join(" ");
  }

  it("print the guest wording and none of the replaced wording", async () => {
    const sdit = await pdfText("sdit-epp");
    expect(sdit).toContain("excellent guest service");
    expect(sdit).not.toContain("excellent client service");
    const tsd = await pdfText("tsd-epp");
    expect(tsd).toContain("personally provide, excellent guest service");
    const tc = await pdfText("tanning-consultant-interview");
    expect(tc).toContain("excellent guest service and what made it stand out");
    expect(tc).toContain("helping several guests at once");
    expect(tc).toContain("recommending products and services to guests");
    const m1 = await pdfText("management-interview-round-1");
    for (const phrase of ["guest service focus", "Sales & Guest Service", "excellent guest service", "unhappy guest", "Guest service leadership", "Guest service interactions"]) {
      expect(m1, phrase).toContain(phrase);
    }
    expect(m1).not.toMatch(/unhappy client|Client service (?:leadership|interactions)|Sales & Client Service/);
    const m2 = await pdfText("management-interview-round-2");
    expect(m2).toContain("fails to greet a guest promptly");
  });

  it("still print the unapproved wording", async () => {
    expect(await pdfText("management-interview-round-1")).toContain("A client approaches the counter upset because the tanning bed");
    expect(await pdfText("sdit-epp")).toContain("Client Engagement Strategies");
  });
});

describe("existing databases and repeat synchronization", () => {
  beforeEach(() => {
    for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  });

  const versionsOf = (key: string) => {
    const template = store.form_templates!.find((row) => row.key === key)!;
    return store.form_template_versions.filter((row) => row.template_id === template.id);
  };
  /** The five templates as production holds them now: the previous revision, worded "client"/"customer". */
  const asClient = <T,>(value: T): T => {
    let json = JSON.stringify(value);
    for (const [old, now] of PAIRS) json = json.split(now.replace(/"/g, '\\"')).join(old.replace(/"/g, '\\"'));
    return JSON.parse(json) as T;
  };
  async function productionBefore() {
    await ensureTemplateLibrary("system", PRODUCTION);
    for (const key of ISSUED) {
      for (const row of versionsOf(key)) {
        row.seed_revision = seed(key).revision - 1;
        row.document = asClient(seed(key).document);
        row.variants = asClient(seed(key).variants);
      }
    }
  }

  it("publishes a new version of exactly the five templates and archives the old one", async () => {
    await productionBefore();
    const oldIds = new Map(ISSUED.map((key) => [key, versionsOf(key)[0]!.id]));
    const oldDocs = new Map(ISSUED.map((key) => [key, JSON.stringify(versionsOf(key)[0]!.document)]));

    const result = await ensureTemplateLibrary("admin-1", PRODUCTION);

    expect([...result.revised].sort()).toEqual([...ISSUED].sort());
    expect(result.failed).toEqual([]);
    expect(result.heldBack).toEqual([]);
    for (const key of ISSUED) {
      const versions = versionsOf(key);
      expect(versions.map((row) => `${row.version}:${row.status}`).sort(), key).toEqual(["1:archived", "2:published"]);
      const old = versions.find((row) => row.id === oldIds.get(key))!;
      // The old version is archived untouched, so forms filed on it still print as signed.
      expect(JSON.stringify(old.document), key).toBe(oldDocs.get(key));
      expect(versions.find((row) => row.version === 2)?.document, key).toEqual(seed(key).document);
    }
    for (const other of TEMPLATE_SEEDS.filter((entry) => !ISSUED.includes(entry.key))) {
      expect(versionsOf(other.key), other.key).toHaveLength(1);
    }
  });

  it("does not publish again on a second or third run", async () => {
    await productionBefore();
    await ensureTemplateLibrary("system", PRODUCTION);
    const snapshot = JSON.stringify(store);
    for (let run = 0; run < 2; run += 1) {
      const again = await ensureTemplateLibrary("system", PRODUCTION);
      expect(again).toMatchObject({ created: [], revised: [], failed: [], heldBack: [] });
    }
    expect(JSON.stringify(store)).toBe(snapshot);
  });

  it("leaves a form already filed on the old version pinned to it", async () => {
    await productionBefore();
    const template = store.form_templates!.find((row) => row.key === "tanning-consultant-interview")!;
    const v1 = versionsOf("tanning-consultant-interview")[0]!;
    store.form_instances.push({ id: "filed-1", template_id: template.id, template_version_id: v1.id, status: "finalized" });

    await ensureTemplateLibrary("system", PRODUCTION);

    expect(store.form_instances.find((row) => row.id === "filed-1")?.template_version_id).toBe(v1.id);
  });

  it("holds back a template an administrator authored", async () => {
    await productionBefore();
    const template = store.form_templates!.find((row) => row.key === "management-interview-round-1")!;
    store.form_template_versions.push({
      id: "authored-1",
      template_id: template.id,
      version: 2,
      status: "published",
      document: { paper: "letter", blocks: [] },
      variants: [],
      seed_revision: 0,
      notes: "Authored here.",
      created_by: "dana",
    });

    const result = await ensureTemplateLibrary("system", PRODUCTION);

    expect(result.heldBack.map((entry) => entry.key)).toEqual(["management-interview-round-1"]);
    expect(result.revised).not.toContain("management-interview-round-1");
  });

  it("never writes from a Preview", async () => {
    await productionBefore();
    const before = JSON.stringify(store);
    const result = await ensureTemplateLibrary("system", { VERCEL: "1", VERCEL_ENV: "preview", NODE_ENV: "production" });
    expect(result.skipped).toBeDefined();
    expect(JSON.stringify(store)).toBe(before);
  });
});
