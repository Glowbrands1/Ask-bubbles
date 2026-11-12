import { afterEach, describe, expect, it } from "vitest";

import { withoutTitleWord } from "./title-not-part-of-name";

/** TITLE_NOT_PART_OF_NAME_ENABLED (B-C3 part 2, 11 Nov 2026; sf-s36's "<name> TM"). The person is invented. */
const FLAG = "TITLE_NOT_PART_OF_NAME_ENABLED";

afterEach(() => {
  delete process.env[FLAG];
});

describe("TITLE_NOT_PART_OF_NAME", () => {
  it("flag off (as before): the title stays in the name", () => {
    expect(withoutTitleWord("Marnie Halloway TM")).toBe("Marnie Halloway TM");
  });

  it("flag on: a store title after a two-word name is not part of it", () => {
    process.env[FLAG] = "true";
    expect(withoutTitleWord("Marnie Halloway TM")).toBe("Marnie Halloway");
    expect(withoutTitleWord("Marnie Halloway AGM.")).toBe("Marnie Halloway");
  });

  it("flag on, NEVER-BREAK: a short name, or a last word that is no title, is kept as typed", () => {
    process.env[FLAG] = "true";
    expect(withoutTitleWord("Marnie TM")).toBe("Marnie TM");
    expect(withoutTitleWord("Marnie Ann Holloway")).toBe("Marnie Ann Holloway");
  });
});
