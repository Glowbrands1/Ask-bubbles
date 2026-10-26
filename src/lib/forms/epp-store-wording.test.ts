import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";

import { FORM_LETTERHEAD_BRAND_NAME } from "@/config/company/forms/letterhead";

import {
  checkboxGroupsForVariant,
  fieldsForVariant,
  parseFormDocument,
  parseFormVariants,
  responsibilityMap,
  type FormDocument,
  type FormVariant,
} from "./document";
import {
  SDIT_EPP_INTAKE,
  SDIT_EPP_PLAN,
  TSD_EPP_INTAKE,
  TSD_EPP_PLAN,
  eppIntakeRequest,
} from "./epp-intake";
import { TEMPLATE_SEEDS } from "./library";
import { renderFormPdf, type RenderMeta, type RenderValues } from "./pdf-render";

/**
 * ============================================================================
 * THE PERFORMANCE PLANS SAY "STORE", NAME NO SIBLING COMPANY, AND KEEP THEIR KEYS
 * ============================================================================
 *
 * Pau, 25 Oct 2026: the Employee Performance Plans must not carry the sibling
 * company's branding. Remove the Sun Tan City name and any of its logos, and
 * turn the "salon" a manager or employee can SEE into "store". KEEP the
 * metrics (PPTA, LPSVA, UPTA, Club Close: Buff City Soap tracks them) and KEEP
 * every stored field key (`salon_ppta`, `salon_goals`, …) so a saved plan
 * still loads.
 *
 * The wording itself shipped in 9adc232 ("Replace Salon terminology with Store
 * across Ask Bubbles user-facing text"): the seeds, the intake and the PDF
 * letterhead already read "Store" / "Buff City Soap", and the published
 * versions in the production database match (read-only check, 25 Oct 2026: no
 * visible "salon" or Sun Tan City string in any published EPP version, only
 * the field keys below). So this file adds no behaviour and no flag; it pins
 * the outcome so it cannot quietly regress:
 *
 *   - every visible string of every EPP seed, and the PDF each one prints,
 *     blank and filled, has no "salon" and no Sun Tan City wording, and prints
 *     the Buff City Soap letterhead with no logo;
 *   - the chat intake for both drafting plans says "store" and still names
 *     the metrics;
 *   - the stored `salon_*` keys are exactly the ones the published versions
 *     hold;
 *   - a saved plan's values, in the shape a real saved row has, still load
 *     into the current template and print under the "Store" labels.
 *
 * "salon" is matched as a WORD (`\bsalons?\b`): a key such as `salon_ppta` is
 * one word to a regex (the underscore is a word character), so keys are not
 * visible text and do not trip it.
 */

const VISIBLE_SALON = /\bsalons?\b/i;
const SIBLING_BRAND = /sun\s*tan\s*city|suntancity|\bSTC\b|ask\s*sunny|1BA00000/i;

const EPP_KEYS = ["sdit-epp", "tsd-epp", "asd-sdit-epp", "fttc-epp", "dmit-epp-tsd", "dmit-epp-dmit"] as const;

/*
 * THE STORED KEYS, AS THE PUBLISHED VERSIONS HOLD THEM. Read with a read-only
 * SELECT on the Ask Bubbles production database (25 Oct 2026): every string
 * containing "salon" in each published EPP version's document. All of them
 * are keys; these must not change, or a saved plan's values would no longer
 * find their field.
 */
const STORED_SALON_KEYS: Record<(typeof EPP_KEYS)[number], string[]> = {
  "sdit-epp": ["salon_goals", "salon_lpsva", "salon_ppta", "salon_productivity", "salon_upta"],
  "tsd-epp": [
    "salon_average_club_dollar",
    "salon_club_close",
    "salon_goals",
    "salon_lpsva",
    "salon_ppta",
    "salon_primary_productivity",
    "salon_productivity",
    "salon_secondary_productivity",
    "salon_standards",
    "salon_upta",
  ],
  "asd-sdit-epp": ["salon_goals", "salon_productivity"],
  "fttc-epp": ["salon_goals", "salon_productivity"],
  "dmit-epp-tsd": ["salon_goals", "salon_productivity"],
  "dmit-epp-dmit": ["salon_goals", "salon_productivity"],
};

function seedFor(key: string) {
  const seed = TEMPLATE_SEEDS.find((entry) => entry.key === key);
  if (!seed) throw new Error(`no seed ${key}`);
  return seed;
}

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => strings(entry, out));
  else if (value && typeof value === "object") Object.values(value).forEach((entry) => strings(entry, out));
  return out;
}

/**
 * Every key a stored value can sit under on this version. `responsibilityMap`
 * is the map the save guard and the renderer agree on: a value whose key is
 * not in it is refused on save and never printed.
 */
