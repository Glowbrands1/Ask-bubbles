import { afterEach, describe, expect, it } from "vitest";

import type { ChatFormProposal } from "@/types";

import { applyGroundedProposal, prepareGroundedQuestion, type GroundedPerson } from "./grounded-entities";

/**
 * GROUNDED_ENTITIES on, ANTI_LOOP off: a name Woven does not list used to
 * become "I couldn't find **Test Employee** in the Woven roster, so that
 * name is not on the form", and the form lost the name. The typed spelling
 * stays. No new reply text, and no "Woven has …" note.
 */

const FLAG = "GROUNDED_ENTITIES_ENABLED";
let previous: string | undefined;

afterEach(() => {
  if (previous === undefined) delete process.env[FLAG];
  else process.env[FLAG] = previous;
  delete process.env.ANTI_LOOP_ENABLED;
  delete process.env.TYPED_NAME_ENABLED;
});

function flag(on: boolean) {
  previous = process.env[FLAG];
  process.env[FLAG] = on ? "1" : "off";
  delete process.env.ANTI_LOOP_ENABLED;
  delete process.env.TYPED_NAME_ENABLED;
}

function person(): GroundedPerson {
  return {
    id: "e-jane",
    firstName: "Jane",
    lastName: "Doe",
    locationIds: ["loc-66"],
    positionName: "Team Member",
    title: "Team Member",
    primaryLocationName: "Kearney, NE",
  };
}

function card(employeeName: string | null): ChatFormProposal {
  return {
    proposalId: "p1",
    templateKey: "dpoa",
    templateName: "Corrective Action Form",
    supportsInlineDraft: true,
    variantKey: null,
    employeeName,
    employeeRole: null,
    locationId: "loc-66",
    locationName: "Kearney, NE",
    locationResolution: "resolved",
    authorizedLocationIds: [],
    status: employeeName ? "ready" : "needs_employee",
    sourceMessageIds: [],
  };
}

const QUESTION = "Create a corrective action for Test Employee at Kearney. She left the register drawer open.";

describe("grounded entities keeps a name Woven does not list", () => {
  it("keeps Test Employee exactly as typed and adds no roster sentence or Woven note", () => {
    flag(true);
    const jane = person();
    const prepared = prepareGroundedQuestion({
      question: QUESTION,
      history: [],
      people: [jane],
      saved: null,
    });
    expect(prepared.question).toContain("Test Employee");
    expect(prepared.unmatched).toEqual([]);
    const short = prepareGroundedQuestion({
      question: "Create a corrective action for Test Employee",
      history: [],
      people: [jane],
      saved: null,
    });
    expect(short.question).toContain("Test Employee");
    expect(short.unmatched).toEqual([]);

    const applied = applyGroundedProposal(
      {
        content: "Here is the form.",
        citations: [],
        formProposal: card("Test Employee"),
      },
      {
        people: [jane],
        rosterEmpty: false,
        prep: { ...prepared, unmatched: ["Test Employee"] },
      },
    );
    expect(applied.content).toBe("Here is the form.");
    expect(applied.content).not.toMatch(/couldn't find|not on the form|Woven has/i);
    expect(applied.formProposal?.employeeName).toBe("Test Employee");
    expect(applied.formProposal?.status).toBe("ready");
    expect(applied.formProposal?.supportsInlineDraft).toBe(true);
    expect(applied.formProposal?.closeMatchNote).toBeUndefined();
  });

  it("still refuses that name when grounded entities is off and anti-loop is off", () => {
    flag(false);
    const jane = person();
    const prepared = prepareGroundedQuestion({
      question: "Create a corrective action for Test Employee",
      history: [],
      people: [jane],
      saved: null,
    });
    expect(prepared.question).not.toContain("Test Employee");
    expect(prepared.unmatched.join(" ")).toMatch(/Test/);

    const applied = applyGroundedProposal(
      {
        content: "Here is the form.",
        citations: [],
        formProposal: card("Test Employee"),
      },
      {
        people: [jane],
        rosterEmpty: false,
        prep: { ...prepared, unmatched: ["Test Employee"] },
      },
    );
    expect(applied.content).toMatch(/I couldn't find \*\*Test Employee\*\* in the Woven roster/);
    expect(applied.content).toMatch(/not on the form/);
    expect(applied.formProposal?.employeeName).toBeNull();
    expect(applied.formProposal?.status).toBe("needs_employee");
    expect(applied.formProposal?.supportsInlineDraft).toBe(false);
    expect(applied.formProposal?.closeMatchNote).toBeUndefined();
  });
});
