import { describe, expect, it } from "vitest";

import { neutralizeTitles } from "./known-titles";

const TITLES = ["Assistant General Manager", "General Manager", "Team Member Part Time", "Owner", "Operator"];

describe("neutralizeTitles", () => {
  it("lower-cases a Woven title so it cannot pass for a name", () => {
    expect(neutralizeTitles("Sarah Miller, our Assistant General Manager, was late", TITLES)).toBe(
      "Sarah Miller, our assistant general manager, was late",
    );
    expect(neutralizeTitles("from Team Member Part Time to Operator", TITLES)).toBe("from team member part time to operator");
  });

  it("prefers the longest title, so 'General Manager' inside 'Assistant General Manager' is one title", () => {
    expect(neutralizeTitles("an Assistant General Manager", TITLES)).toBe("an assistant general manager");
  });

  it("leaves people and everything else exactly as written", () => {
    const text = "Sarah Miller and Dana Moss at Kearney, NE";
    expect(neutralizeTitles(text, TITLES)).toBe(text);
    expect(neutralizeTitles(text, [])).toBe(text);
  });

  it("does not eat part of a longer word, or a surname that leads a name", () => {
    expect(neutralizeTitles("Operators met Owner Smith", TITLES)).toBe("Operators met Owner Smith");
  });
});
