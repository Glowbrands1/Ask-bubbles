import { afterEach, describe, expect, it } from "vitest";

import { applyGroundedProposal, prepareGroundedQuestion, type GroundedPerson } from "@/lib/ai/grounded-entities";
import { captureFormState } from "@/lib/ai/form-state";
import { flaggedCitationWrite } from "@/lib/ai/policy-citation-fields";
import type { AccessScope, ChatFormProposal } from "@/types";
import type { ManualChunk } from "@/lib/forms/official-policy-manual";

import {
  cardEmployeeName,
  isoCardDate,
  replayQuestions,
  singleAccountStore,
  storeWithoutGate,
  stripNonNameTokens,
} from "./anti-loop";

const savedAnti = process.env.ANTI_LOOP_ENABLED;

afterEach(() => {
  if (savedAnti === undefined) delete process.env.ANTI_LOOP_ENABLED;
  else process.env.ANTI_LOOP_ENABLED = savedAnti;
});

function card(over: Partial<ChatFormProposal> = {}): ChatFormProposal {
  return {
    proposalId: "p1",
    templateKey: "dpoa",
    templateName: "Corrective Action Form",
    supportsInlineDraft: false,
    variantKey: null,
    employeeName: "Odette Brannock",
    employeeRole: "Team Member",
    locationId: null,
    locationName: null,
    locationResolution: "needs_selection",
    authorizedLocationIds: ["loc-225", "loc-338"],
    locationCandidates: ["Sioux Falls, SD (W 41st St)", "Sioux Falls, SD (E 18th St)"],
    status: "needs_location",
    sourceMessageIds: [],
    ...over,
  };
}

function person(id: string, first: string, last: string): GroundedPerson {
  return {
    id,
    firstName: first,
    lastName: last,
    locationIds: ["loc-264"],
    positionName: "Team Member",
    title: "Team Member",
    primaryLocationName: "Omaha, NE (West Dodge Rd)",
  };
}

