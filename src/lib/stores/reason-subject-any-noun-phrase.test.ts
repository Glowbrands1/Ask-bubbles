import { afterEach, describe, expect, it, vi } from "vitest";

import { ROSTER_STORE_INDEX } from "@/lib/forms/location-mention";

import { readStoreMentions } from "./resolver";

/*
 * REASON_SUBJECT_ANY_NOUN_PHRASE (Gate-Sunny's #975 follow-up, QA 14 Nov 2026): "she left early because her kid was
 * sick in lincoln" (Kearney here). Invented wording.
 */
afterEach(() => vi.unstubAllEnvs());

const ids = (text: string) => readStoreMentions(text, ROSTER_STORE_INDEX).mentions.flatMap((mention) => mention.locationIds);
const on = (wide: boolean) => {
  vi.stubEnv("REASON_PLACE_NOT_STORE_ENABLED", "true");
  vi.stubEnv("REASON_SUBJECT_ANY_NOUN_PHRASE_ENABLED", wide ? "true" : "");
};

const REASONS = [
  "she left early because her kid was sick in kearney",
  "she was late because her car broke down in kearney",
  "she left early because her son got hurt at kearney",
  "she was late bc her mom was stuck in kearney",
];

describe("REASON_SUBJECT_ANY_NOUN_PHRASE", () => {
  it("off: a noun-phrase reason's place is read as the store (as on main)", () => {
    on(false);
    for (const said of REASONS) expect(ids(said), said).toEqual(["loc-66"]);
  });

  it("on: a noun-phrase reason's place is not a store", () => {
    on(true);
    for (const said of REASONS) expect(ids(said), said).toEqual([]);
  });

  it("on: a store said as the store, or where she was late, is still read", () => {
    on(true);
    for (const said of [
      "at kearney, she was late because her kid was sick",
      "she was late at kearney",
      "she was written up because she was late at kearney",
      "she was late because she was working at kearney",
      "she was late because she went to work in kearney",
      "since 11/3 she has been late at kearney",
    ]) {
      expect(ids(said), said).toEqual(["loc-66"]);
    }
  });
});
