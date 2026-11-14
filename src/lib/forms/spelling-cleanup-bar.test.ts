import { describe, expect, it } from "vitest";

import { noteAccountNames, withAccountNames } from "./account-names";
import { cleanupChanges } from "./spelling-cleanup";

/*
 * QA's bar for #860's check (Gate-Bubbles-2's x772 probe, 14 Nov 2026), in the gate's wordings. The people are
 * invented: a coworker Manuel Quellby on the roster.
 */
const TODAY = "2026-11-14";
const changes = (source: string, written: string, names: readonly string[] = []) => cleanupChanges({ source, written, today: TODAY, names });

describe("cleanupChanges: QA's bar", () => {
  it("a plural of a name word is not a changed name (ported from the sibling gate's #983 probe: \"Test Employee\", \"Employees are expected\")", () => {
    // The route's source is the prompt, the notes and the form's values: the name is typed more often than it is written.
    const said = "create a written CA for Test Employee at Kearney, she was 20 minutes late for her shift on 10-20-26";
    const source = [said, "Test Employee"].join("\n");
    const written =
      "Observed:\nOn October 20, 2026, Test Employee arrived 20 minutes late for her scheduled shift.\nExpectation:\nEmployees are expected to arrive on time.";
    expect(changes(source, written, ["Test Employee"])).toEqual([]);
  });

  it("an edited single-quoted span is caught", () => {
    expect(changes("she told a guest 'that is not my registr'", "She told a guest 'that is not my register'.")).toContainEqual(expect.stringMatching(/^quote /));
    expect(changes("she told a guest ‘that is not my registr’", "She told a guest ‘that is not my register’.")).toContainEqual(expect.stringMatching(/^quote /));
  });

  it("a store name is a name: a store word mended, or a near miss turned into one, is a changed name", () => {
    expect(changes("she was late at the kearny store", "She was late at the kearney store.")).toContainEqual(expect.stringMatching(/^name kearny/));
    expect(changes("she was sent to Kearny", "She was sent to kearney.")).toContainEqual(expect.stringMatching(/^name kearny/));
    expect(changes("she covered a shift at Bellvue", "She covered a shift at bellevue.")).toContainEqual(expect.stringMatching(/^name bellvue/));
  });

  it("every roster name is a name, in any case", () => {
    withAccountNames(() => {
      noteAccountNames([{ firstName: "Manuel", lastName: "Quellby" }]);
      expect(changes("Manuel saw her leave the drawer open", "manual saw her leave the drawer open.")).toContainEqual(expect.stringMatching(/^name manuel/));
      expect(changes("manuel saw her leave the drawer open", "Manual saw her leave the drawer open.")).toContainEqual(expect.stringMatching(/^name manuel/));
    });
  });

  it("ordinary spelling cleanup still passes", () => {
    expect(changes("not doing th e10 minute sanitaion", "Not doing the 10-minute sanitation.")).toEqual([]);
    expect(changes("she was late at kearney", "She was late at Kearney.")).toEqual([]);
    expect(changes("she didn't count the registr", "She didn't count the register.")).toEqual([]);
  });
});

describe("cleanupChanges: Gate-Sunny-2's #983 probes", () => {
  it("a quote left open to the end is caught", () => {
    expect(changes("she said ‘i read the polcy", "She said ‘i read the policy.")).toContainEqual(expect.stringMatching(/^quote /));
    expect(changes(`she said "i read the polcy`, `She said "i read the policy.`)).toContainEqual(expect.stringMatching(/^quote /));
    // The same words kept, only a full stop added: not a changed quote.
    expect(changes("she said ‘i read the polcy", "She said ‘i read the polcy.")).toEqual([]);
  });

  it("a single-quoted span with an apostrophe inside is one quote", () => {
    expect(changes("she told a guest 'that isn't my registr' and walked off", "She told a guest 'that isn't my register' and walked off.")).toContainEqual(expect.stringMatching(/^quote /));
  });

  it("a lowercase near miss of a long place name turned into a spelling of it is a changed name", () => {
    expect(changes("she was sent to kerny", "She was sent to Kearny.")).toContainEqual(expect.stringMatching(/^name kerny/));
    expect(changes("she was sent to kerny", "She was sent to Kearney.")).toContainEqual(expect.stringMatching(/^name kerny/));
  });
});

describe("cleanupChanges: a store word is matched only exactly (QA, Gate-Bubbles-2's x772b NO-GO, 14 Nov 2026)", () => {
  it("a West Dodge draft saying \"she was late\" is not a changed name (\"west\" is not a respelled \"was\")", () => {
    expect(changes("create a ca for remy calder at west dodge, late again today", "Observed:\nRemy Calder was late again today, she was late.")).toEqual([]);
  });

  it("\"falls\" of Sioux Falls is not a respelled \"fails\" or \"calls\"", () => {
    expect(changes("create a ca for remy calder at sioux falls, did not clock in", "Remy Calder fails to clock in and calls off.")).toEqual([]);
  });

  it("a near miss written as the store word is still a changed name; a roster name still is", () => {
    expect(changes("she was sent to Kearny", "She was sent to kearney.")).toContainEqual(expect.stringMatching(/^name kearny/));
    withAccountNames(() => {
      noteAccountNames([{ firstName: "Manuel", lastName: "Quellby" }]);
      expect(changes("manuel saw her leave the drawer open", "Manual saw her leave the drawer open.")).toContainEqual(expect.stringMatching(/^name manuel/));
    });
  });
});

describe("cleanupChanges: a common English word is never a place-word near miss (Gate-Sunny-2, #983, 14 Nov 2026)", () => {
  it("\"late\" is not a respelled \"lake\": the gate's repro", () => {
    const check = (source: string, written: string) => cleanupChanges({ source, written, today: "2026-11-14", names: ["Brisa Talmadge"] });
    expect(check("she was late to her shift on 11/3, late again on 11/4", "She was late to her shift on 11/3 and again on 11/4, the last two days.")).toEqual([]);
    expect(check("she was late to her shift on 11/3, late again on 11/4", "She was late to her shift on 11/3 and later again on 11/4.")).toEqual([]);
  });

  it("the other near words the gate found are not changed names", () => {
    for (const [source, written] of [
      ["she parked in the fire lane twice", "She parked in the fire line twice."],
      ["she was missing her name badge", "She was without her name badge on the mission floor."],
      ["she was strict with a guest about cents", "She was rude to a guest about the cost."],
    ]) {
      expect(changes(source!, written!), source).toEqual([]);
    }
  });
});
