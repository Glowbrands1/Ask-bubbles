import { describe, expect, it } from "vitest";

import { NAME_LABEL_WORDS, isNameLabelPhrase, nameAfterNameLabel, stripTrailingJobOrTitle } from "./name-words";

describe("name label words", () => {
  it("names job, title, position, role, location, salon, and store", () => {
    expect([...NAME_LABEL_WORDS].sort()).toEqual(
      ["job", "location", "position", "role", "salon", "store", "title"].sort(),
    );
    for (const word of ["job", "title", "position", "role", "location", "salon", "store"]) {
      expect(isNameLabelPhrase(word)).toBe(true);
    }
    expect(isNameLabelPhrase("Job Title")).toBe(true);
    expect(isNameLabelPhrase("Job title")).toBe(true);
    expect(isNameLabelPhrase("Store Director")).toBe(false);
    expect(isNameLabelPhrase("Jane Store")).toBe(false);
    expect(isNameLabelPhrase("Jane Salon")).toBe(false);
  });

  it("strips a trailing Job or Title only after a full name", () => {
    expect(stripTrailingJobOrTitle("Evangeline Pembury Title")).toBe("Evangeline Pembury");
    expect(stripTrailingJobOrTitle("Evangeline Pembury Job")).toBe("Evangeline Pembury");
    expect(stripTrailingJobOrTitle("Evangeline Pembury Job Title")).toBe("Evangeline Pembury");
    expect(stripTrailingJobOrTitle("Jane Store")).toBe("Jane Store");
    expect(stripTrailingJobOrTitle("Jane Salon")).toBe("Jane Salon");
    expect(stripTrailingJobOrTitle("Store Director")).toBe("Store Director");
    expect(stripTrailingJobOrTitle("Pat Job")).toBe("Pat Job");
    expect(stripTrailingJobOrTitle("Job Title")).toBeNull();
    expect(stripTrailingJobOrTitle("Salon")).toBeNull();
  });

  it("keeps the value after Name:", () => {
    expect(nameAfterNameLabel("Name: Evangeline Pembury, job title tanning consultant")).toBe(
      "Evangeline Pembury",
    );
    expect(nameAfterNameLabel("Name: Evangeline Pembury")).toBe("Evangeline Pembury");
    expect(nameAfterNameLabel("the store opened late")).toBeNull();
  });
});
