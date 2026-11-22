import { describe, expect, it, vi } from "vitest";

import * as companyLocations from "@/config/company/locations";

/*
 * QA's live re-test (21 Nov 2026, item 10 / A7): "do verbal for team member <A> at <nickname>, sd ..." and "store location
 * is <nickname>, sd. create corrective action" were refused as "isn't one of your stores" three times. The company's own
 * nickname list (`COMPANY_LOCATION_NICKNAMES`, keyed to a store code: loc-<code>) is the alias table: a listed nickname
 * is the store. It ships empty (QA: the owner fills it); this file lists an INVENTED one for these tests only.
 */
vi.mock("@/config/company/locations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/company/locations")>();
  return { ...actual, COMPANY_LOCATION_NICKNAMES: { harrowgate: "338" } };
});

const { readSalonMentions } = await import("./places");

describe("a store nickname (A7)", () => {
  it("a nickname the company lists is that store, as the loop reads a store the manager typed", () => {
    expect(readSalonMentions("at harrowgate, sd").flatMap((mention) => mention.salonIds)).toEqual(["loc-338"]);
  });

  /*
   * Changed on purpose (Pau, 22 Nov 2026, via QA, A7): "Empire, SD" is the Sioux Falls W 41st St store, the table's first
   * reviewed entry (was: the table ships empty). The point is unchanged: the table holds only reviewed entries, and nothing
   * is guessed for a nickname nobody listed.
   */
  it("the shipped alias table holds only the reviewed entries: nothing is guessed for a nickname nobody listed", async () => {
    const shipped = await vi.importActual<typeof companyLocations>("@/config/company/locations");
    expect(shipped.COMPANY_LOCATION_NICKNAMES).toEqual({ empire: "225" });
    expect(readSalonMentions("at bluffview").flatMap((mention) => mention.salonIds)).toEqual([]);
  });
});
