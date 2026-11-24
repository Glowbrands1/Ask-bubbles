import { describe, expect, it } from "vitest";

import { withoutNamedSalon } from "./tools";

/* QA's Bubbles live re-run (22 Nov 2026, A7; Pau: "Empire, SD" is the Sioux Falls W 41st St store). */
describe("withoutNamedSalon reads a store's reviewed nickname as its name", () => {
  it("takes \"at Empire, SD\" out of the account for the W 41st St store", () => {
    expect(withoutNamedSalon("On 10/22/26, Wren was not scheduled to work at Empire, SD and came into the store to show the team the new puppy.", "loc-225")).toBe(
      "On 10/22/26, Wren was not scheduled to work and came into the store to show the team the new puppy.",
    );
  });

  it("leaves it for another store: the nickname is that store's only", () => {
    const account = "Wren was not scheduled to work at Empire, SD and came in.";
    expect(withoutNamedSalon(account, "loc-338")).toBe(account);
  });
});
