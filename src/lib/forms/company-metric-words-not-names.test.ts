import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installPersonRoster, notAPerson } from "./person-guard";
import { extractEmployeeNames } from "./proposal";

/*
 * COMPANY_METRIC_WORDS_NOT_NAMES_ENABLED (QA, 11 Nov 2026, Coding-5's BCS-metrics probe). A sales Corrective Action
 * written in Buff City Soap's own KPI words lost its Issue: the name reader took "Comp Sales" and "Discount Rate" for
 * a person, the person guard let them through (only the sibling app's metric words were business vocabulary), and the
 * next turn's card was drawn from that turn alone. The account turns, word for word:
 */
const LOST = [
  "She was below goal in IPT, AOV and Comp Sales % for October",
  "She had 40 transactions and was below in IPT, AOV, and Discount Rate",
];

/** The candidates the name reader offers that the person guard lets through. */
const people = (text: string) => extractEmployeeNames(text).filter((name) => !notAPerson(name));

describe("COMPANY_METRIC_WORDS_NOT_NAMES_ENABLED", () => {
  beforeEach(() => vi.stubEnv("PERSON_GUARD_ENABLED", "true"));
  afterEach(() => {
    vi.unstubAllEnvs();
    installPersonRoster(() => undefined);
  });

  it.each(LOST)("off (production today): %s names a person (the bug)", (text) => {
    // Off pins its own flag (QA's off-pins guard, 11 Nov 2026): it must hold once production turns the flag on.
    vi.stubEnv("COMPANY_METRIC_WORDS_NOT_NAMES_ENABLED", "");
    expect(people(text)).not.toEqual([]);
  });

  it.each(LOST)("on: %s names nobody", (text) => {
    vi.stubEnv("COMPANY_METRIC_WORDS_NOT_NAMES_ENABLED", "true");
    expect(people(text)).toEqual([]);
  });

  it.each(["Comp Sales", "Discount Rate", "Net Sales", "Product Mix", "Laundry %", "SSSG", "AUV", "IPT", "AOV", "Items Per Transaction", "Average Order Value"])(
    "on: %s is not a person",
    (metric) => {
      vi.stubEnv("COMPANY_METRIC_WORDS_NOT_NAMES_ENABLED", "true");
      expect(notAPerson(metric)).toBe(true);
    },
  );

  it("on: a person whose surname is a metric word is still a person — on the roster and off it", () => {
    vi.stubEnv("COMPANY_METRIC_WORDS_NOT_NAMES_ENABLED", "true");
    // Off the roster, a first name keeps the candidate a person: only a phrase made wholly of metric words is ruled out.
    expect(notAPerson("Delphine Sales")).toBe(false);
    installPersonRoster(() => ["Delphine Sales", "Odile Mix"]);
    expect(notAPerson("Delphine Sales")).toBe(false);
    expect(notAPerson("Sales")).toBe(false);
    expect(notAPerson("Odile Mix")).toBe(false);
    expect(people("Delphine Sales was below goal in IPT and AOV")).toEqual(["Delphine Sales"]);
  });

  it("the sibling app's words are still recognised, on and off", () => {
    expect(people("She had 24 tans and was below in PPTA, LPSVA, Avg Club, CC%, and Spa%")).toEqual([]);
    vi.stubEnv("COMPANY_METRIC_WORDS_NOT_NAMES_ENABLED", "true");
    expect(people("She had 24 tans and was below in PPTA, LPSVA, Avg Club, CC%, and Spa%")).toEqual([]);
  });
});
