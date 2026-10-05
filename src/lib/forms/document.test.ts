import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/company/forms", async () =>
  (await import("@/test/forms/fixture-forms")).fixtureFormsModule(),
);


import {
  blocksForVariant,
  fieldsForVariant,
  interpolate,
  parseFormDocument,
  parseFormVariants,
  renderDocument,
  responsibilityMap,
  FormDocumentError,
  type FormDocument,
} from "./document";
import {
  draftableFields,
  enforcePersonEdit,
  enforceResponsibilities,
  requiredOfPeople,
} from "./responsibility";
import { TEMPLATE_SEEDS, defaultVariantKey } from "./library";
import {
  FIXTURE_FOLLOW_UP_KEY,
  FIXTURE_REVIEW_VARIANTS,
  FIXTURE_TRAINEE_DESCRIPTION,
} from "@/test/forms/fixture-forms";

/**
 * THE ENGINE THE WHOLE FORMS FEATURE RESTS ON.
 *
 * Three things are being protected here, and only the first is about types:
 *
 *   a stored document that this code cannot fully understand must FAIL rather
 *   than render with a block quietly missing — a form is a record somebody
 *   signs;
 *
 *   the assistant writes only into fields the TEMPLATE says it may, whatever it
 *   returns, and never into a signature;
 *
 *   responsibility is per template. The tests below assert that one review's
 *   self-assessment is hand-filled while another's is drafted, because that
 *   difference is a decision a template makes and the kind of thing a later
 *   "tidy-up" would flatten into one rule.
 *
 * The library under test is the FIXTURE registry (`src/test/forms/
 * fixture-forms.ts`), which exercises every block kind the engine supports.
 */

const seed = (key: string) => {
  const found = TEMPLATE_SEEDS.find((entry) => entry.key === key);
  if (!found) throw new Error(`no seed ${key}`);
  return found;
};

/** A document round-tripped through JSON, the way the database stores it. */
const stored = (document: FormDocument) =>
  parseFormDocument(JSON.parse(JSON.stringify(document)));

describe("reading a stored document", () => {
  it("round-trips every seeded template", () => {
    for (const template of TEMPLATE_SEEDS) {
      const parsed = stored(template.document);
      expect(parsed.blocks.length, template.key).toBe(template.document.blocks.length);
    }
  });

  it("refuses a block kind it does not understand", () => {
    // Rendering "most of" a disciplinary form is worse than refusing to render
    // it: the missing part is invisible on the page that gets signed.
    expect(() => parseFormDocument({ blocks: [{ kind: "iframe" }] })).toThrow(FormDocumentError);
  });

  it("refuses two fields with the same key", () => {
    expect(() =>
      parseFormDocument({
        blocks: [
          { kind: "field", field: { key: "a", label: "A", input: "text", responsibility: "ai" } },
          { kind: "field", field: { key: "a", label: "B", input: "text", responsibility: "ai" } },
        ],
      }),
    ).toThrow(/duplicate field key/);
  });

  it("refuses a field whose responsibility is not one of the six", () => {
    expect(() =>
      parseFormDocument({
        blocks: [
          { kind: "field", field: { key: "a", label: "A", input: "text", responsibility: "whoever" } },
        ],
      }),
    ).toThrow(/unknown responsibility/);
  });

  it("refuses a checkbox group with no options", () => {
    expect(() =>
      parseFormDocument({
        blocks: [{ kind: "checkbox_group", key: "k", options: [], responsibility: "ai" }],
      }),
    ).toThrow(/no options/);
  });
});

