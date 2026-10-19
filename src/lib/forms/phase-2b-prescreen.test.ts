import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";

import { checkboxGroupsForVariant, fieldsForVariant, parseFormDocument } from "./document";
import { TEMPLATE_SEEDS } from "./library";
import { renderFormPdf } from "./pdf-render";

/**
 * ============================================================================
 * PHASE 2B — D14, OPTION A: THE PRESCREEN LOSES ITS SUN TAN CITY UNIFORM QUESTION
 * ============================================================================
 *
 * Approved 2026-10-19: remove "Are you willing to use our services as part of
 * your Sun Tan City uniform? (Must agree to UV, Sunless and Spa usage to
 * proceed with employment)" from the prescreen, and "uniform agreement" from its
 * description. No Buff City Soap equivalent exists for a product-use hiring
 * requirement (knowledge base audit), so nothing replaces it.
 *
 * A removal is different from a wording change: block order, the other
 * questions, historical versions and historical PDFs all have to be shown intact.
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
const KEY = "prescreen-phone-interview";
const REMOVED_LABEL =
  "Are you willing to use our services as part of your Sun Tan City uniform? (Must agree to UV, Sunless and Spa usage to proceed with employment)";
const OLD_DESCRIPTION =
  "The prescreening call, before anyone is booked for an interview. Age, interest, uniform agreement, experience and availability, signed off by the interviewer.";
const NEW_DESCRIPTION =
  "The prescreening call, before anyone is booked for an interview. Age, interest, experience and availability, signed off by the interviewer.";

const seed = (key: string) => TEMPLATE_SEEDS.find((entry) => entry.key === key)!;

type Block = { kind: string; key?: string; label?: string; text?: string; field?: { key: string; label: string; input?: string; responsibility?: string } };
const blocks = (document: unknown) => (document as { blocks: Block[] }).blocks;

/** The version before this release: the same blocks with the removed field back in its original place. */
function previousDocument() {
  const doc = JSON.parse(JSON.stringify(seed(KEY).document)) as { blocks: Block[] };
  const at = doc.blocks.findIndex((block) => block.field?.key === "why_interested") + 1;
  doc.blocks.splice(at, 0, {
    kind: "field",
    field: { key: "uniform_services", label: REMOVED_LABEL, input: "long_text", responsibility: "manager" },
  });
  return doc;
}

