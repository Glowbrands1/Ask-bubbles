import { describe, expect, it } from "vitest";

import { COMPANY_FORMS } from "@/config/company/forms";
import { EXAMPLE_CHECK_IN_KEY } from "@/config/company/forms/example-check-in";

import {
  asksAboutForms,
  detectTemplateIntent,
  formRequestPhrase,
  isFormVocabulary,
  leadingFormRequest,
} from "./template-intent";
import { TEMPLATE_SEEDS } from "./library";

/**
 * The grammar is platform; the form NAMES come from the company registry.
 * These tests use the registry's example form, and the "every registered
 * form" checks run over whatever the registry holds — so replacing the
 * catalog keeps them meaningful rather than breaking them.
 */

describe("an explicitly named template resolves to that template", () => {
  it.each([
    "I need a check-in form for Sarah Lopez",
    "create a team member check-in for Marcus",
    "please make a check in form for Avery",
    "pls make a check-in frm for Avery",
  ])("%s", (question) => {
    expect(detectTemplateIntent(question)).toEqual({
      kind: "explicit",
      templateKey: EXAMPLE_CHECK_IN_KEY,
    });
  });

  it("recognises every registered form by its own published name", () => {
    for (const entry of COMPANY_FORMS) {
      expect(detectTemplateIntent(`I need a ${entry.seed.name} for Jordan Vance`)).toEqual({
        kind: "explicit",
        templateKey: entry.seed.key,
      });
    }
  });

  it("only ever names keys the library seeds", () => {
    const seeded = new Set(TEMPLATE_SEEDS.map((seed) => seed.key));
    for (const entry of COMPANY_FORMS) {
      for (const phrase of entry.intentPhrases) {
        const intent = detectTemplateIntent(`start a ${phrase} for Dana Moss`);
        if (intent.kind === "explicit") expect(seeded).toContain(intent.templateKey);
      }
    }
  });

  it("round-trips the form picker's own sentence", () => {
    for (const entry of COMPANY_FORMS) {
      expect(detectTemplateIntent(formRequestPhrase(entry.seed.name))).toEqual({
        kind: "explicit",
        templateKey: entry.seed.key,
      });
    }
  });
});

describe("no default template", () => {
  it.each([
    "create a form for Sarah",
    "I need a form",
    "can you make me a form for Jordan",
    "fill out a form for the new hire",
  ])("%s asks which form", (question) => {
    expect(detectTemplateIntent(question)).toEqual({ kind: "ambiguous" });
  });

  it.each([
    "what is our return policy?",
    "how do I close the register?",
    "Sarah was late again today",
    "",
  ])("%s is not a form request", (question) => {
    expect(detectTemplateIntent(question)).toEqual({ kind: "none" });
  });
});

describe("questions about forms are not requests for one", () => {
  it.each([
    "what is the check-in form for?",
    "when should I use the check-in form?",
    "what's the difference between a check-in form and a write-up?",
  ])("%s", (question) => {
    expect(asksAboutForms(question)).toBe(true);
    expect(detectTemplateIntent(question)).toEqual({ kind: "none" });
  });

  it("does not read a creation request as a question", () => {
    expect(asksAboutForms("create a check-in form for Sarah Lopez")).toBe(false);
  });
});

describe("refusals and negations", () => {
  it.each([
    "I don't need a form, just advice on scheduling",
    "no paperwork yet, how should I approach this?",
    "never mind the form",
  ])("%s", (question) => {
    expect(detectTemplateIntent(question)).toEqual({ kind: "none" });
  });

  it("does not take a negated naming as the request", () => {
    expect(detectTemplateIntent("not a check-in form, just tell me what to say")).toEqual({
      kind: "none",
    });
  });
});

describe("leadingFormRequest", () => {
  it("reads the form and the person a message leads with", () => {
    expect(leadingFormRequest("Check-in form for Jane Doe")).toEqual({
      templateKey: EXAMPLE_CHECK_IN_KEY,
      subject: ["Jane", "Doe"],
    });
    expect(leadingFormRequest("check-in — Jane Doe")).toEqual({
      templateKey: EXAMPLE_CHECK_IN_KEY,
      subject: ["Jane", "Doe"],
    });
  });

  it("returns null for a message that does not open with a form's name", () => {
    expect(leadingFormRequest("Jane was late again")).toBeNull();
  });
});

describe("form vocabulary is never somebody's name", () => {
  it.each(["form", "check-in", "location", "template"])("%s", (word) => {
    expect(isFormVocabulary(word.split("-")[0]!)).toBe(true);
  });
});
