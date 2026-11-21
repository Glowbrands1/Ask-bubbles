import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isJobTitlePhrase, tidyTypedName } from "./proposal-names";

describe("isJobTitlePhrase", () => {
  it("a title word led only by title modifiers is a job, not a person", () => {
    expect(isJobTitlePhrase("District Manager")).toBe(true);
    expect(isJobTitlePhrase("Store Manager")).toBe(true);
    expect(isJobTitlePhrase("Assistant Store Manager")).toBe(true);
  });

  it("a person's name is not a job", () => {
    expect(isJobTitlePhrase("Remy Calder")).toBe(false);
    expect(isJobTitlePhrase("Manager")).toBe(false);
  });

  it("keeps the same word lists as proposal.ts, so the two readings never drift", () => {
    const lists = (path: string) => {
      const source = readFileSync(path, "utf8");
      return [/const TITLE_HEAD = (.+);/.exec(source)?.[1], /const TITLE_MODIFIER =\s*\n?\s*(.+);/.exec(source)?.[1]];
    };
    const here = lists("src/lib/forms/proposal-names.ts");
    expect(here.every(Boolean)).toBe(true);
    expect(here).toEqual(lists("src/lib/forms/proposal.ts"));
  });
});

describe("tidyTypedName", () => {
  it("only the spacing is tidied", () => {
    expect(tidyTypedName("  jane   doe ")).toBe("jane doe");
    expect(tidyTypedName("JOHN SMITH III")).toBe("JOHN SMITH III");
    expect(tidyTypedName("de la cruz")).toBe("de la cruz");
  });
});