function storableKeys(document: FormDocument, variantKey: string | null): Set<string> {
  return new Set(responsibilityMap(document, variantKey).keys());
}

function salonKeysIn(document: FormDocument, variants: FormVariant[]): string[] {
  const keys = new Set<string>();
  for (const variant of variants.length ? variants : [null]) {
    for (const key of storableKeys(document, variant?.key ?? null)) if (key.startsWith("salon_")) keys.add(key);
  }
  return [...keys].sort();
}

const META = (templateName: string): RenderMeta => ({
  templateName,
  templateVersion: 3,
  employeeName: "Avery Testperson",
  formDate: "2026-10-20",
  locationName: "Sample Store",
  reference: "qa-epp-0001",
  status: "draft",
});

async function pdfText(bytes: Uint8Array): Promise<string> {
  const { text } = await extractText(await getDocumentProxy(bytes.slice()), { mergePages: true });
  return text.replace(/\s+/g, " ");
}

/** A value for every text field and the first option of every list, none of it naming a place. */
function filledValues(document: FormDocument, variantKey: string | null): RenderValues {
  const values: Record<string, string> = {};
  for (const field of fieldsForVariant(document, variantKey)) {
    values[field.key] = field.input === "date" ? "2026-10-27" : `Sample ${field.key.replace(/^salon_/, "store ").replace(/_/g, " ")}`;
  }
  const checked: Record<string, string[]> = {};
  for (const group of checkboxGroupsForVariant(document, variantKey)) {
    if (group.options[0]) checked[group.key] = [group.options[0].key];
  }
  return { values, checked };
}

describe.each(EPP_KEYS.map((key) => [key] as const))("%s: what a manager or employee sees", (key) => {
  const seed = seedFor(key);
  const document = parseFormDocument(seed.document);
  const variants = parseFormVariants(seed.variants);

  it("no visible string of the seed says salon or names the sibling company", () => {
    const visible = strings({
      name: seed.name,
      shortName: seed.shortName,
      description: seed.description,
      document: seed.document,
      variants: seed.variants,
    });
    expect(visible.filter((text) => VISIBLE_SALON.test(text))).toEqual([]);
    expect(visible.filter((text) => SIBLING_BRAND.test(text))).toEqual([]);
  });

  it("carries no logo, so no other company's mark can print", () => {
    expect(document.style?.logo).toBeUndefined();
  });

  it("keeps every stored salon_* key exactly", () => {
    expect(salonKeysIn(document, variants)).toEqual(STORED_SALON_KEYS[key]);
  });

  it.each((variants.length ? variants : [null]).map((variant) => [variant?.key ?? "default", variant] as const))(
    "the PDF (%s variant), blank and filled, says store and prints the Buff City Soap letterhead",
    async (_variantKey, variant) => {
      const blank = await pdfText(renderFormPdf(document, variant, { values: {}, checked: {} }, META(seed.name)));
      const filled = await pdfText(
        renderFormPdf(document, variant, filledValues(document, variant?.key ?? null), META(seed.name)),
      );
      for (const text of [blank, filled]) {
        expect(text).not.toMatch(VISIBLE_SALON);
        expect(text).not.toMatch(SIBLING_BRAND);
      }
      expect(blank.toUpperCase()).toContain(FORM_LETTERHEAD_BRAND_NAME.toUpperCase());
    },
  );
});

describe("the metrics Buff City Soap tracks stay on the plans", () => {
  it("the SDIT plan keeps PPTA, LPSVA and UPTA under a Store heading", () => {
    const document = parseFormDocument(seedFor("sdit-epp").document);
    const fields = fieldsForVariant(document, "default");
    expect(fields.find((field) => field.key === "salon_ppta")?.label).toBe("PPTA");
    expect(fields.find((field) => field.key === "salon_lpsva")?.label).toBe("LPSVA");
    expect(fields.find((field) => field.key === "salon_upta")?.label).toBe("UPTA");
    expect(fields.find((field) => field.key === "salon_productivity")?.label).toMatch(/^Store\b/);
  });

  it("the TSD plan keeps Club Close and the store objectives, under their stored keys", () => {
    const document = parseFormDocument(seedFor("tsd-epp").document);
    const fields = fieldsForVariant(document, "default");
    expect(fields.find((field) => field.key === "salon_club_close")?.label).toBe("Club Close");
    expect(fields.find((field) => field.key === "salon_primary_productivity")?.label).toMatch(/Store Primary Productivity$/);
    expect(fields.find((field) => field.key === "salon_standards")?.label).toMatch(/Store Standards of Cleanliness and Safety$/);
  });
});

