import { afterEach, describe, expect, it, vi } from "vitest";

import { titleNamesAnotherPerson } from "./title-of-another-person";

// Ported from the sibling app: QA's round-33 live test there (12 Nov 2026), its labelled exit form in this company's
// positions; the employee invented.
const LABELLED = "exit form\nName: Isaura Corvadine\nPosition: Team Member Part Time\nResigned 11/8";

describe("FULL_POSITION_TITLE_ENABLED: a field label before the title is no person", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("off (production today): \"Position:\" is read as the title's owner (the bug)", () => {
    vi.stubEnv("TITLE_ENDS_AT_LINE_ENABLED", "true");
    vi.stubEnv("FULL_POSITION_TITLE_ENABLED", "");
    expect(titleNamesAnotherPerson(LABELLED, "Team Member", "Isaura Corvadine")).toBe(true);
  });

  it.each([LABELLED, "exit form\nName: Isaura Corvadine\nPosition: Store Manager\nResigned 11/8", "Job Title: Team Member Part Time"])(
    "on: the label is the field's, so the title is the employee's — %j",
    (text) => {
      vi.stubEnv("TITLE_ENDS_AT_LINE_ENABLED", "true");
      vi.stubEnv("FULL_POSITION_TITLE_ENABLED", "true");
      const title = /Store Manager/.test(text) ? "Store Manager" : "Team Member";
      expect(titleNamesAnotherPerson(text, title, "Isaura Corvadine")).toBe(false);
    },
  );

  it("on: a person named before the title on its line still owns it", () => {
    vi.stubEnv("TITLE_ENDS_AT_LINE_ENABLED", "true");
    vi.stubEnv("FULL_POSITION_TITLE_ENABLED", "true");
    expect(titleNamesAnotherPerson("she spoke with Brenna Kowaldane District Manager about it", "District Manager", "Isaura Corvadine")).toBe(true);
  });
});
