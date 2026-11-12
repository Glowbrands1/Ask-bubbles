import { expect } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayAnswer, type ReplayCase, onStoryClock } from "./cases";

/**
 * ============================================================================
 * A COMPOUND SURNAME TYPED WITH A TYPO (the re-flip's rollback, 5 Nov 2026)
 * ============================================================================
 *
 * The flip's live testers (R3/R5/R7, real managers, real active employees):
 * the person's surname is TWO words, and the manager typed one of them with a
 * transposed or swapped letter. With FORM_NAME_FROM_ROSTER_ENABLED +
 * ROSTER_NEAR_MISS_ENABLED on, the card had no employee and the reply asked
 * "Who is this form for?" — never "Is this for <roster name>?". The matcher
 * (`forms/employee-match.ts`) compared only the typed LAST word with the whole
 * two-word surname, so a typo in either word was never close.
 * ROSTER_COMPOUND_SURNAME_ENABLED compares the surname word by word.
 *
 * Every person is invented (checked against both apps' directories). With
 * production's flags (FORM_NAME off) the card keeps the name as typed.
 */

const person = (id: string, firstName: string, lastName: string): DirectoryRow => ({
  id,
  firstName,
  lastName,
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
});

const ODALYS = person("e-odalys-prewett-vansickle", "Odalys", "Prewett Vansickle");
const ODALYS_D = person("e-odalys-dunmore-vansickle", "Odalys", "Dunmore Vansickle");
const THORNE = person("e-thorne-ash-merrow", "Thorne", "Ash Merrow");
// Two edits from ODALYS in one word (letters 4–6 of "Vansickle" rotated): the distance-2 negative.
const ODALYS_C = person("e-odalys-prewett-vancsikle", "Odalys", "Prewett Vancsikle");

const FIX = ["FORM_NAME_FROM_ROSTER_ENABLED", "ROSTER_NEAR_MISS_ENABLED", "ROSTER_COMPOUND_SURNAME_ENABLED"];
const REPORT = "The re-flip's live testers, 5 Nov 2026 (R3/R5/R7, flags on): a two-word roster surname typed with one word mistyped; the card emptied and asked who";
const OFFERS = (name: string) => new RegExp(`Is this for \\*\\*${name}\\*\\*\\?`);

async function said(t: Parameters<ReplayCase["run"]>[0], roster: readonly DirectoryRow[], ...turns: string[]) {
  t.directory([...STAFF, ...roster]);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  let reply: ReplayAnswer | undefined;
  for (const turn of turns) reply = await thread.say(turn);
  return { reply: reply!, employee: thread.proposal?.employeeName ?? null };
}

/** The roster person is on the card, or the reply asks for them by their roster name. */
function offered(reply: ReplayAnswer, employee: string | null, rosterName: string): void {
  expect(employee === rosterName || OFFERS(rosterName).test(reply.content), `neither the card (${employee}) nor "Is this for **${rosterName}**?":\n${reply.content}`).toBe(true);
}

const typo = (id: string, typed: string, what: string): ReplayCase => ({
  id,
  title: `${what}: "create a ca form for ${typed}" (roster: Odalys Prewett Vansickle): the card is hers, or the reply asks "Is this for **Odalys Prewett Vansickle**?"`,
  report: `${REPORT}; ${what}`,
  status: { open: "with production's flags (FORM_NAME off) the card keeps the typed spelling" },
  fixFlags: FIX,
  async run(t) {
    const { reply, employee } = await said(t, [ODALYS], `create a ca form for ${typed}`);
    offered(reply, employee, "Odalys Prewett Vansickle");
  },
});

