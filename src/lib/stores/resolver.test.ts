import { describe, expect, it } from "vitest";

import { COMPANY_LOCATIONS } from "@/lib/locations";

import { buildStoreIndex, describeStore, readStoreMentions, resolveStoreText, type StoreAlias } from "./resolver";

/**
 * The seven registered Buff City Soap stores, and the Woven names/numbers a
 * person has mapped to them in the Ask Bubbles database (read 2026-10-19):
 * Woven 123 → 236, 219 → 219, 225 → 264 ("NE Omaha Dodge"), 264 → 225
 * ("SD Sioux Falls"), 66 → 66, 67 → 67, "SD Dawley Farms" → 338.
 */
const WOVEN: StoreAlias[] = [
  { storeId: "loc-236", kind: "woven_name", text: "NE Grand Island" },
  { storeId: "loc-236", kind: "woven_number", text: "123" },
  { storeId: "loc-219", kind: "woven_name", text: "MO Lee's Summit" },
  { storeId: "loc-219", kind: "woven_number", text: "219" },
  { storeId: "loc-264", kind: "woven_name", text: "NE Omaha Dodge" },
  { storeId: "loc-264", kind: "woven_number", text: "225" },
  { storeId: "loc-225", kind: "woven_name", text: "SD Sioux Falls" },
  { storeId: "loc-225", kind: "woven_number", text: "264" },
  { storeId: "loc-66", kind: "woven_name", text: "NE Kearney" },
  { storeId: "loc-66", kind: "woven_number", text: "66" },
  { storeId: "loc-67", kind: "woven_name", text: "NE Bellevue" },
  { storeId: "loc-67", kind: "woven_number", text: "67" },
  { storeId: "loc-338", kind: "woven_name", text: "SD Dawley Farms" },
];

const index = buildStoreIndex({ stores: COMPANY_LOCATIONS, extraAliases: WOVEN });
const rosterOnly = buildStoreIndex({ stores: COMPANY_LOCATIONS });

function resolved(query: string, idx = index) {
  const result = resolveStoreText(query, idx);
  if (result.kind !== "resolved") throw new Error(`${query}: ${JSON.stringify(result)}`);
  return result;
}

describe("the registered stores are the only source", () => {
  it("knows exactly the seven registered stores", () => {
    expect(COMPANY_LOCATIONS.map((store) => store.code)).toEqual(["66", "67", "219", "225", "236", "264", "338"]);
  });

  it("describes a store by its registered name and number", () => {
    expect(describeStore(COMPANY_LOCATIONS[0]!)).toBe("Kearney, NE (Store 66)");
  });
});

describe("1. a complete store name", () => {
  it.each([
    ["Kearney, NE", "loc-66"],
    ["kearney ne", "loc-66"],
    ["KEARNEY, NE", "loc-66"],
    ["Lee's Summit, MO", "loc-219"],
    ["Lees Summit MO", "loc-219"],
    ["Sioux Falls, SD (W 41st St)", "loc-225"],
    ["Sioux Falls SD W 41st St", "loc-225"],
    ["Omaha, NE (West Dodge Rd)", "loc-264"],
    ["Sioux Falls, SD (E 18th St)", "loc-338"],
  ])("%s", (typed, id) => {
    const result = resolved(typed);
    expect(result.store.id).toBe(id);
    expect(result.confirm).toBe(false);
  });

  it("works from the registered roster alone, with no Woven names", () => {
    expect(resolved("Kearney, NE", rosterOnly).store.id).toBe("loc-66");
  });
});

describe("2. the store code or number", () => {
  it.each([
    ["236", "loc-236"],
    ["Store 236", "loc-236"],
    ["store #236", "loc-236"],
    ["#66", "loc-66"],
    ["location 338", "loc-338"],
  ])("%s", (typed, id) => {
    expect(resolved(typed).store.id).toBe(id);
  });

  it("is not a guess when no registered store has the number", () => {
    expect(resolveStoreText("Store 102", index)).toEqual({ kind: "not_found", query: "Store 102" });
  });
});

