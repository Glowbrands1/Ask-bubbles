import { describe, expect, it } from "vitest";

import {
  carriesAttribution,
  EVIDENCE_BASIS_RULES,
  guardEvidenceBasis,
  reportedOnly,
  unsupportedEvidence,
} from "./evidence-basis";

/**
 * Improvement A: a draft keeps the standing the manager gave each statement —
 * reported, observed, documented, confirmed — and adds no evidence. Synthetic
 * names only.
 */

const REPORTED = "Create a coaching form for Avery Testperson. A client complained that she was short with them at the front counter today.";
const OBSERVED = "Create a coaching form for Avery Testperson. I saw her ignore two guests at the counter today.";

describe("the rules every drafting prompt carries", () => {
  it("names each standing a statement can have", () => {
    const rules = EVIDENCE_BASIS_RULES.join(" ");
    expect(rules).toMatch(/written as a report/);
    expect(rules).toMatch(/what they observed/);
    expect(rules).toMatch(/Never add evidence/);
    expect(rules).toMatch(/confirmed, verified, admitted/);
  });
});

describe("evidence the manager never mentioned", () => {
  it.each([
    "Camera footage shows Avery ignoring the guest.",
    "A witness confirmed the exchange.",
    "A written statement from a coworker describes the exchange.",
    "The receipts show the discount was applied without approval.",
    "The time clock records show she clocked in 20 minutes late.",
  ])("removes %j", (sentence) => {
    expect(unsupportedEvidence(sentence, REPORTED)).not.toEqual([]);
  });

  it("keeps evidence the manager did mention", () => {
    const notes = "The camera footage shows her taking product without paying, and I have the receipt.";
    expect(unsupportedEvidence("Camera footage shows Avery leaving with product.", notes)).toEqual([]);
    expect(unsupportedEvidence("The receipt shows no purchase was made.", notes)).toEqual([]);
  });

  it("leaves ordinary coaching words alone when they are not offered as proof", () => {
    for (const sentence of [
      "Reply to guest emails within one business day.",
      "Give every guest a receipt at checkout.",
      "Take before and after photos of each display reset.",
    ]) {
      expect(unsupportedEvidence(sentence, REPORTED), sentence).toEqual([]);
    }
  });
});

describe("a confirmation, admission or finding the manager never stated", () => {
  it.each([
    "Avery admitted she was rude to the client.",
    "The complaint was confirmed.",
    "It was found that Avery violated the guest service standard.",
    "An investigation determined the complaint was valid.",
    "Avery acknowledged the behaviour.",
  ])("removes %j", (sentence) => {
    expect(unsupportedEvidence(sentence, REPORTED)).not.toEqual([]);
  });

  it("keeps one the manager stated", () => {
    const notes = `${REPORTED} I spoke with her and she admitted it.`;
    expect(unsupportedEvidence("Avery admitted she was short with the client.", notes)).toEqual([]);
  });
});

describe("guarding a drafted form", () => {
  it("removes only the unsupported sentences and keeps the rest of the field verbatim", () => {
    const result = guardEvidenceBasis(
      {
        coaching_details:
          "A client reported that Avery was short with them at the front counter. Camera footage confirms the exchange. Avery is expected to greet every guest warmly.",
        other_topic: "Guest service",
      },
      REPORTED,
    );
    expect(result.values.coaching_details).toBe(
      "A client reported that Avery was short with them at the front counter. Avery is expected to greet every guest warmly.",
    );
    expect(result.values.other_topic).toBe("Guest service");
    expect(result.adjusted).toEqual(["coaching_details"]);
    expect(result.removed).toEqual(["Camera footage confirms the exchange."]);
  });

  it("keeps a labelled narrative's other sections, and drops a label left with nothing under it", () => {
    const result = guardEvidenceBasis(
      {
        observation:
          "Observed:\nA client reported that Avery was short with them. Avery admitted it.\n\nExpectation:\nGuests are greeted warmly.",
      },
      REPORTED,
    );
    expect(result.values.observation).toBe(
      "Observed:\nA client reported that Avery was short with them.\n\nExpectation:\nGuests are greeted warmly.",
    );
  });

  it("empties a field that held nothing but unsupported claims, and says so", () => {
    const result = guardEvidenceBasis({ specific_evidence: "Witnessed by two coworkers." }, REPORTED);
    expect(result.values.specific_evidence).toBeUndefined();
    expect(result.emptied).toEqual(["specific_evidence"]);
  });

  it("passes a grounded draft through byte for byte", () => {
    const values = { coaching_details: "Avery ignored two guests at the counter today. Every guest is greeted within a minute." };
    expect(guardEvidenceBasis(values, OBSERVED)).toMatchObject({ values, adjusted: [], removed: [], unattributed: false });
  });
});

describe("a relayed report written as established", () => {
  it("tells reported notes from observed ones", () => {
    expect(reportedOnly(REPORTED)).toBe(true);
    expect(reportedOnly("A coworker told me she left the register open.")).toBe(true);
    expect(reportedOnly("I was told she left early on Saturday.")).toBe(true);
    expect(reportedOnly(OBSERVED)).toBe(false);
    // A report the manager then saw for themselves is their observation too.
    expect(reportedOnly(`${REPORTED} I watched the next shift and saw it myself.`)).toBe(false);
    // The employee's own explanation is not an allegation about them.
    expect(reportedOnly("She was 20 minutes late today. She said her car broke down.")).toBe(false);
  });

  it("flags a draft that states a reported matter as fact, without changing a word", () => {
    const values = { coaching_details: "Avery was short with a client at the front counter today." };
    const result = guardEvidenceBasis(values, REPORTED);
    expect(result.unattributed).toBe(true);
    expect(result.values).toEqual(values);
  });

  it("does not flag a draft that says it was reported", () => {
    for (const text of [
      "A client reported that Avery was short with them at the front counter.",
      "A client complained about how Avery spoke to them at the counter.",
      "According to a client, Avery was short with them.",
    ]) {
      expect(carriesAttribution(text), text).toBe(true);
      expect(guardEvidenceBasis({ coaching_details: text }, REPORTED).unattributed, text).toBe(false);
    }
  });

  it("does not flag what the manager saw", () => {
    expect(guardEvidenceBasis({ coaching_details: "Avery ignored two guests at the counter today." }, OBSERVED).unattributed).toBe(false);
  });
});