export const NOV5_COMPOUND_SURNAME_CASES: ReplayCase[] = [
  typo("nov5-compound-surname-word1-typo", "Odalys Perwett Vansickle", "a typo in surname word 1"),
  typo("nov5-compound-surname-word2-typo", "Odalys Prewett Vansikcle", "a typo in surname word 2"),
  typo("nov5-compound-surname-one-word-typo", "Odalys Vansikcle", "one surname word only, with a typo"),
  // QA's R3 shape (5 Nov 2026): surname word 2 with letters 4–6 rotated ("sic" typed "csi", Damerau 2), word 1 exact.
  typo("nov5-compound-surname-word2-rotated", "Odalys Prewett Vancsikle", "R3: surname word 2 with letters 4–6 rotated"),
  {
    id: "nov5-compound-surname-word2-rotated-earlier-turn",
    title: "R7: the R3 spelling \"Odalys Prewett Vancsikle\" only in turn 2; the CA request comes later with no name: the card is hers, or the reply asks \"Is this for **Odalys Prewett Vansickle**?\"",
    report: `${REPORT}; R7, the name in an earlier turn`,
    status: { open: "with production's flags (FORM_NAME off) the card keeps the typed spelling" },
    fixFlags: FIX,
    async run(t) {
      const { reply, employee } = await said(
        t,
        [ODALYS],
        "I need help with one of my employees",
        "Odalys Prewett Vancsikle was late opening the store on 11/2",
        "can you write up a corrective action for that",
      );
      offered(reply, employee, "Odalys Prewett Vansickle");
    },
  },
  {
    id: "nov5-compound-surname-word1-typo-yes",
    title: "\"create a ca form for Odalys Perwett Vansickle\", then \"yes\" to \"Is this for **Odalys Prewett Vansickle**?\": the card is hers, in the roster's spelling",
    report: `${REPORT}; the answer`,
    status: { open: "with production's flags (FORM_NAME off) the card keeps the typed spelling" },
    fixFlags: FIX,
    async run(t) {
      const { reply, employee } = await said(t, [ODALYS], "create a ca form for Odalys Perwett Vansickle, she was late opening the store on 11/2", "yes");
      expect(employee, `"yes" did not put her on the card:\n${reply.content}`).toBe("Odalys Prewett Vansickle");
      expect(reply.content, "the account is lost").toMatch(/late opening the store/i);
    },
  },
  {
    id: "nov5-compound-surname-exact",
    title: "negative control: the exact compound name \"Odalys Prewett Vansickle\" is her card",
    report: `${REPORT}; negative control`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const { reply, employee } = await said(t, [ODALYS], "create a ca form for Odalys Prewett Vansickle");
      expect(employee, `not her card:\n${reply.content}`).toBe("Odalys Prewett Vansickle");
    },
  },
  {
    id: "nov5-compound-surname-shared-word-asks",
    title: "negative: two roster people share the surname word (Odalys Prewett Vansickle, Odalys Dunmore Vansickle); \"Odalys Vansikcle\" is a question, never a fill",
    report: `${REPORT}; negative (QA)`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const { reply, employee } = await said(t, [ODALYS, ODALYS_D], "create a ca form for Odalys Vansikcle");
      expect([ODALYS, ODALYS_D].map((p) => `${p.firstName} ${p.lastName}`), `filled with one of them:\n${reply.content}`).not.toContain(employee);
      expect(reply.content, `one of them is offered alone:\n${reply.content}`).not.toMatch(/Is this for \*\*Odalys (?:Prewett|Dunmore) Vansickle\*\*\?/);
    },
  },
  {
    id: "nov5-compound-surname-distance-two-pair-asks",
    title: "negative (QA): two roster people whose surnames are two edits apart in one word (Prewett Vansickle, Prewett Vancsikle); \"Odalys Prewett Vanscikle\", one edit from each, is a question listing both, never a pick",
    report: `${REPORT}; negative at distance 2 (QA)`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const { reply, employee } = await said(t, [ODALYS, ODALYS_C], "create a ca form for Odalys Prewett Vanscikle");
      expect([ODALYS, ODALYS_C].map((p) => `${p.firstName} ${p.lastName}`), `filled with one of them:\n${reply.content}`).not.toContain(employee);
      expect(reply.content, `one of them is offered alone:\n${reply.content}`).not.toMatch(/Is this for \*\*Odalys Prewett Van(?:sickle|csikle)\*\*\?/);
    },
  },
  {
    id: "nov5-compound-surname-short-word-no-match",
    title: "negative: a 3-letter surname word typed with a typo (\"Thorne Ask\" for Thorne Ash Merrow) is not a match",
    report: `${REPORT}; negative (QA)`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const { reply, employee } = await said(t, [THORNE], "create a ca form for Thorne Ask");
      expect(employee, `filled with Thorne Ash Merrow:\n${reply.content}`).not.toBe("Thorne Ash Merrow");
      expect(reply.content, `offered Thorne Ash Merrow:\n${reply.content}`).not.toMatch(OFFERS("Thorne Ash Merrow"));
    },
  },
];

