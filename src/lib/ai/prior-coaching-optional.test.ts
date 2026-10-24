import { describe, expect, it } from "vitest";

import { priorCoachingOptionalEnabled } from "@/lib/config/chat-quality-flags";

import { applyOptionalPriorCoaching, typedPriorCoachingNote } from "./prior-coaching-optional";

const HELD =
  "You'll set any prior coaching or corrective action on the form — I won't guess at it.\n\nCreate the draft here when you're ready.";

describe("optional prior coaching", () => {
  it("leaves the proposal unchanged while the flag is off", () => {
    const same = applyOptionalPriorCoaching(HELD, {
      enabled: false,
      records: [{ status: "finalized", line: "Coaching — signed 07/01/2026" }],
      managerText: "coached verbally in July",
    });
    expect(same).toBe(HELD);
    expect(priorCoachingOptionalEnabled()).toBe(false);
  });

  it("accepts the typed note 'coached verbally in July' when nothing is finalized", () => {
    expect(typedPriorCoachingNote("She was coached verbally in July about opening.")).toBe("coached verbally in July");
    const text = applyOptionalPriorCoaching(HELD, {
      enabled: true,
      records: [],
      managerText: "coached verbally in July",
    });
    expect(text).toContain("Prior coaching note: coached verbally in July");
    expect(text).toContain("The draft can still be created.");
  });

  /**
   * Live conv conv_mvmeuuth27eykk3, ported from Ask Sunny PR 165:
   * "There's no prior coaching on file." was written as a note.
   */
  it.each([
    "There's no prior coaching on file.",
    "no prior coaching",
    "none of the prior coaching is on file",
    "not prior coaching",
    "never had prior coaching",
    "without prior coaching",
    "he hasn't had prior coaching",
  ])("does not claim prior coaching exists for %j", (managerText) => {
    expect(typedPriorCoachingNote(managerText)).toBeNull();
    const text = applyOptionalPriorCoaching(HELD, {
      enabled: true,
      records: [],
      managerText,
    });
    expect(text).toContain("the line stays blank");
    expect(text).not.toContain("Prior coaching note:");
    expect(text).not.toContain("prior coaching on file");
    expect(text).not.toContain("No finalized record was required");
    expect(text).toContain("The draft can still be created.");
  });

  it("keeps prior coaching stated after 'but'", () => {
    const managerText = "no write-up but prior coaching was done verbally";
    expect(typedPriorCoachingNote(managerText)).toBe("prior coaching was done verbally");
  });

  it("keeps prior coaching when the denial governs a different verb", () => {
    expect(typedPriorCoachingNote("She didn't improve after prior coaching in September")).toBe(
      "prior coaching in September",
    );
  });

  it("does not take a question plus 'none' as a prior-coaching note", () => {
    expect(typedPriorCoachingNote("prior coaching? none")).toBeNull();
  });

  it("keeps a later positive note after a denial in an earlier sentence", () => {
    expect(typedPriorCoachingNote("There's no prior coaching on file.\nShe was coached verbally in July")).toBe(
      "coached verbally in July",
    );
  });

  it("does not change the card for a denial while the flag is off", () => {
    const text = applyOptionalPriorCoaching(HELD, {
      enabled: false,
      records: [],
      managerText: "There's no prior coaching on file.",
    });
    expect(text).toBe(HELD);
  });
});