describe("3. common abbreviations", () => {
  it("reads a Woven name — what the team sees in Woven — as the store it was mapped to", () => {
    expect(resolved("NE Grand Island").store.id).toBe("loc-236");
    expect(resolved("SD Dawley Farms").store.id).toBe("loc-338");
    expect(resolved("NE Omaha Dodge").store.id).toBe("loc-264");
  });

  it("reads city initials as a store but asks before using it", () => {
    const result = resolved("GI");
    expect(result.store.id).toBe("loc-236");
    expect(result.confirm).toBe(true);
    expect(result.via).toBe("initials");
    expect(resolved("LS").store.id).toBe("loc-219");
  });

  it("reads a reviewed company nickname without asking", () => {
    const custom = buildStoreIndex({ stores: COMPANY_LOCATIONS, nicknames: { "the island": "236" } });
    const result = resolved("the island", custom);
    expect(result.store.id).toBe("loc-236");
    expect(result.confirm).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(resolved("ne grand island").store.id).toBe("loc-236");
    expect(resolved("gi").store.id).toBe("loc-236");
  });
});

describe("4. a partial store name", () => {
  it("resolves when only one store answers to it", () => {
    expect(resolved("Grand Island").store.id).toBe("loc-236");
    expect(resolved("Kearney").store.id).toBe("loc-66");
    expect(resolved("Dawley").store.id).toBe("loc-338");
    expect(resolved("Dodge").store.id).toBe("loc-264");
    expect(resolved("Bellevue").store.id).toBe("loc-67");
  });

  it("asks when several stores answer to it", () => {
    const result = resolveStoreText("Sioux Falls", index);
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") expect(result.candidates.map((store) => store.id).sort()).toEqual(["loc-225", "loc-338"]);
    expect(resolveStoreText("Sioux", index).kind).toBe("ambiguous");
    expect(resolveStoreText("SD Sioux Falls", index).kind).toBe("ambiguous");
  });
});

describe("5. a minor typo", () => {
  it.each([
    ["Kearny", "loc-66"],
    ["Bellvue", "loc-67"],
    ["Grand Iland", "loc-236"],
    ["Lee Summit", "loc-219"],
    ["Omahaa", "loc-264"],
  ])("%s is read as the store it is close to, and confirmed", (typed, id) => {
    const result = resolved(typed);
    expect(result.store.id).toBe(id);
    expect(result.confirm).toBe(true);
    expect(result.via).toBe("fuzzy");
  });

  it("does not stretch to a word that is not close to any store", () => {
    expect(resolveStoreText("Springfield", index).kind).toBe("not_found");
    expect(resolveStoreText("Kansas City", index).kind).toBe("not_found");
  });
});

describe("9. similar abbreviations", () => {
  it("never picks between two stores that share initials", () => {
    const result = resolveStoreText("SF", index);
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") expect(result.candidates.map((store) => store.code).sort()).toEqual(["225", "338"]);
  });
});

describe("store numbers two systems disagree about", () => {
  it("resolves a Woven number through its mapping when no registered store has it", () => {
    expect(resolved("store 123").store.id).toBe("loc-236");
  });

  it("is ambiguous where the registered code and the Woven number are different stores", () => {
    // Registered 225 is Sioux Falls (W 41st St); Woven 225 is the Omaha Dodge store.
    const result = resolveStoreText("store 225", index);
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.reason).toBe("number_collision");
      expect(result.candidates.map((store) => store.id).sort()).toEqual(["loc-225", "loc-264"]);
    }
  });

  it("is plain where both systems agree", () => {
    expect(resolved("store 66").store.id).toBe("loc-66");
  });

  it("ignores Woven numbers that no person mapped", () => {
    expect(resolveStoreText("store 123", rosterOnly).kind).toBe("not_found");
  });

  it("ignores a mapping to a store that is not registered", () => {
    const stray = buildStoreIndex({
      stores: COMPANY_LOCATIONS,
      extraAliases: [{ storeId: "loc-999", kind: "woven_number", text: "555" }],
    });
    expect(resolveStoreText("store 555", stray).kind).toBe("not_found");
  });
});

