import { afterEach, describe, expect, it } from "vitest";

import { readLocationMentions } from "@/lib/forms/location-mention";

import { rosterNames, withStoreAliases } from "./store-alias";
import type { AskRequest } from "./types";

/**
 * QA, 25 Oct 2026 (Bubbles production, invented names): "dodge ne" and
 * "dodge, ne" left the store Not set and the Create draft button never
 * appeared, also after the bare reply "dodge, ne"; "dodge ne location" and
 * "at our dodge ne store" the same.
 */
const FLAG = "STORE_ALIAS_ENABLED";
const saved = process.env[FLAG];
afterEach(() => {
  if (saved === undefined) delete process.env[FLAG];
  else process.env[FLAG] = saved;
});

const DODGE = "loc-264";
const KEARNEY = "loc-66";

function ids(text: string): string[] {
  return [...new Set(readLocationMentions(text).flatMap((mention) => mention.locationIds))];
}

describe("STORE_ALIAS_ENABLED off", () => {
  it("passes the turn on as typed; main reads no store in 'dodge ne' or 'dodge, ne'", () => {
    delete process.env[FLAG];
    const request = { question: "dodge, ne", history: [] } as unknown as AskRequest;
    expect(withStoreAliases(request)).toBe(request);
    expect(ids("dodge ne")).toEqual([]);
    expect(ids("dodge, ne")).toEqual([]);
  });
});

describe("STORE_ALIAS_ENABLED on", () => {
  it.each([
    ["dodge ne", DODGE],
    ["dodge, ne", DODGE],
    ["DODGE, NE", DODGE],
    ["Dodge NE", DODGE],
    ["Dodge ne", DODGE],
    ["Dodge, ne", DODGE],
    ["I need a ca for avery stone at dodge ne location", DODGE],
    ["Kearney ne", KEARNEY],
    ["dodge ne location", DODGE],
    ["at our dodge ne store", DODGE],
    ["i need a ca for avery stone at dodge ne location", DODGE],
    ["kearney ne", KEARNEY],
    ["kearney, ne", KEARNEY],
    ["omaha dodge", DODGE],
  ])("reads %s as its store", (text, id) => {
    expect(ids(rosterNames(text))).toEqual([id]);
  });

  it("reads the bare reply 'dodge, ne', and 'dodge' after the app asked which store", () => {
    process.env[FLAG] = "on";
    const asked = [{ role: "assistant", content: "I have **avery stone**. Which store is this for? Name it here or on the form." }];
    expect(ids(withStoreAliases({ question: "dodge, ne", history: asked } as unknown as AskRequest).question)).toEqual([DODGE]);
    expect(withStoreAliases({ question: "dodge", history: asked } as unknown as AskRequest).question).toBe("Omaha, NE (West Dodge Rd)");
    expect(withStoreAliases({ question: "Dodge", history: asked } as unknown as AskRequest).question).toBe("Omaha, NE (West Dodge Rd)");
    expect(ids(withStoreAliases({ question: "Dodge, ne", history: asked } as unknown as AskRequest).question)).toEqual([DODGE]);
    expect(withStoreAliases({ question: "dodge", history: [] } as unknown as AskRequest).question).toBe("dodge");
  });

  it("leaves people, unknown places, shared names and roster names as typed", () => {
    for (const text of ["avery dodge", "create a ca for avery kearney", "empire, sd", "sioux falls", "Omaha, NE (West Dodge Rd)", "dodge"]) {
      expect(rosterNames(text)).toBe(text);
    }
  });
});
