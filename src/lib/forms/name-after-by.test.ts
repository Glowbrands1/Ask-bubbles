import { afterEach, describe, expect, it, vi } from "vitest";

import { rosterNameNamedIn, type RosterEmployee } from "./employee-match";
import { withNameAfterBy } from "./name-after-by";

/* NAME_LAST_AFTER_BY_ENABLED (QA's B-C1, 11 Nov 2026; QA's name matrix, 4 Nov 2026, exact wording; invented people). */
const person = (id: string, firstName: string, lastName: string) =>
  ({ id, firstName, lastName, preferredFirstName: null, locationIds: [] }) as unknown as RosterEmployee;
const ROSTER = [person("1", "Corin", "Bellweather"), person("2", "Remy", "Calder")];
const LOWER = "corrective action: a guest was treated rudely at the front desk on monday by corin bellweather";
const LOWER_DATED = "corrective action: a guest was treated rudely at the front desk on monday 10/05/2026 by corin bellweather";

afterEach(() => vi.unstubAllEnvs());

describe("NAME_LAST_AFTER_BY_ENABLED", () => {
  it("off: the name after \"by\" is read as a reporter, as before", () => {
    expect(rosterNameNamedIn(LOWER, ROSTER)).toBeNull();
  });

  it("on: QA's wordings name the doer after \"by\"", () => {
    vi.stubEnv("NAME_LAST_AFTER_BY_ENABLED", "true");
    expect(rosterNameNamedIn(LOWER, ROSTER)).toBe("Corin Bellweather");
    expect(rosterNameNamedIn(LOWER_DATED, ROSTER)).toBe("Corin Bellweather");
    expect(rosterNameNamedIn(LOWER.toUpperCase(), ROSTER)).toBe("Corin Bellweather");
  });

  it("on, never: a reporter, signer or witness after \"by\", a name that is not last, or no passive clause", () => {
    vi.stubEnv("NAME_LAST_AFTER_BY_ENABLED", "true");
    for (const said of [
      "write up for being late, it was reported by corin bellweather",
      "the complaint was signed by corin bellweather",
      "a guest was treated rudely by corin bellweather and remy calder saw it",
      "ca for a guest complaint, stop by corin bellweather",
    ]) {
      expect(rosterNameNamedIn(said, ROSTER), said).toBeNull();
    }
  });

  it("a card name \"BY <roster name>\" is that roster person; anything else is kept", () => {
    const card = (employeeName: string) => ({ content: `I'll draft a **Corrective Action Form** for **${employeeName}** from what you've described.`, formProposal: { employeeName } });
    expect(withNameAfterBy(card("BY CORIN BELLWEATHER"), ROSTER)).toEqual(card("BY CORIN BELLWEATHER"));
    vi.stubEnv("NAME_LAST_AFTER_BY_ENABLED", "true");
    expect(withNameAfterBy(card("BY CORIN BELLWEATHER"), ROSTER)).toEqual(card("Corin Bellweather"));
    expect(withNameAfterBy(card("BY ZELDA QUINN"), ROSTER)).toEqual(card("BY ZELDA QUINN"));
    expect(withNameAfterBy(card("Remy Calder"), ROSTER)).toEqual(card("Remy Calder"));
  });
});
