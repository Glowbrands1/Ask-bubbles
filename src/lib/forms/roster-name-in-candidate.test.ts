import { afterEach, describe, expect, it, vi } from "vitest";

import { couldBeOnRoster } from "./roster-shape";

/**
 * ROSTER_NAME_IN_CANDIDATE_ENABLED (QA, 5 Nov 2026, R2; found in the sibling app).
 * The story's words, people invented: "When Odessa spoke with District manager
 * Brenna Kowaldane …" reads the candidate "When Odessa". With
 * FORM_NAME_FROM_ROSTER_ENABLED it is set aside as shaped like nobody; in the
 * sibling app the card then went to the district manager.
 */
const ROSTER = ["Marnie Holloway", "Remy Calder", "Odessa Farrow Lindqvist", "Brenna Kowaldane"];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ROSTER_NAME_IN_CANDIDATE_ENABLED: a candidate ending in a roster person's name could be them", () => {
  it("off: \"When Odessa\" is shaped like nobody (as before)", () => {
    expect(couldBeOnRoster("When Odessa", ROSTER)).toBe(false);
  });

  it("on: \"When Odessa\" (a sentence word, then her first name) could be Odessa Farrow Lindqvist", () => {
    vi.stubEnv("ROSTER_NAME_IN_CANDIDATE_ENABLED", "true");
    expect(couldBeOnRoster("When Odessa", ROSTER)).toBe(true);
    expect(couldBeOnRoster("Then Odessa Farrow", ROSTER)).toBe(true);
  });

  it("on: metrics and offenses are still nobody (Pau, 4 Nov 2026)", () => {
    vi.stubEnv("ROSTER_NAME_IN_CANDIDATE_ENABLED", "true");
    for (const phrase of ["Club Close", "Under", "Club Average", "Spa", "Under Performance"]) {
      expect(couldBeOnRoster(phrase, ROSTER), phrase).toBe(false);
    }
  });

  it("on: a roster last name alone at the end is not enough (\"Club Calder\")", () => {
    vi.stubEnv("ROSTER_NAME_IN_CANDIDATE_ENABLED", "true");
    expect(couldBeOnRoster("Club Calder", ROSTER)).toBe(false);
  });
});
