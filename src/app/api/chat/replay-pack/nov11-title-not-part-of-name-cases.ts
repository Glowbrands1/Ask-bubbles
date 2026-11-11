import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A STORE TITLE AFTER THE NAME IS NOT PART OF IT (B-C3 part 2, QA's open-case list, 11 Nov 2026;
 * TITLE_NOT_PART_OF_NAME_ENABLED)
 * ============================================================================
 *
 * The sibling app's Pau scan sf-s36 (a real manager; `nov7-sf-s36-exit-surname-typo-cases.ts` here): "I need a exit for
 * <first> <last, one letter off> TM. Quit without notice. …" put "<first> <last> TM" on the card, so the roster readers
 * found nobody and never asked "Is this for <the roster's spelling>?". The manager's words with "an exit for" (read as an
 * exit request today; the "for for" of the report is FORM_FOR_FOR_TYPO's); the person is invented (STAFF's Marnie
 * Holloway, typed "Marnie Halloway"). The fix flags are the roster set QA turns on with Bubbles 16c, and this flag.
 */
const TYPED = "Marnie Halloway";
const ROSTER = "Marnie Holloway";
const SAID = `I need an exit for ${TYPED} TM. Quit without notice. not fulfilling a 2 weeks notice. payroll deduction is applicable. store items were returned.`;
const ROSTER_SET = [
  "FORM_NAME_FROM_ROSTER_ENABLED",
  "ROSTER_NEAR_MISS_ENABLED",
  "ROSTER_NAME_IN_CANDIDATE_ENABLED",
  "ROSTER_COMPOUND_SURNAME_ENABLED",
  "ROSTER_NOT_FOUND_ANY_PHRASING_ENABLED",
  "OFF_ROSTER_CONFIRM_ENABLED",
];

export const NOV11_TITLE_NOT_PART_OF_NAME_CASES: ReplayCase[] = [
  {
    id: "nov11-title-not-part-of-name",
    title: `"I need an exit for ${TYPED} TM. …": the card is ${ROSTER}'s, or the reply asks "Is this for **${ROSTER}**?"`,
    report: "B-C3 part 2 (QA's open-case list, 11 Nov 2026): the store title was read as part of the name",
    status: { open: `the card's name is "${TYPED} TM" (or no one): no roster spelling offered` },
    fixFlags: [...ROSTER_SET, "TITLE_NOT_PART_OF_NAME_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say(SAID);
      const employee = thread.proposal?.employeeName ?? null;
      const offered = new RegExp(String.raw`Is this for \*\*${ROSTER}\*\*\?`).test(reply.content);
      expect(employee === ROSTER || offered, `neither the card (${employee}) nor "Is this for **${ROSTER}**?":\n${reply.content}`).toBe(true);
      expect(reply.content, "the title is still part of the name").not.toContain(`${TYPED} TM`);
    },
  },
];

/*
 * Gate-Bubbles R785 (record 7ee6be16, 11 Nov 2026): after "yes" to "Is this for Marnie Holloway?", the exit card's
 * read-back said "- **Name:** Marnie Holloway TM" (`forms/exit-intake.ts` prints the card's employee name). The title is
 * off the card's name and off the read-back's Name line too.
 */
NOV11_TITLE_NOT_PART_OF_NAME_CASES.push({
  id: "nov11-title-not-part-of-name-yes-then-card",
  title: `"I need an exit for ${TYPED} TM. …", then "yes": the exit card's Name is ${ROSTER}, without TM`,
  report: "Gate-Bubbles R785 (11 Nov 2026): the exit card's Name line kept the store title after \"yes\"",
  status: { open: `the read-back's Name line is "${ROSTER} TM"` },
  fixFlags: [...ROSTER_SET, "TITLE_NOT_PART_OF_NAME_ENABLED"],
  async run(t) {
    t.directory(STAFF);
    t.as("location_manager", WEST_DODGE);
    const thread = t.thread();
    let reply = await thread.say(SAID);
    if (new RegExp(String.raw`Is this for \*\*${ROSTER}\*\*\?`).test(reply.content)) reply = await thread.say("yes");
    expect(thread.proposal?.templateKey, `no exit card:\n${reply.content}`).toBe("resignation-exit");
    expect(thread.proposal?.employeeName, reply.content).toBe(ROSTER);
    expect(reply.content, `the Name line keeps the title:\n${reply.content}`).not.toMatch(/\*\*Name:\*\*\s*Marnie H[ao]lloway\s+TM\b/);
  },
});
