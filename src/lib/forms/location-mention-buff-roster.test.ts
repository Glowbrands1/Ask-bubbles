import { describe, expect, it } from "vitest";

import { COMPANY_LOCATIONS } from "@/lib/locations";

import { readLocationMentions } from "./location-mention";
import { proposeLocation } from "./location-scope";
import type { AccessScope } from "@/types";

/**
 * ============================================================================
 * THE SHIPPED BUFF CITY SOAP ROSTER, NOT THE REFERENCE FIXTURE
 * ============================================================================
 *
 * Every other location test mocks `@/config/company/locations` with the
 * reference platform's roster, whose stores are named "NE Kearney". Buff's are
 * "Kearney, NE" and "Omaha, NE (West Dodge Rd)", so the reader that passed all
 * of those tests matched almost nothing a manager actually types. Admin
 * feedback, 16 Oct 2026: "It does not seem to be pulling the correct locations."
 *
 * This file deliberately does NOT mock the roster.
 */

const ids = (text: string) => readLocationMentions(text).map((mention) => [...mention.locationIds].sort());
const only = (text: string) => {
  const found = ids(text);
  return found.length === 1 ? found[0] : found;
};

const GLOBAL: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

describe("the shipped roster is the one under test", () => {
  it("is Buff's seven stores, named city-first", () => {
    expect(COMPANY_LOCATIONS.map((location) => location.name)).toContain("Kearney, NE");
    expect(COMPANY_LOCATIONS.map((location) => location.name)).toContain("Omaha, NE (West Dodge Rd)");
  });
});

describe("store names, as managers type them", () => {
  it.each([
    ["she works at Kearney", ["loc-66"]],
    ["at Kearney, out of dress code", ["loc-66"]],
    ["at Grand Island out of dress code", ["loc-236"]],
    ["Test Employee at Grand Island out of dress code 3 shifts", ["loc-236"]],
    ["Kearney NE", ["loc-66"]],
    ["Kearney, NE", ["loc-66"]],
    ["the Bellevue location", ["loc-67"]],
    ["at Bellevue today", ["loc-67"]],
    ["at Lee's Summit, she was late", ["loc-219"]],
    ["coached her at lees summit", ["loc-219"]],
    ["our Grand Island location", ["loc-236"]],
    ["Grand Island store", ["loc-236"]],
  ])("%j", (text, expected) => {
    expect(only(text)).toEqual(expected);
  });
});

describe("the two roads that tell Omaha and Sioux Falls apart", () => {
  it.each([
    ["she is at Dodge", ["loc-264"]],
    ["she is at Omaha dodge", ["loc-264"]],
    ["at Omaha West Dodge", ["loc-264"]],
    ["Omaha West Dodge Rd", ["loc-264"]],
    ["Omaha, NE (West Dodge Rd)", ["loc-264"]],
    ["Sioux Falls E 18th St", ["loc-338"]],
    ["Sioux Falls 18th", ["loc-338"]],
    ["Sioux Falls W 41st St", ["loc-225"]],
    ["Sioux Falls 41st", ["loc-225"]],
  ])("%j", (text, expected) => {
    expect(only(text)).toEqual(expected);
  });
});

describe("store codes", () => {
  it.each([
    ["store 66", "loc-66"],
    ["store #264", "loc-264"],
    ["location 219", "loc-219"],
    ["#338", "loc-338"],
  ])("%j", (text, id) => {
    expect(only(text)).toEqual([id]);
  });

  it("does not read an ordinary number as a store", () => {
    expect(ids("she was 66 minutes late")).toEqual([]);
    expect(ids("late 10 minutes on 10/15")).toEqual([]);
  });
});

describe("choosing a store in reply to a question", () => {
  it.each([
    "Use Kearney as the location",
    "use kearney",
    "Kearney",
    "kearney.",
    "Kearney is the store",
    "change it to Kearney",
    "location is Kearney",
  ])("%j", (text) => {
    expect(only(text)).toEqual(["loc-66"]);
  });

  it("reads a turn that is only the place, even after other lines", () => {
    const text = "Create a corrective action for Casey in Sioux Falls, out of dress code.\n\nE 18th St";
    expect(ids(text)).toContainEqual(["loc-338"]);
    expect(proposeLocation(GLOBAL, text)).toEqual({ resolution: "resolved", locationId: "loc-338" });
  });
});

describe("ambiguous names are all of the stores, never one of them", () => {
  it.each(["in Sioux Falls", "the Sioux Falls store", "she works at Sioux Falls today"])("%j", (text) => {
    expect(ids(text).every((found) => found.join() === "loc-225,loc-338")).toBe(true);
    expect(ids(text).length).toBeGreaterThan(0);
  });

  it("is a question for the manager, naming only those stores", () => {
    expect(proposeLocation(GLOBAL, "a form for Casey in Sioux Falls")).toMatchObject({
      resolution: "needs_selection",
      authorizedIds: ["loc-225", "loc-338"],
      namedAmbiguous: true,
      selection: { reason: "ambiguous" },
    });
  });

  it("a later, more specific answer narrows an earlier vague one", () => {
    expect(proposeLocation(GLOBAL, "a form for Casey in Sioux Falls\n\nE 18th St")).toEqual({
      resolution: "resolved",
      locationId: "loc-338",
    });
  });

  it("two genuinely different stores stay a question", () => {
    const result = proposeLocation(GLOBAL, "she works at Kearney and Bellevue");
    expect(result.resolution).toBe("needs_selection");
    expect(result.resolution === "needs_selection" && [...result.authorizedIds].sort()).toEqual(["loc-66", "loc-67"]);
  });
});

describe("what is not a store", () => {
  it.each([
    "I met Kearney Smith yesterday",
    "she was late on the 18th",
    "he was late on 41st street",
    "the dodge was late",
    "Springfield",
    "at Springfield",
  ])("%j", (text) => {
    expect(ids(text)).toEqual([]);
  });

  it("never invents a store for an unknown place", () => {
    expect(proposeLocation(GLOBAL, "at Springfield").resolution).toBe("not_applicable");
  });

  it("a scoped manager can never be sent to a store outside their assignment", () => {
    const scoped: AccessScope = { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] };
    const result = proposeLocation(scoped, "she is at Bellevue");
    expect(result).toMatchObject({ resolution: "needs_selection", authorizedIds: ["loc-66"], outOfScopeName: "Bellevue, NE" });
  });
});