describe("the prescreen without the uniform question", () => {
  it("removes the field and its Sun Tan City wording from the document and the description", () => {
    const text = JSON.stringify(seed(KEY).document);
    expect(text).not.toContain("uniform_services");
    expect(text).not.toContain("Sun Tan City");
    expect(text).not.toMatch(/UV,|Sunless|Spa usage/);
    expect(seed(KEY).description).toBe(NEW_DESCRIPTION);
    expect(seed(KEY).description).not.toMatch(/uniform/i);
  });

  it("keeps every other block, in exactly the original order (nothing else removed or moved)", () => {
    const summary = (list: Block[]) => list.map((block) => `${block.kind}:${block.key ?? block.field?.key ?? block.label ?? block.text?.slice(0, 24) ?? ""}`);
    const now = summary(blocks(seed(KEY).document));
    expect(summary(blocks(previousDocument()))).toEqual([
      ...now.slice(0, 7),
      "field:uniform_services",
      ...now.slice(7),
    ]);
    expect(now).toEqual([
      "letterhead:",
      "section:Applicant Information",
      "field_row:",
      "field:job_title",
      "section:Questions",
      "checkbox_group:at_least_18",
      "field:why_interested",
      "field:previous_experience",
      "field:availability",
      "section:Prescreening Assessment",
      "note:If the response to these",
      "note:If you do not receive qu",
      "note:Attach this completed fo",
      "signature_row:Interviewer Signature",
    ]);
  });

  it("keeps the other questions' text, keys and responsibilities exactly", () => {
    const document = parseFormDocument(seed(KEY).document);
    const fields = fieldsForVariant(document, null).map((field) => [field.key, field.label, field.input, field.responsibility]);
    expect(fields).toEqual([
      ["employee_name", "Applicant Name", "text", "system"],
      ["form_date", "Date", "date", "system"],
      ["job_title", "Position Applied For", "text", "system"],
      ["why_interested", "Why are you interested in working for Buff City Soap?", "long_text", "manager"],
      ["previous_experience", "Previous Work Experience", "long_text", "manager"],
      ["availability", "Availability", "long_text", "manager"],
    ]);
    expect(checkboxGroupsForVariant(document, null).map((group) => [group.key, group.options.map((option) => option.key)])).toEqual([["at_least_18", ["yes", "no"]]]);
  });

  it("is re-issued once (2 → 3) and changes no other template", () => {
    expect(seed(KEY).revision).toBe(3);
    expect(seed(KEY).requiredPermission).toBe("create_hiring_form");
    expect(Object.fromEntries(TEMPLATE_SEEDS.filter((entry) => entry.key !== KEY).map((entry) => [entry.key, entry.revision]))).toMatchObject({
      coaching: 2,
      dpoa: 5,
      "policy-review": 2,
      "follow-up-coaching": 2,
      "tanning-consultant-interview": 3,
      "management-interview-round-1": 3,
      "management-interview-round-2": 3,
      "resignation-exit": 3,
    });
    // Held items still say what they said.
    expect(JSON.stringify(seed("tanning-consultant-interview").document)).toContain("Sun Tan City Core Values");
  });
});