describe("role variants", () => {
  it("gives each reading its own position description and nothing else", () => {
    const document = stored(seed("fixture-role-review").document);
    const lead = blocksForVariant(document, "lead");
    const trainee = blocksForVariant(document, "trainee");

    const references = (blocks: typeof lead) =>
      blocks.filter((block) => block.kind === "reference").length;

    // One reference block each — never both, never neither.
    expect(references(lead)).toBe(1);
    expect(references(trainee)).toBe(1);
    // And the two readings are otherwise the same document.
    expect(lead.length).toBe(trainee.length);
    expect(fieldsForVariant(document, "lead").map((f) => f.key)).toEqual(
      fieldsForVariant(document, "trainee").map((f) => f.key),
    );
    expect(JSON.stringify(lead)).not.toContain(FIXTURE_TRAINEE_DESCRIPTION);
  });

  it("resolves {{role}} and {{roleAbbr}} from the chosen variant", () => {
    const document = stored(seed("fixture-role-review").document);
    const variant = FIXTURE_REVIEW_VARIANTS[0];
    const rendered = renderDocument(document, variant);
    const text = JSON.stringify(rendered);

    expect(text).not.toContain("{{role}}");
    expect(text).not.toContain("{{roleAbbr}}");
    expect(text).toContain("Store Lead");
    expect(text).toContain("Fixture Role Review - SL");
  });

  it("leaves an unknown placeholder visible rather than blanking it", () => {
    /*
     * A form that prints "{{seniority}}" is obviously broken and gets fixed. A
     * form that prints an empty space looks finished and is not.
     */
    expect(interpolate("Reviewed by {{seniority}}", FIXTURE_REVIEW_VARIANTS[0])).toBe(
      "Reviewed by {{seniority}}",
    );
  });

  it("parses stored variants and keeps the reviewed position", () => {
    const parsed = parseFormVariants(JSON.parse(JSON.stringify(FIXTURE_REVIEW_VARIANTS)));
    expect(parsed.map((v) => v.key)).toEqual(["lead", "trainee"]);
    expect(parsed[0].reviewedPosition).toBe("SL");
  });

  it("starts each template on its first reading, and a template with none on none", () => {
    expect(defaultVariantKey("fixture-role-review")).toBe("lead");
    expect(defaultVariantKey("fixture-peer-review")).toBe("default");
    expect(defaultVariantKey("fixture-coaching")).toBeNull();
  });
});

describe("what the assistant is allowed to write", () => {
  const document = stored(seed("fixture-corrective").document);

  it("keeps values for AI fields", () => {
    const result = enforceResponsibilities(document, null, {
      values: { observation: "Arrived 25 minutes late on three shifts." },
    });
    expect(result.values.observation).toContain("25 minutes late");
    expect(result.rejected).toEqual([]);
  });

  it("drops a field that is not on this template version", () => {
    const result = enforceResponsibilities(document, null, {
      values: { employee_signature: "Jane Smith" },
    });
    expect(result.values).toEqual({});
    expect(result.rejected[0].reason).toMatch(/not a field/);
  });

  it("drops checkbox options the form does not offer", () => {
    const result = enforceResponsibilities(document, null, {
      checked: { warning_type: ["written", "banishment"] },
    });
    expect(result.checked.warning_type).toEqual(["written"]);
    expect(result.rejected[0].reason).toMatch(/options not on this form/);
  });

  it("never writes into a hand-filled field", () => {
    /*
     * The role review's self-assessment. The model is not shown these fields,
     * and if it returns them anyway the values are discarded — which is the
     * point of enforcing on the output rather than in the prompt.
     */
    const review = stored(seed("fixture-role-review").document);
    const result = enforceResponsibilities(review, "lead", {
      values: { self_succeeding: "I am doing well at scheduling." },
    });
    expect(result.values).toEqual({});
    expect(result.rejected[0].reason).toMatch(/manual fields are not drafted/);
  });

  it("never writes a signature, because there is nothing to write into", () => {
    // Signature blocks carry no key at all, so a signature cannot even be
    // addressed. This asserts that property rather than a filter that could be
    // removed.
    for (const template of TEMPLATE_SEEDS) {
      const parsed = stored(template.document);
      const keys = [...responsibilityMap(parsed, defaultVariantKey(template.key)).keys()];
      const signatureKeys = keys.filter((key) => /signature/i.test(key));
      expect(signatureKeys, template.key).toEqual([]);
    }
  });

  it("is offered no system fields to write", () => {
    // Employee name, date, job title and location come from the record. The
    // model is never asked for them, so it cannot get them wrong.
    const draftable = draftableFields(document, null).map((field) => field.key);
    expect(draftable).not.toContain("employee_name");
    expect(draftable).not.toContain("form_date");
    expect(draftable).toContain("observation");
  });
});

