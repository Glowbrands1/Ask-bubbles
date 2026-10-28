import { describe, expect, it } from "vitest";

import type { GroundedPerson } from "../grounded-entities";
import type { CheckContext } from "./check";
import { lastFirstReading } from "./last-first";

/**
 * LAST_FIRST_NAME_READ_ENABLED (ported from Ask Sunny, QA 27 Oct 2026): "Last,
 * First" in the manager's words, with every person invented. Today's name
 * reader stops at the comma: "Calder" for Remy Calder, "Varga Tess", no employee.
 */
const person = (id: string, firstName: string, lastName: string): GroundedPerson => ({
  id,
  firstName,
  lastName,
  preferredFirstName: null,
  locationIds: ["loc-0001"],
  positionName: null,
  employmentStatus: "active",
  title: null,
  primaryLocationName: null,
});
const PEOPLE = [person("e-1", "Remy", "Calder"), person("e-2", "Tess", "Varga"), person("e-3", "Remy", "Voss"), person("e-4", "Wren", "Halvorsen")];

const context = (managerTurns: string[], people = PEOPLE): CheckContext => ({
  managerTurns,
  people,
  locations: [],
  headings: [],
  today: "2026-10-27",
});
const name = (turns: string[], people = PEOPLE) => lastFirstReading(context(turns, people))?.employee?.name ?? null;

describe("'Last, First' in the manager's words", () => {
  it.each([
    ["My employee Calder, Remy has was 10 minutes late on her last two shifts. Please create a CA form so I can document.", "Remy Calder"],
    ["i need to issue a ca for someone being late / Calder, Remy was late on 10/20 / she was issued a verbal ca on 10.1", "Remy Calder"],
    ["create an exit form. employee name is Varga, Tess. tess gave and worked 2 week notice", "Tess Varga"],
    ["create corrective action form for Halvorsen, Wren, Assistant Manager", "Wren Halvorsen"],
    ["create coaching form for employee Varga, Tess who works the front. on 9-29-26 tess was out of dress code", "Tess Varga"],
  ])("reads the one person on the roster: %s", (turn, expected) => {
    expect(name([turn])).toBe(expected);
  });

  it("reads the newest turn's pair first", () => {
    expect(name(["create a ca for Calder, Remy", "no, it is for Varga, Tess"])).toBe("Tess Varga");
  });
});

describe("nothing is read that the roster cannot settle", () => {
  it("no pair, or not a person: nothing", () => {
    expect(name(["create a ca form for remy calder, she was late"])).toBeNull();
    expect(name(["Hello, Remy", "Tuesday, October 20 she was late", "Omaha, Nebraska"])).toBeNull();
  });

  it("a pair that fits two people is not read (Remy Calder and Remy Voss)", () => {
    expect(name(["create a ca for Remy, Calder"])).toBe("Remy Calder");
    expect(name(["create a ca for Remy, Remy"])).toBeNull();
  });

  it("no roster: nothing is read", () => {
    expect(name(["My employee Calder, Remy was late"], [])).toBeNull();
  });
});