describe("the generated PDFs", () => {
  async function pdf(document: unknown, name: string) {
    const parsed = parseFormDocument(document);
    const values: Record<string, string> = {};
    for (const field of fieldsForVariant(parsed, null)) values[field.key] = field.input === "date" ? "2026-10-01" : `Sample ${field.key.replace(/_/g, " ")}`;
    const checked: Record<string, string[]> = {};
    for (const group of checkboxGroupsForVariant(parsed, null)) checked[group.key] = [group.options[0]!.key];
    const bytes = renderFormPdf(parsed, null, { values, checked }, {
      templateName: name,
      templateVersion: 1,
      employeeName: "Avery Testperson",
      formDate: "2026-10-01",
      locationName: "Test Store 1",
      reference: "qa-2b",
      status: "draft",
    });
    const proxy = await getDocumentProxy(bytes);
    const result = await extractText(proxy, { mergePages: true });
    return { text: result.text.replace(/\s+/g, " "), pages: result.totalPages };
  }

  it("print the remaining questions in order, with no uniform question", async () => {
    const { text, pages } = await pdf(seed(KEY).document, seed(KEY).name);
    const order = ["Are you at least 18 years old?", "Why are you interested in working for Buff City Soap?", "Previous Work Experience", "Availability", "Prescreening Assessment", "Interviewer Signature"];
    const positions = order.map((phrase) => text.indexOf(phrase));
    expect(positions.every((position) => position >= 0), String(positions)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(text).not.toMatch(/uniform|Sun Tan City|UV|Sunless/);
    expect(pages).toBe(1);
  });

  it("still print the question for a form filed on the old version", async () => {
    const { text } = await pdf(previousDocument(), seed(KEY).name);
    expect(text).toContain("Are you willing to use our services as part of your Sun Tan City uniform?");
    expect(text).toContain("Sample uniform services");
  });
});

describe("existing databases, filed forms and repeat synchronization", () => {
  beforeEach(() => {
    for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  });
  const versionsOf = (key: string) => {
    const template = store.form_templates!.find((row) => row.key === key)!;
    return store.form_template_versions.filter((row) => row.template_id === template.id);
  };
  async function productionBefore() {
    await ensureTemplateLibrary("system", PRODUCTION);
    const template = store.form_templates!.find((row) => row.key === KEY)!;
    template.description = OLD_DESCRIPTION;
    for (const row of versionsOf(KEY)) {
      row.seed_revision = 2;
      row.document = previousDocument();
    }
  }

  it("publishes a new version of the prescreen only, archives version 1 untouched (question and all)", async () => {
    await productionBefore();
    const old = versionsOf(KEY)[0]!;
    const oldJson = JSON.stringify(old.document);
    const others = TEMPLATE_SEEDS.filter((entry) => entry.key !== KEY);
    const othersBefore = JSON.stringify(others.map((entry) => versionsOf(entry.key)));

    const result = await ensureTemplateLibrary("admin-1", PRODUCTION);

    expect(result.revised).toEqual([KEY]);
    expect(result.renamed).toEqual([KEY]); // the description label, no version involved
    expect(result.failed).toEqual([]);
    expect(result.heldBack).toEqual([]);
    expect(versionsOf(KEY).map((row) => `${row.version}:${row.status}`).sort()).toEqual(["1:archived", "2:published"]);
    expect(JSON.stringify(old.document)).toBe(oldJson);
    expect(JSON.stringify(old.document)).toContain("uniform_services");
    expect(versionsOf(KEY).find((row) => row.version === 2)?.document).toEqual(seed(KEY).document);
    expect(store.form_templates!.find((row) => row.key === KEY)?.description).toBe(NEW_DESCRIPTION);
    expect(JSON.stringify(others.map((entry) => versionsOf(entry.key)))).toBe(othersBefore);
  });

  it("publishes nothing on a second or third run", async () => {
    await productionBefore();
    await ensureTemplateLibrary("system", PRODUCTION);
    const snapshot = JSON.stringify(store);
    for (let run = 0; run < 2; run += 1) {
      expect(await ensureTemplateLibrary("system", PRODUCTION)).toMatchObject({ created: [], revised: [], renamed: [], failed: [], heldBack: [] });
    }
    expect(JSON.stringify(store)).toBe(snapshot);
  });

  it("leaves a filed prescreen pinned to version 1 with its stored answer to the removed question", async () => {
    await productionBefore();
    const template = store.form_templates!.find((row) => row.key === KEY)!;
    const v1 = versionsOf(KEY)[0]!;
    store.form_instances.push({ id: "filed-1", template_id: template.id, template_version_id: v1.id, status: "finalized" });
    store.form_instance_values.push({ id: "value-1", instance_id: "filed-1", field_key: "uniform_services", value: "Yes" });
    const valuesBefore = JSON.stringify(store.form_instance_values);

    await ensureTemplateLibrary("system", PRODUCTION);

    expect(store.form_instances.find((row) => row.id === "filed-1")?.template_version_id).toBe(v1.id);
    expect(JSON.stringify(store.form_instance_values)).toBe(valuesBefore);
    expect(JSON.stringify(v1.document)).toContain("uniform_services");
  });

  it("holds back an administrator-authored prescreen and an open draft", async () => {
    await productionBefore();
    const template = store.form_templates!.find((row) => row.key === KEY)!;
    store.form_template_versions.push({ id: "authored-1", template_id: template.id, version: 2, status: "published", document: { paper: "letter", blocks: [] }, variants: [], seed_revision: 0, notes: "Authored here.", created_by: "dana" });
    const held = await ensureTemplateLibrary("system", PRODUCTION);
    expect(held.heldBack.map((entry) => entry.key)).toEqual([KEY]);
    expect(held.revised).toEqual([]);
  });

  it("never writes from a Preview", async () => {
    await productionBefore();
    const before = JSON.stringify(store);
    const result = await ensureTemplateLibrary("system", { VERCEL: "1", VERCEL_ENV: "preview", NODE_ENV: "production" });
    expect(result.skipped).toBeDefined();
    expect(JSON.stringify(store)).toBe(before);
  });
});