describe("what a person is allowed to write", () => {
  const document = stored(seed("fixture-role-review").document);

  it("lets a manager edit an AI-drafted field", () => {
    const result = enforcePersonEdit(document, "lead", {
      values: { plan_of_action: "Shadow an opening shift in week two." },
    });
    expect(result.values.plan_of_action).toContain("Shadow an opening shift");
  });

  it("refuses to store a hand-filled field from the app", () => {
    /*
     * Those lines are answered on the printed page, in the conversation. Typing
     * them into the app would put words in the employee's mouth.
     */
    const result = enforcePersonEdit(document, "lead", {
      values: { self_strengths: "Coaching, scheduling, merchandising" },
    });
    expect(result.values).toEqual({});
    expect(result.rejected[0].reason).toMatch(/manual fields are not completed/);
  });
});

describe("responsibility is per template, not per field name", () => {
  it("drafts one review's self review and leaves the other's by hand", () => {
    /*
     * THE ASSERTION THAT STOPS A TIDY-UP. Two questions that read almost the
     * same, answered differently by the template. A rule like "self-review
     * fields are always manual" would be wrong, and this fails if anyone adds
     * one.
     */
    const peer = stored(seed("fixture-peer-review").document);
    const role = stored(seed("fixture-role-review").document);

    expect(responsibilityMap(peer, "default").get("employee_self_review")).toBe("ai");
    expect(responsibilityMap(role, "lead").get("self_succeeding")).toBe("manual");
  });

  it("marks every policy-quoting field as grounded, and only those", () => {
    const grounded: string[] = [];
    for (const template of TEMPLATE_SEEDS) {
      const parsed = stored(template.document);
      for (const field of fieldsForVariant(parsed, defaultVariantKey(template.key))) {
        if (field.policyGrounded) grounded.push(`${template.key}:${field.key}`);
      }
    }
    expect(grounded.sort()).toEqual([
      "fixture-corrective:policy_language",
      "fixture-policy-review:policy_language",
      "fixture-policy-review:policy_violated",
    ]);
  });

  it("only ever grounds a field the assistant is allowed to draft", () => {
    // A grounded field that nobody may draft would be a contradiction: the
    // grounding exists to constrain the assistant's output.
    for (const template of TEMPLATE_SEEDS) {
      const parsed = stored(template.document);
      for (const field of fieldsForVariant(parsed, defaultVariantKey(template.key))) {
        if (field.policyGrounded) expect(field.responsibility, field.key).toBe("ai");
      }
    }
  });
});

