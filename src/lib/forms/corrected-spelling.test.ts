import { describe, expect, it } from "vitest";

import { rosterSpellingOf, type RosterEmployee } from "./employee-match";
import { withCorrectedSpelling } from "./short-name";

/*
 * QA's live re-test (21 Nov 2026, Pau's account, agent loop on): the manager typed "<First> <Lastx>" in T1 and corrected it
 * to "<First> <Lasty>" in T3 ("Her name is <First> <Lasty> and she is at Dodge"); the card's name followed, the account kept
 * "<First> <Lastx>". Invented people (the loop cases' roster): Thaddea Kroll, first typed "Thaddea Krol".
 */
const person = (id: string, firstName: string, lastName: string): RosterEmployee => ({ id, firstName, lastName, preferredFirstName: null, locationIds: ["loc-264"], positionName: "Team Member Part Time" }) as RosterEmployee;
const THADDEA = person("e-thaddea-kroll", "Thaddea", "Kroll");
const ROSTER = [THADDEA, person("e-fenna-prewitt", "Fenna", "Prewitt"), person("e-ozren-brack", "Ozren", "Brack")];
/** QA's T1 account, as the model copied it onto the card. */
const ACCOUNT = "Thaddea Krol was 10 minutes late on her last two shifts. On the first shift she was verbally coached on policy and expectations. Then she was late again on 10/15.";

describe("withCorrectedSpelling (the corrected name replaces the old spelling)", () => {
  it("QA's T1 account: the roster's close spelling of the card's person becomes the corrected name", () => {
    const out = withCorrectedSpelling(ACCOUNT, "Thaddea Kroll", [], rosterSpellingOf(THADDEA.id, ROSTER));
    expect(out.text).toBe(ACCOUNT.replace("Thaddea Krol", "Thaddea Kroll"));
    expect(out.text).not.toMatch(/\bKrol(?!l)/);
  });
  it("the card's earlier name (its record), however far from the new one, possessive and any case", () => {
    expect(withCorrectedSpelling("thaddea crowell was late on Thaddea Crowell's last two shifts.", "Thaddea Kroll", ["Thaddea Crowell"]).text).toBe("Thaddea Kroll was late on Thaddea Kroll's last two shifts.");
  });
  it("never another roster person, two close people, a name in quotes, or the full name itself", () => {
    const two = [...ROSTER, person("e-thaddea-krole", "Thaddea", "Krole")];
    expect(withCorrectedSpelling("Thaddea Krole covered the shift.", "Thaddea Kroll", [], rosterSpellingOf(THADDEA.id, two)).replaced).toBe(0);
    expect(withCorrectedSpelling("Thaddea Krol was late.", "Thaddea Kroll", [], rosterSpellingOf(THADDEA.id, two)).replaced).toBe(0);
    expect(withCorrectedSpelling('The note said "Thaddea Krol was late."', "Thaddea Kroll", [], rosterSpellingOf(THADDEA.id, ROSTER)).replaced).toBe(0);
    expect(withCorrectedSpelling("Thaddea Kroll was late. Fenna Prewitt covered.", "Thaddea Kroll", [], rosterSpellingOf(THADDEA.id, ROSTER)).replaced).toBe(0);
  });
});