describe("anti-loop name, store, date, and harness", () => {
  it("keeps a real name and strips stores, labels, and promos", () => {
    expect(stripNonNameTokens("Test Employee")).toBe("Test Employee");
    expect(stripNonNameTokens("Odette Brannock")).toBe("Odette Brannock");
    expect(stripNonNameTokens("Testy Testerson Dodge promo")).toBe("Testy Testerson");
    expect(stripNonNameTokens("location payroll policy")).toBeNull();
    expect(stripNonNameTokens("Job Title")).toBeNull();
    expect(stripNonNameTokens("Job Title Team Member")).toBeNull();
    expect(stripNonNameTokens("Title")).toBeNull();
    expect(stripNonNameTokens("Date")).toBeNull();
    expect(stripNonNameTokens("Store")).toBeNull();
    expect(stripNonNameTokens("Salon")).toBeNull();
    expect(stripNonNameTokens("Role")).toBeNull();
    expect(stripNonNameTokens("Position")).toBeNull();
    expect(stripNonNameTokens("Location")).toBeNull();
    expect(stripNonNameTokens("Store Director")).toBe("Store Director");
    expect(stripNonNameTokens("Jane Store")).toBe("Jane Store");
    expect(stripNonNameTokens("Jane Salon")).toBe("Jane Salon");
    expect(stripNonNameTokens("Evangeline Pembury Title")).toBe("Evangeline Pembury");
    expect(stripNonNameTokens("Evangeline Pembury Job")).toBe("Evangeline Pembury");
  });

  it("ignores a model employee only when the flag is on", () => {
    delete process.env.ANTI_LOOP_ENABLED;
    expect(cardEmployeeName("Test Employee", "Promo Dodge")).toBe("Test Employee");
    expect(cardEmployeeName(null, "Promo Dodge")).toBe("Promo Dodge");
    process.env.ANTI_LOOP_ENABLED = "1";
    expect(cardEmployeeName("Test Employee Dodge", "Promo Dodge")).toBe("Test Employee");
    expect(cardEmployeeName(null, "Promo Dodge")).toBeNull();
  });

  it("keeps an ISO date and drops any other shape", () => {
    expect(isoCardDate("2026-10-15")).toBe("2026-10-15");
    expect(isoCardDate("10-15-26")).toBeNull();
    expect(isoCardDate(null)).toBeNull();
  });

  it("reads one account store and no store for a global account", () => {
    const global: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
    const one: AccessScope = { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] };
    const two: AccessScope = { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: ["loc-67"] };
    expect(singleAccountStore(global)).toBeNull();
    expect(singleAccountStore(two)).toBeNull();
    expect(singleAccountStore(one)).toBe("loc-264");
  });

  it("leaves a resolved store, and otherwise does not ask", () => {
    delete process.env.ANTI_LOOP_ENABLED;
    const dodge = card({
      employeeName: "Testy Testerson",
      locationId: "loc-264",
      locationName: "Omaha, NE (West Dodge Rd)",
      locationResolution: "resolved",
      status: "ready",
    });
    expect(storeWithoutGate(dodge, { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] }, [])).toBe(dodge);

    process.env.ANTI_LOOP_ENABLED = "1";
    expect(storeWithoutGate(dodge, { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] }, []).locationId).toBe(
      "loc-264",
    );

    const empire = storeWithoutGate(
      card(),
      { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] },
      [],
    );
    expect(empire.locationId).toBeNull();
    expect(empire.locationName).toBeNull();
    expect(empire.locationResolution).toBe("unavailable");
    expect(empire.locationCandidates).toBeUndefined();
    expect(empire.status).toBe("ready");
    expect(empire.supportsInlineDraft).toBe(true);

    const assigned = storeWithoutGate(
      card({ employeeName: "Test Employee" }),
      { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] },
      ["loc-264", "loc-67"],
    );
    expect(assigned.locationId).toBe("loc-66");
    expect(assigned.locationSource).toBe("assignment");

    const fromRoster = storeWithoutGate(
      card({ employeeName: "Test Employee" }),
      { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: ["loc-67"] },
      ["loc-264"],
    );
    expect(fromRoster.locationId).toBe("loc-264");
    expect(fromRoster.locationSource).toBe("woven");
  });

  it("counts a dropped first message as a harness event", () => {
    const { questions, events } = replayQuestions([
      "",
      "create a written corrective action for Team Member, Test Employee.",
    ]);
    expect(events).toEqual([
      expect.objectContaining({ kind: "dropped_first_message" }),
    ]);
    expect(questions).toEqual(["create a written corrective action for Team Member, Test Employee."]);
    expect(replayQuestions(["name is Test Employee"]).events).toEqual([]);
  });

  it("keeps a stored incident until the manager describes a new one", () => {
    const opening = "on 10-22-26 odette was not scheduled and came in to show her puppy";
    process.env.ANTI_LOOP_ENABLED = "1";
    const prior = captureFormState(null, {
      proposal: card(),
      employeeId: null,
      keptTypedName: "Odette Brannock",
      userText: opening,
      policyHeading: null,
      policyPage: null,
    });
    const held = captureFormState(prior, {
      proposal: card(),
      employeeId: null,
      keptTypedName: "Odette Brannock",
      userText: "jba manual 11-1-25",
      policyHeading: null,
      policyPage: null,
    });
    expect(held.incident).toBe(prior.incident);
    expect(held.incident).toMatch(/puppy/);
    const changed = captureFormState(held, {
      proposal: card(),
      employeeId: null,
      keptTypedName: "Odette Brannock",
      userText: "she was late for her shift",
      policyHeading: null,
      policyPage: null,
    });
    expect(changed.incident).toMatch(/late for her shift/);

    delete process.env.ANTI_LOOP_ENABLED;
    const replaced = captureFormState(prior, {
      proposal: card(),
      employeeId: null,
      keptTypedName: "Odette Brannock",
      userText: "jba manual 11-1-25",
      policyHeading: null,
      policyPage: null,
    });
    expect(replaced.incident).toMatch(/jba manual 11-1-25/);
  });

  it("does not refuse an unmatched name or ask Did you mean when the flag is on", () => {
    const jane = person("e-jane", "Jane", "Doe");
    const jayne = person("e-jayne", "Jayne", "Doe");
    const prep = {
      question: "Create a coaching form for Jyne Doe",
      rosterIds: null,
      keptTypedNames: [],
      unmatched: ["Jyne Doe"],
      ambiguous: [jane, jayne],
      ambiguousTyped: "Jyne Doe",
      keptTypedName: null,
      employeeId: null,
    };
    const response = {
      content: "Did you mean **Jane Doe** or **Jayne Doe**? More than one person is a close match.",
      citations: [],
      formProposal: card({
        employeeName: "Jyne Doe",
        templateKey: "coaching",
        templateName: "Coaching Form",
        locationId: "loc-264",
        locationName: "Omaha, NE (West Dodge Rd)",
        locationResolution: "resolved",
        status: "ready",
      }),
    };

    process.env.ANTI_LOOP_ENABLED = "1";
    const on = applyGroundedProposal(response, { people: [jane, jayne], prep, rosterEmpty: false });
    expect(on.content).not.toMatch(/Did you mean/);
    expect(on.content).not.toMatch(/not on the form/);
    expect(on.formProposal?.employeeName).toBe("Jyne Doe");

    delete process.env.ANTI_LOOP_ENABLED;
    const off = applyGroundedProposal(response, { people: [jane, jayne], prep, rosterEmpty: false });
    expect(off.content).toMatch(/couldn't find/);
    expect(off.content).toMatch(/not on the form/);
    expect(off.content).toMatch(/Did you mean/);

    const unmatched = applyGroundedProposal(
      {
        content: "Here is the form.",
        citations: [],
        formProposal: card({
          employeeName: "Test Employee",
          locationId: "loc-264",
          locationName: "Omaha, NE (West Dodge Rd)",
          locationResolution: "resolved",
          status: "ready",
        }),
      },
      {
        people: [jane],
        rosterEmpty: false,
        prep: { ...prep, question: "Create a corrective action for Test Employee", unmatched: ["Test Employee"], ambiguous: [], ambiguousTyped: null },
      },
    );
    expect(unmatched.content).toMatch(/not on the form/);
    expect(unmatched.formProposal?.employeeName).toBeNull();

    process.env.ANTI_LOOP_ENABLED = "1";
    const kept = applyGroundedProposal(
      {
        content: "Here is the form.",
        citations: [],
        formProposal: card({
          employeeName: "Test Employee",
          locationId: "loc-264",
          locationName: "Omaha, NE (West Dodge Rd)",
          locationResolution: "resolved",
          status: "ready",
        }),
      },
      {
        people: [jane],
        rosterEmpty: false,
        prep: { ...prep, question: "Create a corrective action for Test Employee", unmatched: ["Test Employee"], ambiguous: [], ambiguousTyped: null },
      },
    );
    expect(kept.content).not.toMatch(/not on the form/);
    expect(kept.formProposal?.employeeName).toBe("Test Employee");
  });

  it("leaves an unmatched name in the question when the flag is on", () => {
    const jane = person("e-jane", "Jane", "Doe");
    process.env.ANTI_LOOP_ENABLED = "1";
    const on = prepareGroundedQuestion({
      question: "Create a corrective action for Test Employee",
      history: [],
      people: [jane],
      saved: null,
    });
    expect(on.question).toMatch(/Test Employee/);
    expect(on.unmatched).toEqual([]);

    delete process.env.ANTI_LOOP_ENABLED;
    const off = prepareGroundedQuestion({
      question: "Create a corrective action for Test Employee",
      history: [],
      people: [jane],
      saved: null,
    });
    expect(off.unmatched.length).toBeGreaterThan(0);
  });

  it("cites the printed page from the heading map when the flag is on", () => {
    const chunks: ManualChunk[] = [
      {
        chunkIndex: 2,
        page: 13,
        printedPage: 12,
        section: "Standards of Conduct",
        content: "Standards of Conduct\nThe company states this rule.",
        sections: [{ heading: "Standards of Conduct", page: 13 }],
      },
    ];
    const input = {
      enabled: true,
      templateKey: "dpoa",
      values: { policy_language: "" },
      notes: "this is a violation under Standards of Conduct",
      chunks,
      manual: {
        documentId: "doc-jba",
        documentTitle: "JBA Policy Manual Edited 5.2025",
        matchedBy: "fallback" as const,
      },
    };
    process.env.ANTI_LOOP_ENABLED = "1";
    expect(flaggedCitationWrite(input).values.policy_language).toMatch(/Standards of Conduct Policy, JBA Policy Manual p\.12/);
    delete process.env.ANTI_LOOP_ENABLED;
    expect(flaggedCitationWrite(input).values.policy_language).toMatch(/p\.13/);
  });
});
