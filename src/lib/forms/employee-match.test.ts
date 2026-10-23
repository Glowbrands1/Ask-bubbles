import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { matchEmployeeName, rosterNameNamedIn, type RosterEmployee } from "./employee-match";
import { withKeptTypedNames } from "./kept-typed-names";
import { readEmployeeMentions } from "./proposal";

/* Synthetic people only. QA, 22 Oct 2026: see `rosterNameNamedIn`. */
const person = (id: string, firstName: string, lastName: string, preferredFirstName: string | null = null) =>
  ({ id, firstName, lastName, preferredFirstName, locationIds: [] }) as unknown as RosterEmployee;
const ROSTER = [
  person("1", "Tess", "Varga"),
  person("2", "Remy", "Calder"),
  person("3", "Theodora", "Lind", "Teddy"),
  person("4", "Tess", "Varga"),
];

describe("the one person on the roster the words name in full", () => {
  it.each([
    ["write up tess varga, written warning", "Tess Varga"],
    ["can you write up REMY CALDER? she skipped the meeting", "Remy Calder"],
    ["teddy lind missed the woven deadline", "Theodora Lind"],
  ])("%s", (text, name) => {
    expect(rosterNameNamedIn(text, ROSTER)).toBe(name);
  });

  it.each([
    ["two people named", "write up tess varga and remy calder"],
    ["a first name alone", "write up remy for missing the meeting"],
    ["part of a longer word", "tess vargas came in late"],
    ["nobody", "write up the notes from the meeting"],
    ["a coworker in the account", "write up tess for skipping the meeting, her coworker remy calder saw it"],
    ["a witness", "remy calder told me tess skipped the meeting, written CA"],
  ])("%s → nobody", (_why, text) => {
    expect(rosterNameNamedIn(text, ROSTER)).toBeNull();
  });

  it("two people sharing one name is one name; the name check then asks which", () => {
    expect(rosterNameNamedIn("write up tess varga", ROSTER)).toBe("Tess Varga");
  });
});

describe("a reason after \"for\" is not a name", () => {
  it.each([
    ["Tess Varga needs a written CA for missing the meeting", ["Tess Varga"]],
    ["written CA for violating the cell phone policy", []],
    ["CA for leaving early on 10/20", []],
  ])("%s", (text, names) => {
    expect(readEmployeeMentions(text).names).toEqual(names);
  });

  it("a name that ends in -ing is still a name where nothing a verb takes follows it", () => {
    expect(readEmployeeMentions("CA for sterling hayes, late today").names).toEqual(["sterling hayes"]);
  });
});

describe("kept names stay on the server", () => {
  const kaitlyn = person("9", "Kaitlyn", "Smith");

  it("the matcher the chat screen imports does not pull node:async_hooks", () => {
    const source = readFileSync("src/lib/forms/employee-match.ts", "utf8");
    expect(source).not.toContain("node:async_hooks");
    expect(source).not.toContain("AsyncLocalStorage");
  });

  it("a name the manager kept is not asked about again, and an unset store still asks", () => {
    expect(matchEmployeeName("Katlin Smith", [kaitlyn]).kind).toBe("confirm");
    const kept = withKeptTypedNames(["Katlin Smith"], () => matchEmployeeName("Katlin Smith", [kaitlyn]));
    expect(kept.kind).toBe("unchecked");
    expect(matchEmployeeName("Katlin Smith", [kaitlyn]).kind).toBe("confirm");
  });
});