describe("the chat intake for a performance plan says store", () => {
  const plans = [
    ["SDIT", SDIT_EPP_PLAN, SDIT_EPP_INTAKE, "SDIT EPP"],
    ["TSD", TSD_EPP_PLAN, TSD_EPP_INTAKE, "TSD EPP"],
  ] as const;

  it.each(plans)("%s: the opening ask and the chase name no salon and no sibling company", (_name, plan, items, formName) => {
    const opening = eppIntakeRequest({ formName, items, opening: true, today: "October 25, 2026", plan });
    const chase = eppIntakeRequest({ formName, items: items.slice(0, 2), opening: false, plan });
    for (const text of [opening, chase]) {
      expect(text).not.toMatch(VISIBLE_SALON);
      expect(text).not.toMatch(SIBLING_BRAND);
    }
    expect(opening).toContain("The store");
    expect(opening).toMatch(/PPTA/);
    expect(opening).toMatch(/LPSVA/);
    expect(opening).toMatch(/UPTA/);
  });

  it("the TSD intake still names Club Close; the item keys stay as stored", () => {
    expect(eppIntakeRequest({ formName: "TSD EPP", items: TSD_EPP_INTAKE, opening: true, plan: TSD_EPP_PLAN })).toContain(
      "Club Close",
    );
    // Internal keys, never shown: unchanged so the readers that use them keep working.
    expect(SDIT_EPP_INTAKE.map((item) => item.key)).toContain("salon");
    expect(SDIT_EPP_INTAKE.map((item) => item.key)).toContain("salon_productivity");
    expect(TSD_EPP_INTAKE.map((item) => item.key)).toContain("salon_productivity");
  });
});

describe("a saved performance plan still loads", () => {
  /*
   * THE SHAPE OF A REAL SAVED SDIT EPP. Ask Bubbles has no saved EPP yet (read-
   * only SELECT, 25 Oct 2026: no form_instances row for any EPP template), so
   * the key set is read from a saved sdit-epp row in the sibling deployment,
   * which runs the same template structure: keys only, no values or names.
   * The store figures are added under their stored `salon_*` keys, which is
   * where a plan with figures keeps them. Every value below is invented.
   */
  const SAVED_KEYS = [
    "employee_name",
    "employee_self_review",
    "expectations_improvement",
    "expectations_success",
    "form_date",
    "improvement_areas",
    "job_title",
    "needs_improvement",
    "plan_of_action",
    "policy_references",
    "top_strengths",
    "where_succeeding",
  ];
  const STORE_FIGURES: Record<string, string> = {
    salon_ppta: "41.20",
    salon_lpsva: "18.75",
    salon_upta: "2.4",
    salon_productivity: "Store PPTA 41.20, LPSVA 18.75, UPTA 2.4 for September.",
    salon_goals: "Lift store UPTA to 2.6 by the follow-up.",
  };

  const seed = seedFor("sdit-epp");
  const document = parseFormDocument(seed.document);
  const variant = parseFormVariants(seed.variants)[0] ?? null;
  const keys = storableKeys(document, variant?.key ?? null);
  const expectationKeys = checkboxGroupsForVariant(document, variant?.key ?? null).find(
    (group) => group.key === "expectations_success",
  )!.options;

  const saved: RenderValues = {
    values: {
      employee_name: "Avery Testperson",
      employee_self_review: "I want to own the morning opening checklist.",
      form_date: "2026-10-20",
      improvement_areas: "Arriving at the scheduled start time.",
      job_title: "SDIT",
      needs_improvement: "Punctuality on opening shifts.",
      plan_of_action: "Arrive ten minutes early for every opening shift for four weeks.",
      policy_references: "JBA Policy Manual: Attendance and Punctuality.",
      top_strengths: "Guest greetings; product knowledge.",
      where_succeeding: "Builds rapport with guests quickly.",
      ...STORE_FIGURES,
    },
    checked: {
      expectations_success: [expectationKeys[0]!.key],
      expectations_improvement: [expectationKeys[1]!.key],
    },
  };

  it("every saved key, salon_* included, is still a field of the current template", () => {
    for (const key of [...SAVED_KEYS, ...Object.keys(STORE_FIGURES)]) expect(keys, key).toContain(key);
  });

  it("the saved values print, the store figures under Store labels, with no salon on the page", async () => {
    const text = await pdfText(renderFormPdf(document, variant, saved, META(seed.name)));
    expect(text).toContain("Store's current productivity");
    expect(text).toContain("41.20");
    expect(text).toContain("Lift store UPTA to 2.6");
    expect(text).toContain("Arrive ten minutes early");
    expect(text).not.toMatch(VISIBLE_SALON);
    expect(text).not.toMatch(SIBLING_BRAND);
  });
});
