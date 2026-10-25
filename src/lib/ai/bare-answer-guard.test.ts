import { afterEach, describe, expect, it } from "vitest";

import type { ChatFormProposal } from "@/types";

import { bindBareAnswer, withBareAnswerBinding } from "./bare-answer-guard";
import type { AskRequest, AskResponse } from "./types";

/**
 * Ask Bubbles conv_mvofpdj12iwndws and conv_mvofk1r32edmbmk, 25 Oct 2026.
 * The manager's turns ("dodge", "tm", "verbal") and the app's lines are
 * copied exactly; the employee is invented (Rhea Dunmore). "dodge" became
 * the Job title, "tm" the Employee, and "verbal" the Job title.
 */
const FLAG = "BARE_ANSWER_BINDING_ENABLED";
const saved = process.env[FLAG];
afterEach(() => {
  if (saved === undefined) delete process.env[FLAG];
  else process.env[FLAG] = saved;
});

function card(extra: Partial<ChatFormProposal> = {}): ChatFormProposal {
  return {
    proposalId: "prop-1",
    supportsInlineDraft: true,
    templateKey: "dpoa",
    templateName: "Corrective Action Form",
    variantKey: null,
    employeeName: "rhea dunmore",
    employeeRole: null,
    formDate: null,
    locationId: null,
    locationName: null,
    locationResolution: "not_applicable",
    authorizedLocationIds: [],
    status: "ready",
    sourceMessageIds: [],
    ...extra,
  };
}

const ASKED = [
  "I can create a **Corrective Action Form** for **rhea dunmore**.",
  "",
  "**Store:** Omaha, NE (West Dodge Rd), as you said — tell me if that should change",
  "",
  "One more question: **Is payroll deduct applicable?** Yes or No? Tell me here, or tick it on the form — I won't answer it for you.",
].join("\n");

const HISTORY = [
  { role: "user", content: "dodge" },
  { role: "assistant", content: ASKED, formProposal: card() },
];

function respond(proposal: ChatFormProposal, content: string): AskResponse {
  return { content, citations: [], formProposal: proposal } as unknown as AskResponse;
}

function respondWith(proposal: ChatFormProposal, content: string): AskResponse {
  return { content, citations: [], formProposal: proposal } as unknown as AskResponse;
}

describe("BARE_ANSWER_BINDING_ENABLED off", () => {
  it("keeps 'tm' as the Employee, as main does", () => {
    delete process.env[FLAG];
    const response = respond(card({ employeeName: "tm", employeeRole: "Dodge" }), "I can create a **Corrective Action Form** for **tm**.");
    expect(withBareAnswerBinding(response, { question: "tm", history: HISTORY } as unknown as AskRequest)).toBe(response);
  });
});

describe("BARE_ANSWER_BINDING_ENABLED on", () => {
  it("'tm' is the Job title, the employee stays, and 'Dodge' is not a title", () => {
    process.env[FLAG] = "on";
    const response = respond(card({ employeeName: "tm", employeeRole: "Dodge" }), "I can create a **Corrective Action Form** for **tm**.");
    const out = bindBareAnswer({ response, question: "tm", history: HISTORY });
    expect(out.formProposal?.employeeName).toBe("rhea dunmore");
    expect(out.formProposal?.employeeRole).toBe("Team Member");
    expect(out.content).toBe("I can create a **Corrective Action Form** for **rhea dunmore**.");
  });

  it("'verbal' is never the Job title or the Employee", () => {
    process.env[FLAG] = "on";
    const asRole = bindBareAnswer({ response: respond(card({ employeeRole: "Verbal" }), "x"), question: "Verbal", history: HISTORY });
    expect(asRole.formProposal?.employeeRole).toBeNull();
    const asName = bindBareAnswer({ response: respond(card({ employeeName: "verbal" }), "for **verbal**"), question: "verbal", history: HISTORY });
    expect(asName.formProposal?.employeeName).toBe("rhea dunmore");
  });

  it("'no prior' and 'yes' are never the Employee; 'Kearney' is never the Job title", () => {
    process.env[FLAG] = "on";
    for (const word of ["no prior", "No prior", "prior", "yes", "Yes", "f", "F", "Tm"]) {
      const out = bindBareAnswer({ response: respond(card({ employeeName: word }), `for **${word}**`), question: word, history: HISTORY });
      expect(out.formProposal?.employeeName).toBe("rhea dunmore");
    }
    const kearney = bindBareAnswer({ response: respond(card({ employeeRole: "Kearney" }), "x"), question: "yes", history: HISTORY });
    expect(kearney.formProposal?.employeeRole).toBeNull();
  });

  it("a bare 'yes' to the payroll question still answers it; a one-word name stays", () => {
    process.env[FLAG] = "on";
    const yes = respond(card({ payrollDeduct: "yes" }), "Is payroll deduct applicable? **Yes** — tell me if that should change.");
    expect(bindBareAnswer({ response: yes, question: "yes", history: HISTORY })).toBe(yes);
    const named = respond(card({ employeeName: "Lisa" }), "for **Lisa**");
    expect(bindBareAnswer({ response: named, question: "Lisa", history: [] })).toBe(named);
  });

  it("'Yes' after 'Woven has <name>' puts that name on the card", () => {
    process.env[FLAG] = "on";
    const typed = card({ employeeName: "rhea dunmor" });
    const history = [{ role: "assistant", content: "I can create a **Corrective Action Form** for **rhea dunmor**.\n\nWoven has Rhea Dunmore", formProposal: typed }];
    const out = bindBareAnswer({ response: respondWith(typed, "I can create a **Corrective Action Form** for **rhea dunmor**."), question: "Yes", history });
    expect(out.formProposal?.employeeName).toBe("Rhea Dunmore");
    expect(out.content).toBe("I can create a **Corrective Action Form** for **Rhea Dunmore**.");
    const two = [{ role: "assistant", content: "Woven has Rhea Dunmore or Rhea Dunmoore", formProposal: typed }];
    const both = respondWith(typed, "x");
    expect(bindBareAnswer({ response: both, question: "yes", history: two })).toBe(both);
  });
});
