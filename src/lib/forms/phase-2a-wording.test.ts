import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import approved from "@/test/fixtures/approved-template-changes.json";

import { checkboxGroupsForVariant, fieldsForVariant, parseFormDocument } from "./document";
import { TEMPLATE_SEEDS } from "./library";
import { renderFormPdf } from "./pdf-render";

/**
 * ============================================================================
 * PHASE 2A — FOUR APPROVED WORDING CHANGES, AND NOTHING ELSE (approved 2026-10-19)
 * ============================================================================
 *
 *   D3   "Follow through with Client Engagement Strategies with every client."
 *        -> "Follow through with 7G Service with every guest."     (SDIT EPP)
 *   D4   "…this training document…" -> "…this Employee Performance Plan…"
 *        (the six EPP templates)
 *   D12  the demotion example's "PT Tanning Consultant" -> "PT (New Job Title)"
 *   D18  "…cleaning beds and doing laundry…" -> "…cleaning the Makery and
 *        equipment and keeping the workspace organized…"      (Round 1 interview)
 *
 * Evidence: Buff City Soap knowledge base — *7G Service* (the guest-engagement
 * model), *Makery Reference Manual* (Makery Manager: "maintaining a clean and
 * organized space"). D4 and D12 are wording/placeholder corrections.
 *
 * Everything the business has NOT approved is pinned here as unchanged, so this
 * change cannot widen by accident.
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
const EPPS = ["sdit-epp", "tsd-epp", "asd-sdit-epp", "fttc-epp", "dmit-epp-tsd", "dmit-epp-dmit"];
const ISSUED = [...EPPS, "demotion", "management-interview-round-1"];

const D3: [string, string] = ["Follow through with Client Engagement Strategies with every client.", "Follow through with 7G Service with every guest."];
const D4: [string, string] = [
  "I confirm that my supervisor and I have discussed this training document and I will participate in the plan for improvement.",
  "I confirm that my supervisor and I have discussed this Employee Performance Plan and I will participate in the plan for improvement.",
];
const D12: [string, string] = ["to a PT Tanning Consultant at $x.xx /hr", "to a PT (New Job Title) at $x.xx /hr"];
const D18: [string, string] = [
  "hands-on work like cleaning beds and doing laundry.",
  "hands-on work like cleaning the Makery and equipment and keeping the workspace organized.",
];
const PAIRS = [D3, D4, D12, D18];

/** Held or unapproved wording: it must still be there, byte for byte (template key, exact text). */
const UNCHANGED: [string, string][] = [
  ["sdit-epp", "Uphold the Buff City Soap Experience."], // D2/X-5 held
  ["tsd-epp", "Uphold the Buff City Soap Experience."],
  ["sdit-epp", "Make fact based decisions when the Store Director is not present."], // D5 held
  ["tsd-epp", "What do you feel is the most important skill for a Store Director to possess?"], // D6 held
  ["sdit-epp", "Determine focuses based on the Bonus Viewer."], // SD-4 held
  ["tsd-epp", "Aware of all items on the SVC and able to describe to DM"], // D7 held
  ["tsd-epp", "Club Close"], // KPIs held
  ["sdit-epp", "PPTA"],
  ["fttc-epp", "In what areas is the {{roleAbbr}} currently succeeding?"], // role mapping held
  ["fttc-epp", "TC"],
  ["resignation-exit", "Place comment on employee’s Sunlync account"], // D10 held
  ["resignation-exit", "Notify home office of employee’s final date of employment for HR, Payroll, and Security System purposes."], // D11 held
  ["demotion", "or the monthly manager bonus"], // DE-3 held
  ["demotion", "Any elected benefits will terminate"],
  // The prescreen uniform question (D14) was removed by Phase 2B (phase-2b-prescreen.test.ts), so it is no longer pinned here.
  ["tanning-consultant-interview", "Sun Tan City Core Values"], // D15 held
  ["tanning-consultant-interview", "Our company has five core values."], // D16 held
  ["tanning-consultant-interview", "overseeing daily store operations"], // D17 held
  ["management-interview-round-1", "the tanning bed they reserved is unavailable"], // M1-1 held
  ["management-interview-round-2", "lotions and memberships sales"], // D19 held
  ["management-interview-round-2", "new Assistant Store Director or Tanning Consultant"], // M2-2 held
  ["management-interview-round-2", "If you were given direction as a Store Director to reduce expenses"], // D20 held
  ["coaching", "Engaging Conversation"], // D1: keep existing coaching topics
  ["coaching", "New Client Documents"],
  ["dmit-epp-tsd", "ensuring the highest level of client service throughout the stores"], // DM-2 preserve
];

