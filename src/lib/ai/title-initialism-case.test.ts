import { afterEach, describe, expect, it } from "vitest";

import { typedJobTitle } from "./job-title-from-words";

/**
 * TITLE_INITIALISM_CASE_ENABLED. QA (#207, the sibling app; the same casing here): "she is an HR assistant" put "Hr Assistant" on the card; the typed-title
 * casing Capitalized every word and lowered the rest. The manager's wording is kept; the employee is invented.
 */
const FLAG = "TITLE_INITIALISM_CASE_ENABLED";
const SAID = "create a coaching form for Wren Halloway at West Dodge, she is an HR assistant, for being late on 10-20-26";

afterEach(() => {
  delete process.env[FLAG];
});

const REGISTERS: [string, (text: string) => string][] = [
  ["as typed", (text) => text],
  ["all lowercase", (text) => text.toLowerCase()],
  ["ALL CAPS", (text) => text.toUpperCase()],
];

describe.each(REGISTERS)("TITLE_INITIALISM_CASE_ENABLED: %s", (_register, as) => {
  it("off: \"Hr Assistant\" (the bug)", () => {
    process.env[FLAG] = "";
    expect(typedJobTitle([as(SAID)], "Wren Halloway")).toBe("Hr Assistant");
  });

  it("on: \"HR Assistant\"", () => {
    process.env[FLAG] = "true";
    expect(typedJobTitle([as(SAID)], "Wren Halloway")).toBe("HR Assistant");
  });
});

describe("TITLE_INITIALISM_CASE_ENABLED: only the initialisms", () => {
  it("on: IT, DM and GM too; every other word as before", () => {
    process.env[FLAG] = "true";
    expect(typedJobTitle(["she is an it specialist"], "Wren Halloway")).toBe("IT Specialist");
    expect(typedJobTitle(["wren halloway is our gm trainee"], "Wren Halloway")).toBe("GM Trainee");
    expect(typedJobTitle(["she is a TEAM MEMBER"], "Wren Halloway")).toBe("Team Member");
    // "hrs" or "item" are not initialisms.
    expect(typedJobTitle(["she is an item clerk"], "Wren Halloway")).toBe("Item Clerk");
  });
});
