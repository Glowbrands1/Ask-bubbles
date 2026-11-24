import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { cardAccountName, replyNameFor } = await import("./tools");

/*
 * Port from Ask Sunny (its QA, 24 Nov 2026, live as an Admin): "Here's the Corrective Action Form for **Test**" and
 * "Test had a till shortage." for "… for Test Employee" (TYPED_EMPLOYEE_EVERY_CARD_ENABLED). Invented people.
 */
const row = (id: string, firstName: string, lastName: string) => ({ id, firstName, lastName, preferredFirstName: null, locationIds: [] });
const PIKE = row("e-8", "Rowan", "Pike");
const CALDER = row("e-2", "Remy", "Calder");

describe("a stand-in name nobody on the roster has (\"Test Employee\")", () => {
  it("is called by its whole name with the flag on, in the reply and the card's account", () => {
    vi.stubEnv("TYPED_EMPLOYEE_EVERY_CARD_ENABLED", "true");
    try {
      expect(replyNameFor("Test Employee", [PIKE, CALDER], [])).toBe("Test Employee");
      expect(cardAccountName("Test Employee", [PIKE, CALDER], [])).toBe("Test Employee");
      expect(replyNameFor("Odalys Fenwick", [PIKE, CALDER], [])).toBe("Odalys");
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("flag off: its first word, as before", () => {
    expect(replyNameFor("Test Employee", [PIKE, CALDER], [])).toBe("Test");
    expect(cardAccountName("Test Employee", [PIKE, CALDER], [])).toBe("Test");
  });
});
