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
    // Changed on purpose (QA, 26 Oct 2026): a whole-turn reply is written as the
    // store answer, without the roster name's comma, so the incident reader
    // never takes it for the Issue and no splitter cuts at the comma.
    expect(withStoreAliases({ question: "dodge", history: asked } as unknown as AskRequest).question).toBe("the store is Omaha NE (West Dodge Rd)");
    expect(withStoreAliases({ question: "Dodge", history: asked } as unknown as AskRequest).question).toBe("the store is Omaha NE (West Dodge Rd)");
    expect(ids(withStoreAliases({ question: "Dodge, ne", history: asked } as unknown as AskRequest).question)).toEqual([DODGE]);
    expect(withStoreAliases({ question: "dodge", history: [] } as unknown as AskRequest).question).toBe("dodge");
  });

  it("leaves people, unknown places, shared names and roster names as typed", () => {
    for (const text of ["avery dodge", "create a ca for avery kearney", "empire, sd", "sioux falls", "Omaha, NE (West Dodge Rd)", "dodge"]) {
      expect(rosterNames(text)).toBe(text);
    }
  });
});

/**
 * QA, 26 Oct 2026, with STORE_ALIAS_ENABLED on alone (the sibling app's
 * finding, same mechanism here): a typed Permanent Address must stay as typed,
 * and a later place word must never change the store once one is named.
 */
describe("STORE_ALIAS_ENABLED on: addresses and later place words", () => {
  const EXIT = "create an exit form for Test Employee at Kearney, permanent address 123 Main St, kearney ne 68847. She did not call in for her last two shifts. Last day worked 10-20-26";

  it.each([EXIT, EXIT.toLowerCase(), EXIT.toUpperCase()])("keeps the typed address as typed: %s", (turn) => {
    process.env[FLAG] = "on";
    const address = /123 main st, kearney ne 68847/i.exec(turn)![0];
    expect(withStoreAliases({ question: turn, history: [] } as unknown as AskRequest).question).toContain(address);
    expect(rosterNames(`permanent address ${address}`)).toBe(`permanent address ${address}`);
  });

  it.each(["change store location to dodge ne", "Change store location to Dodge NE", "CHANGE STORE LOCATION TO DODGE NE"])(
    "leaves a later place word as typed once a store is named: %s",
    (later) => {
      process.env[FLAG] = "on";
      const history = [
        { role: "user", content: "do verbal corrective action for Test Employee, team member at Kearney, NE. location." },
        { role: "assistant", content: "Got it." },
        { role: "user", content: later },
        { role: "assistant", content: "Got it." },
      ];
      const out = withStoreAliases({ question: "create a Corrective Action Form for Test Employee", history } as unknown as AskRequest);
      expect(out.history.map((turn) => turn.content)).toEqual(history.map((turn) => turn.content));
    },
  );

  it("still names the first store from an alias after other turns", () => {
    process.env[FLAG] = "on";
    const history = [
      { role: "user", content: "ca for test testy, late 9-20-26" },
      { role: "assistant", content: "Which store is this for?" },
    ];
    const out = withStoreAliases({ question: "dodge ne", history } as unknown as AskRequest);
    expect(ids(out.question)).toContain(DODGE);
  });
});