describe("the library's seeds", () => {
  it("are each listed once", () => {
    const keys = TEMPLATE_SEEDS.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("record the framework provenance of a form with no paper source", () => {
    /*
     * The distinction that has to survive: a seed with no provenance stands
     * for a document the business issues on paper, and one that declares it
     * does not. Asserted on the seed because the seeder writes it onto the
     * template's asset row, so "which official form is this?" has an answer
     * months later.
     */
    const framework = TEMPLATE_SEEDS.filter((entry) => entry.provenance !== undefined);
    expect(framework.map((entry) => entry.key)).toEqual([FIXTURE_FOLLOW_UP_KEY]);
    expect(framework[0]!.provenance).toMatchObject({
      kind: "framework",
      note: expect.stringContaining("did NOT originate from an uploaded business PDF"),
    });
  });

  it("start every form that has the HR header with record-filled fields", () => {
    for (const template of TEMPLATE_SEEDS) {
      const parsed = stored(template.document);
      const map = responsibilityMap(parsed, defaultVariantKey(template.key));
      for (const key of ["employee_name", "form_date", "job_title", "location"]) {
        if (map.has(key)) expect(map.get(key), `${template.key}:${key}`).toBe("system");
      }
    }
  });

  it("asks a person for something on every form", () => {
    // A form nobody has to complete is a form that finalizes itself, which is
    // not what any of these documents are for.
    for (const template of TEMPLATE_SEEDS) {
      const parsed = stored(template.document);
      const people = requiredOfPeople(parsed, defaultVariantKey(template.key));
      const draftable = draftableFields(parsed, defaultVariantKey(template.key));
      expect(people.length + draftable.length, template.key).toBeGreaterThan(0);
    }
  });

  it("keeps a review's lifecycle in one document", () => {
    /*
     * Review, acknowledgement, re-evaluation and a second acknowledgement are
     * one form, not four. Splitting them would lose the link between a plan
     * and whether its objectives were met.
     */
    const parsed = stored(seed("fixture-role-review").document);
    const map = responsibilityMap(parsed, "lead");
    expect(map.has("plan_of_action")).toBe(true);
    expect(map.has("re_evaluation_notes")).toBe(true);

    const acknowledgements = parsed.blocks.filter((block) => block.kind === "acknowledgement");
    expect(acknowledgements.length).toBe(2);

    const pageBreaks = parsed.blocks.filter((block) => block.kind === "page_break");
    expect(pageBreaks.length).toBe(2);
  });
});

describe("the versioned visual style", () => {
  const withStyle = (style: unknown) =>
    parseFormDocument({ paper: "letter", style, blocks: [{ kind: "section", label: "S" }] });

  it("reads a full style back exactly as it was stored", () => {
    const style = {
      headingStyle: "rule",
      letterhead: "centered",
      margins: "wide",
      signatureLayout: "ruled",
      logo: { assetKey: "fixture-logo", placement: "top-right", widthPt: 76 },
    };
    expect(withStyle(style).style).toEqual(style);
  });

  it("is absent, not invented, on a document that has none", () => {
    /*
     * Every version written before the style model has no `style` key at all,
     * and must keep rendering the way it always did. An absent style is the
     * documented default, never an error.
     */
    const parsed = parseFormDocument({ paper: "letter", blocks: [{ kind: "section", label: "S" }] });
    expect(parsed.style).toBeUndefined();
    expect(withStyle(null).style).toBeUndefined();
    expect(withStyle({}).style).toBeUndefined();
  });

  it("refuses a style value it cannot render, rather than dropping it", () => {
    /*
     * The same rule as an unknown block kind, and for the same reason: a value
     * this code silently ignored would change how a signed document looks — or
     * fail to — with nothing anywhere saying so.
     *
     * GUARD ON THE GUARD: the valid spelling of each one is accepted directly
     * above and below, so these are refusals of the VALUE, not of the key.
     */
    expect(() => withStyle({ headingStyle: "underline" })).toThrow(FormDocumentError);
    expect(() => withStyle({ letterhead: "banner" })).toThrow(FormDocumentError);
    expect(() => withStyle({ margins: "narrow" })).toThrow(FormDocumentError);
    expect(() => withStyle({ signatureLayout: "stacked" })).toThrow(FormDocumentError);
    expect(() => withStyle({ logo: { assetKey: "x", placement: "middle", widthPt: 10 } })).toThrow(
      FormDocumentError,
    );
    expect(() => withStyle("rule")).toThrow(FormDocumentError);
  });

  it("refuses a logo with no key or no width", () => {
    // A logo reference that resolves to nothing is a masthead that silently
    // loses its mark on every printed record.
    expect(() => withStyle({ logo: { placement: "top-right", widthPt: 76 } })).toThrow(
      FormDocumentError,
    );
    expect(() => withStyle({ logo: { assetKey: "fixture-logo" } })).toThrow(FormDocumentError);
    expect(() => withStyle({ logo: { assetKey: "fixture-logo", widthPt: 0 } })).toThrow(
      FormDocumentError,
    );
  });

  it("carries a field's narrative marking through storage", () => {
    const parsed = parseFormDocument({
      paper: "letter",
      blocks: [
        {
          kind: "field",
          field: {
            key: "d",
            label: "D",
            input: "long_text",
            responsibility: "ai",
            narrative: "observed_expectation",
          },
        },
        {
          kind: "field",
          field: { key: "e", label: "E", input: "text", responsibility: "ai", narrative: "nonsense" },
        },
      ],
    });
    const [first, second] = parsed.blocks;
    expect(first.kind === "field" && first.field.narrative).toBe("observed_expectation");
    // An unrecognised marking is dropped rather than trusted: it can only ever
    // relax a guard, never tighten one.
    expect(second.kind === "field" && second.field.narrative).toBeUndefined();
  });
});