describe("in a sentence", () => {
  const read = (text: string) => readStoreMentions(text, index);

  it("finds the store behind each way of saying it", () => {
    for (const [text, id] of [
      ["Create a coaching form for Sarah at Store 236", "loc-236"],
      ["coaching for Sarah at the Kearney store", "loc-66"],
      ["Sarah at NE Grand Island today", "loc-236"],
      ["Sarah at Dawley Farms", "loc-338"],
      ["Sarah in Lees Summit", "loc-219"],
      ["a corrective action for Sarah at #67", "loc-67"],
    ] as const) {
      const { mentions } = read(text);
      expect(mentions.flatMap((mention) => mention.locationIds), text).toEqual([id]);
      expect(mentions.some((mention) => mention.confirm), text).toBe(false);
    }
  });

  it("flags a typo or initialism for confirmation", () => {
    for (const text of ["Sarah at Kearny store", "Sarah at Kearny", "Sarah at GI"]) {
      const { mentions } = read(text);
      expect(mentions.length, text).toBeGreaterThan(0);
      expect(mentions.every((mention) => mention.confirm), text).toBe(true);
    }
  });

  it("says when a store number names no registered store", () => {
    expect(read("Create a coaching form for Sarah at Store 102")).toEqual({ mentions: [], unmatched: ["Store 102"] });
    expect(read("coaching for Sarah at the Springfield store").unmatched).toEqual(["Springfield"]);
  });

  it("does not read ordinary words as stores", () => {
    for (const text of [
      "Sarah was late again at lunch today",
      "Sarah has worked in sales for years",
      "coaching for Sarah about the front store display",
      "Sarah came from Omaha last year",
      "she called at 9 and again at 10",
    ]) {
      const { mentions, unmatched } = read(text);
      expect({ text, mentions, unmatched }).toEqual({ text, mentions: [], unmatched: [] });
    }
  });

  /*
   * Name, role, store — the way the paperwork signs a person off (ported from
   * the reference platform's QA of 20 October 2026). The role abbreviation is
   * the cue that a store follows. Read on the roster as it ships, where a
   * city on its own needs a cue (a mapped Woven name can stand without one).
   */
  const readRoster = (text: string) => readStoreMentions(text, rosterOnly);

  it("reads a multi-word store named right after a role abbreviation", () => {
    for (const [text, ids] of [
      ["Brandi Algya ASM Lee's Summit. Properly uploading documentation", ["loc-219"]],
      ["Brandi Algya DM Grand Island", ["loc-236"]],
      ["Brandi Algya ASM Sioux Falls", ["loc-225", "loc-338"]],
    ] as const) {
      expect(readRoster(text).mentions.flatMap((mention) => mention.locationIds), text).toEqual(ids);
    }
  });

  it("does not read a store from a role followed by anything else", () => {
    // One word after a role can be the person ("my ASM Kearney"), and a word
    // that is not a job title is no cue at all.
    expect(readRoster("my ASM Kearney was late").mentions).toEqual([]);
    expect(readRoster("my DM Bellevue called").mentions).toEqual([]);
    expect(readRoster("Brandi Algya from Grand Island").mentions).toEqual([]);
  });
});

/*
 * PUNCTUATION AND WHAT FOLLOWS A STORE (ported from the reference platform's
 * QA of 21 October 2026). Read on the roster as it ships.
 */
describe("a store set off by punctuation, or followed by what the form is about", () => {
  const readRoster = (text: string) => readStoreMentions(text, rosterOnly).mentions.flatMap((mention) => mention.locationIds);

  it.each([
    // What the form is about does not hide the store before it.
    ["coaching form for jane at kearney about bed cleaning", ["loc-66"]],
    ["at grand island regarding her breaks", ["loc-236"]],
    ["she works at kearney who needs a coaching form", ["loc-66"]],
    // A comma ends the store's name.
    ["she works at kearney, needs a coaching form", ["loc-66"]],
    // Brackets set a whole store name off, like commas.
    ["Avery Testperson (Lee's Summit)", ["loc-219"]],
    ["Avery Testperson (Grand Island), late twice", ["loc-236"]],
  ])("reads %s", (text, ids) => {
    expect(readRoster(text)).toEqual(ids);
  });

  it.each([
    // One bracketed word could be a surname.
    "Avery (Kearney) was late",
    // A store's road on its own is still a road, bracketed or not.
    "she parked on west dodge again",
    "Avery Testperson (West Dodge)",
  ])("reads no store in %s", (text) => {
    expect(readRoster(text)).toEqual([]);
  });

  it("the full registered name, brackets and all, is still one mention", () => {
    // The bracketed road adds nothing beside the registered name it belongs to.
    expect(readStoreMentions("coaching at Omaha, NE (West Dodge Rd) today", rosterOnly).mentions).toHaveLength(1);
    expect(readRoster("coaching at Omaha, NE (West Dodge Rd) today")).toEqual(["loc-264"]);
  });
});