const seed = (key: string) => TEMPLATE_SEEDS.find((entry) => entry.key === key)!;
const raw = (key: string) => JSON.stringify([seed(key).document, seed(key).variants]);
const esc = (text: string) => JSON.stringify(text).slice(1, -1);

describe("the four approved wording changes", () => {
  it("D3: SDIT prints the 7G Service sentence (both expectation lists) and no longer the old one", () => {
    expect(raw("sdit-epp").split(esc(D3[1])).length - 1).toBe(2);
    expect(raw("sdit-epp")).not.toContain("Client Engagement Strategies");
  });

  it("D4: all six EPPs say 'Employee Performance Plan'; none says 'training document'; no other template changed", () => {
    for (const key of EPPS) {
      expect(raw(key), key).toContain(esc(D4[1]));
      expect(raw(key), key).not.toContain("training document");
    }
    // SDIT, TSD and both DMIT print the acknowledgement twice (agreement and re-evaluation); the others once.
    for (const key of ["sdit-epp", "tsd-epp", "dmit-epp-tsd", "dmit-epp-dmit"]) expect(raw(key).split(esc(D4[1])).length - 1, key).toBe(2);
    for (const key of ["asd-sdit-epp", "fttc-epp"]) expect(raw(key).split(esc(D4[1])).length - 1, key).toBe(1);
    // Coaching and Policy Review have their own acknowledgements and are untouched (CO-5 preserve).
    expect(raw("coaching")).toContain("discussed this training and plan for improvement");
    expect(raw("policy-review")).toContain("discussed this training and plan for improvement");
  });

  it("D12: the demotion example names a (New Job Title) placeholder instead of a tanning role", () => {
    expect(raw("demotion")).toContain(esc(D12[1]));
    expect(raw("demotion")).not.toContain("PT Tanning Consultant");
    // The rest of the example sentence is exactly as before.
    expect(raw("demotion")).toContain("is moving from a FT (Job Title) at $x.xx /hr at (location, State abbr.)");
  });

  it("D18: Round 1 uses the Makery cleaning wording and keeps the follow-up question", () => {
    expect(raw("management-interview-round-1")).toContain(esc(D18[1]));
    expect(raw("management-interview-round-1")).toContain("How do you lead by example in these tasks?");
    expect(raw("management-interview-round-1")).not.toContain("cleaning beds");
  });

  it.each(UNCHANGED)("leaves held/unapproved wording alone: %s — %s", (key, wording) => {
    expect(raw(key)).toContain(esc(wording));
  });

  it("changes no key, option key, variant or permission", () => {
    expect(raw("sdit-epp")).toContain('"key":"client_engagement"');
    expect(raw("sdit-epp")).toContain('"key":"client_service"');
    expect(raw("management-interview-round-1")).toContain('"hands_on_work_notes"');
    expect(raw("prescreen-phone-interview")).not.toContain('"uniform_services"'); // removed by Phase 2B, not by this change
    expect(seed("sdit-epp").variants).toEqual([{ key: expect.any(String), label: "SDIT review", role: "Training Store Director", roleAbbr: "SDIT" }]);
    expect(seed("tsd-epp").variants).toEqual([{ key: expect.any(String), label: "TSD review", role: "District Manager", roleAbbr: "TSD" }]);
    expect(seed("fttc-epp").variants).toEqual([{ key: expect.any(String), label: "FTTC review", role: "Store Director", roleAbbr: "TC" }]);
    expect(Object.fromEntries(TEMPLATE_SEEDS.map((entry) => [entry.key, entry.requiredPermission]))).toMatchObject({
      "sdit-epp": "create_epp",
      demotion: "create_employment_change_form",
      "management-interview-round-1": "create_hiring_form",
    });
  });

  it("touches only text: every approved Phase 2A difference is a label, text or body path", () => {
    const phase = (approved.changes as { sourceKey: string; path: string; from: string; to: string }[]).filter((change) =>
      PAIRS.some(([from, to]) => String(change.from).includes(from) && String(change.to).includes(to)),
    );
    expect(phase).toHaveLength(14);
    for (const change of phase) expect(change.path, change.path).toMatch(/\.(label|text)$/);
  });

  it("re-issues exactly eight templates by one revision each", () => {
    expect(Object.fromEntries(ISSUED.map((key) => [key, seed(key).revision]))).toEqual({
      "sdit-epp": 6,
      "tsd-epp": 5,
      "asd-sdit-epp": 3,
      "fttc-epp": 3,
      "dmit-epp-tsd": 3,
      "dmit-epp-dmit": 3,
      demotion: 2,
      "management-interview-round-1": 4,
    });
    for (const key of ["coaching", "dpoa", "policy-review", "follow-up-coaching", "position-transfer", "prescreen-phone-interview", "resignation-exit", "tanning-consultant-interview", "management-interview-round-2"]) {
      expect(seed(key).revision, key).toBe(({ coaching: 2, dpoa: 6, "policy-review": 2, "follow-up-coaching": 2, "position-transfer": 1, "prescreen-phone-interview": 3, "resignation-exit": 3, "tanning-consultant-interview": 3, "management-interview-round-2": 3 } as Record<string, number>)[key]);
    }
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
        reference: "qa-2a",
        status: "draft",
      });
      out.push((await extractText(await getDocumentProxy(bytes), { mergePages: true })).text.replace(/\s+/g, " "));
    }
    return out.join(" ");
  }

  it("print the approved wording and none of the replaced wording", async () => {
    const sdit = await pdfText("sdit-epp");
    expect(sdit).toContain(D3[1]);
    expect(sdit).not.toContain("Client Engagement Strategies");
    for (const key of EPPS) {
      const text = await pdfText(key);
      expect(text, key).toContain("this Employee Performance Plan");
      expect(text, key).not.toContain("this training document");
    }
    const demotion = await pdfText("demotion");
    expect(demotion).toContain("to a PT (New Job Title) at $x.xx /hr");
    expect(demotion).not.toContain("Tanning Consultant");
    const round1 = await pdfText("management-interview-round-1");
    expect(round1).toContain(D18[1]);
    expect(round1).not.toContain("cleaning beds");
  });

  it("still print the held wording", async () => {
    expect(await pdfText("management-interview-round-1")).toContain("tanning bed they reserved");
    expect(await pdfText("demotion")).toContain("monthly manager bonus");
    expect(await pdfText("tsd-epp")).toContain("Club Close");
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
  /** The eight templates as production held them before this release: the old sentences, the previous revision. */
  const asBefore = <T,>(value: T): T => {
    let json = JSON.stringify(value);
    for (const [from, to] of PAIRS) json = json.split(esc(to)).join(esc(from));
    return JSON.parse(json) as T;
  };
  async function productionBefore() {
    await ensureTemplateLibrary("system", PRODUCTION);
    for (const key of ISSUED) {
      for (const row of versionsOf(key)) {
        row.seed_revision = seed(key).revision - 1;
        row.document = asBefore(seed(key).document);
        row.variants = asBefore(seed(key).variants);
      }
    }
  }

  it("publishes a new version of exactly the eight templates, archiving the old, and touches nothing else", async () => {
    await productionBefore();
    const olds = new Map(ISSUED.map((key) => [key, { id: versionsOf(key)[0]!.id, doc: JSON.stringify(versionsOf(key)[0]!.document) }]));
    const others = TEMPLATE_SEEDS.filter((entry) => !ISSUED.includes(entry.key));
    const othersBefore = JSON.stringify(others.map((entry) => versionsOf(entry.key)));

    const result = await ensureTemplateLibrary("admin-1", PRODUCTION);

    expect([...result.revised].sort()).toEqual([...ISSUED].sort());
    expect(result.failed).toEqual([]);
    expect(result.heldBack).toEqual([]);
    for (const key of ISSUED) {
      const versions = versionsOf(key);
      expect(versions.map((row) => `${row.version}:${row.status}`).sort(), key).toEqual(["1:archived", "2:published"]);
      const old = versions.find((row) => row.id === olds.get(key)!.id)!;
      expect(JSON.stringify(old.document), `${key}: version 1 is archived untouched`).toBe(olds.get(key)!.doc);
      expect(versions.find((row) => row.version === 2)?.document, key).toEqual(seed(key).document);
    }
    expect(JSON.stringify(others.map((entry) => versionsOf(entry.key))), "unrelated templates untouched").toBe(othersBefore);
  });

  it("publishes nothing on a second or third run", async () => {
    await productionBefore();
    await ensureTemplateLibrary("system", PRODUCTION);
    const snapshot = JSON.stringify(store);
    for (let run = 0; run < 2; run += 1) {
      expect(await ensureTemplateLibrary("system", PRODUCTION)).toMatchObject({ created: [], revised: [], failed: [], heldBack: [] });
    }
    expect(JSON.stringify(store)).toBe(snapshot);
  });

  it("leaves a form filed on the old version pinned to it, with the old sentence intact", async () => {
    await productionBefore();
    const template = store.form_templates!.find((row) => row.key === "management-interview-round-1")!;
    const v1 = versionsOf("management-interview-round-1")[0]!;
    store.form_instances.push({ id: "filed-1", template_id: template.id, template_version_id: v1.id, status: "finalized" });
    await ensureTemplateLibrary("system", PRODUCTION);
    expect(store.form_instances.find((row) => row.id === "filed-1")?.template_version_id).toBe(v1.id);
    expect(JSON.stringify(v1.document)).toContain("cleaning beds and doing laundry");
  });

  it("holds back an administrator-authored template and an open draft", async () => {
    await productionBefore();
    const authored = store.form_templates!.find((row) => row.key === "demotion")!;
    store.form_template_versions.push({ id: "authored-1", template_id: authored.id, version: 2, status: "published", document: { paper: "letter", blocks: [] }, variants: [], seed_revision: 0, notes: "Authored here.", created_by: "dana" });
    const drafted = store.form_templates!.find((row) => row.key === "fttc-epp")!;
    store.form_template_versions.push({ id: "draft-1", template_id: drafted.id, version: 2, status: "draft", document: { paper: "letter", blocks: [] }, variants: [], seed_revision: 1, notes: "Draft.", created_by: "dana" });

    const result = await ensureTemplateLibrary("system", PRODUCTION);

    expect(result.heldBack.map((entry) => entry.key).sort()).toEqual(["demotion", "fttc-epp"]);
    expect(result.revised).not.toContain("demotion");
    expect(result.revised).not.toContain("fttc-epp");
  });

  it("never writes from a Preview", async () => {
    await productionBefore();
    const before = JSON.stringify(store);
    const result = await ensureTemplateLibrary("system", { VERCEL: "1", VERCEL_ENV: "preview", NODE_ENV: "production" });
    expect(result.skipped).toBeDefined();
    expect(JSON.stringify(store)).toBe(before);
  });
});