/*
 * QA-A / QA-B (the re-flip's live testers, 5 Nov 2026, flags on): a full name on no roster gave no not-found note.
 * A different path from the compound surname: #470's note read the name only from "for <Name>," or "for <Name>.",
 * and these requests had "i have an employee, <name> that needs …" or the name at the end of the message.
 * ROSTER_NOT_FOUND_ANY_PHRASING_ENABLED also reads "employee, <Name>" and "for <Name>" at the end of the message
 * (Title Case names only). Invented person, checked against both directories.
 */
const NOT_FOUND_FIX = ["FORM_NAME_FROM_ROSTER_ENABLED", "ROSTER_NEAR_MISS_ENABLED", "ROSTER_NOT_FOUND_ANY_PHRASING_ENABLED"];
const notFound = (id: string, message: string, what: string): ReplayCase => ({
  id,
  title: `QA-A/QA-B shape (${what}): "${message}", on no roster: "I couldn't find **Zebulon Marchbanks** in the Woven roster", then asks who; never the employee`,
  report: "The re-flip's live testers, 5 Nov 2026 (QA-A/QA-B, flags on): an off-roster full name, no not-found note",
  // Changed on purpose (10 Nov 2026, QA's roster-set gate): OFF_ROSTER_ASK_BEFORE_CARD (on in production) already asks a
  // store manager "I can't find **<name>** on your roster — …" with the card held, which this case now accepts as the
  // not-found line; it holds with production's flags.
  status: "fixed",
  fixFlags: NOT_FOUND_FIX,
  async run(t) {
    const { reply, employee } = await said(t, [], message);
    expect(employee, `a name on no roster is the employee:\n${reply.content}`).toBeNull();
    // Changed on purpose (10 Nov 2026, QA's roster-set ruling): with the name set on, a store manager's not-found line is OFF_ROSTER_ASK's "I can't find **<name>** on your roster — …" (the live wording), not "I couldn't find **<name>** in the Woven roster".
    expect(reply.content, `the typed name is never said to be not found:\n${reply.content}`).toMatch(/I couldn't find \*\*Zebulon Marchbanks\*\* in the Woven roster|I can't find \*\*Zebulon Marchbanks\*\* on your roster/);
    const elsewhere = reply.content.split("\n").filter((line) => !/I couldn't find \*\*|I can't find \*\*[^*]+\*\* on your roster/.test(line)).join("\n");
    expect(elsewhere, `the name is presented as the employee:\n${reply.content}`).not.toMatch(/Zebulon|Marchbanks/);
  },
});

export const NOV5_NOT_FOUND_ANY_PHRASING_CASES: ReplayCase[] = [
  notFound("nov5-not-found-employee-first", "i have an employee, Zebulon Marchbanks that needs a corrective action form with a customer complaint", "the employee first"),
  notFound("nov5-not-found-name-at-end", "create a ca form for Zebulon Marchbanks", "the name at the end"),
];

// Gate-Bubbles-5 (G5-743): these cases tell a story dated after the pack's 10/26/2026; they run on a day after it.
onStoryClock(NOV5_COMPOUND_SURNAME_CASES);
onStoryClock(NOV5_NOT_FOUND_ANY_PHRASING_CASES);
