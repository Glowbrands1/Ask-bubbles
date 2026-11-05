import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayAnswer, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * STEP 5, PART 2: THE REQUEST SLOT, AND A LIST IS NOT A PERSON
 * (FORM_NAME_FROM_ROSTER_ENABLED, default off)
 * ============================================================================
 *
 * The live re-flip of CA_SALES_POLICY_ENABLED and FORM_NAME_FROM_ROSTER_ENABLED
 * failed (QA for Pau): Pau's message 1 named somebody NOT on the roster, so
 * nothing anchored the message and part 1's middle ground never fired. The
 * reply was a nameless card and "Which of them is this Corrective Action Form
 * for — Remy Fenn, Club Close or Under?".
 *
 *   "I need a corrective action verbal for <name>. This is for Under
 *    Performance on PPTA, LPSVA, Club Average, Club Close %, and Spa %."
 *
 * With the flag on: when the first sentence asks for a form "… for <Name>",
 * that name is the message's only employee candidate (capitalised phrases in
 * later sentences are not candidates), and an item of a list of three or more
 * is never a candidate. A name off the roster is said back as not on it, by
 * itself, and is never close-matched to a different person ("Remy Fenn" is
 * not Remy Calder). See `forms/request-slot.ts`.
 *
 * "Remy Fenn" is the live script's invented name; "Remy Calder" (the shared
 * fixture's) is the trap. Every person is invented (the repository is public).
 */

type T = ReplayContext;

const STORE = "loc-264";

const person = (id: string, firstName: string, lastName: string): DirectoryRow => ({
  id,
  firstName,
  lastName,
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: [STORE],
  positionName: "Team Member Part Time",
});

const WILHELMINA = person("e-wilhelmina-corvina", "Wilhelmina", "Corvina");
const PEREGRINE = person("e-peregrine-varnholt", "Peregrine", "Varnholt");
const REMY_FENN = person("e-remy-fenn", "Remy", "Fenn");

const ROSTER: readonly DirectoryRow[] = [...STAFF, WILHELMINA, PEREGRINE];

const REPORT = "QA for Pau, 5 Nov 2026 (step 5 part 2): the live re-flip named somebody not on the roster";
const FLAG = "FORM_NAME_FROM_ROSTER_ENABLED";
const SALES = "CA_SALES_POLICY_ENABLED";
const GLOSSARY = "CHAT_GLOSSARY_ENABLED";

/** Pau's message 1, word for word. */
const say = (name: string) =>
  `I need a corrective action verbal for ${name}. This is for Under Performance on PPTA, LPSVA, Club Average, Club Close %, and Spa %.`;

function start(t: T, roster: readonly DirectoryRow[] = ROSTER) {
  vi.setSystemTime(new Date("2026-11-05T15:30:00Z"));
  t.directory(roster);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

function policyLine(reply: ReplayAnswer): string {
  return reply.content.split("\n").find((line) => /\*\*Policy:?\*\*/i.test(line)) ?? "";
}

const METRIC_AS_PERSON = /\*\*(?:Club Close|Club Average|Under|PPTA|LPSVA|Spa)\*\*|(?:—|-|,)\s*(?:Club Close|Under)\b(?:,| or|\?)/;

/** Never a card, a question or a note for "Under Performance" or "Under"; with a card or a reply that asks, it asks who. */
function noUnderAsPerson(thread: { proposal: ReplayAnswer["formProposal"] | null }, reply: ReplayAnswer): void {
  expect(thread.proposal?.employeeName ?? "", "\"Under\" is the card's employee").not.toMatch(/under/i);
  expect(reply.content, `"Under Performance" or "Under" is named as a person:\n${reply.content}`).not.toMatch(/\*\*Under(?: Performance)?\*\*|couldn't find[^.]*Under|Is this for \*\*Under/i);
  expect(reply.content, `it does not ask who the form is for:\n${reply.content}`).toMatch(/Who is this (?:\*\*[^*]+\*\* |form )?for\?|Employee's full name/);
}

export const NOV5_REQUEST_SLOT_CASES: ReplayCase[] = [
  {
    id: "nov5-request-slot-off-roster-name",
    title: "Pau's message 1 for \"Remy Fenn\", not on the roster (Remy Calder is): no metric named as a person, no \"Which of them\", never Remy Calder",
    report: `${REPORT}: "Which of them is this Corrective Action Form for — Remy Fenn, Club Close or Under?"`,
    status: { open: "\"I couldn't find **Remy Fenn** or **Club Close** or **Under** in the Woven roster\" (metrics named as people)" },
    fixFlags: [FLAG, SALES, GLOSSARY],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say(say("Remy Fenn"));
      expect(reply.content, `a metric is named or offered as a person:\n${reply.content}`).not.toMatch(METRIC_AS_PERSON);
      expect(reply.content, `"Which of them" was asked:\n${reply.content}`).not.toMatch(/which of them/i);
      expect(reply.content, `Remy Fenn became Remy Calder:\n${reply.content}`).not.toMatch(/Remy Calder/);
      expect(thread.proposal?.employeeName ?? "", "the card is for Remy Calder").not.toMatch(/Calder/);
      const card = thread.proposal?.employeeName === "Remy Fenn";
      const honest = /couldn't find \*\*Remy Fenn\*\* in the Woven roster/.test(reply.content);
      expect(card || honest, `neither a card for Remy Fenn nor the note naming only Remy Fenn:\n${reply.content}`).toBe(true);
    },
  },
  {
    id: "nov5-request-slot-off-roster-name-models",
    title: "the same, with the reading models reading \"Remy Fenn\" as typed (the live path): no metric offered, no \"Which of them\", never Remy Calder",
    report: `${REPORT}: the AI reader's path`,
    status: { open: "metrics are named as people beside Remy Fenn" },
    fixFlags: [FLAG, SALES, GLOSSARY],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say(say("Remy Fenn"), { employeeName: "Remy Fenn" });
      expect(reply.content, `a metric is named or offered as a person:\n${reply.content}`).not.toMatch(METRIC_AS_PERSON);
      expect(reply.content, `"Which of them" was asked:\n${reply.content}`).not.toMatch(/which of them/i);
      expect(reply.content, `Remy Fenn became Remy Calder:\n${reply.content}`).not.toMatch(/Remy Calder/);
      expect(thread.proposal?.employeeName ?? "", "the card is for Remy Calder").not.toMatch(/Calder/);
      const card = thread.proposal?.employeeName === "Remy Fenn";
      const honest = /couldn't find \*\*Remy Fenn\*\* in the Woven roster/.test(reply.content);
      expect(card || honest, `neither a card for Remy Fenn nor the note naming only Remy Fenn:\n${reply.content}`).toBe(true);
    },
  },
  {
    id: "nov5-request-slot-on-roster-name",
    title: "the same message for Remy Fenn ON the roster: the card is for Remy Fenn and cites the Standards of Conduct",
    report: `${REPORT}: control, the person on the roster`,
    status: { open: "production answers the message as metric-only (CA_SALES_POLICY_ENABLED off)" },
    fixFlags: [FLAG, SALES, GLOSSARY],
    async run(t) {
      const thread = start(t, [...ROSTER, REMY_FENN]);
      const reply = await thread.say(say("Remy Fenn"));
      expect(reply.content, `a metric is named or offered as a person:\n${reply.content}`).not.toMatch(METRIC_AS_PERSON);
      expect(thread.proposal, `no CA card for Remy Fenn:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Remy Fenn" });
      expect(policyLine(reply), `the card does not cite Standards of Conduct:\n${reply.content}`).toMatch(/standards of conduct/i);
    },
  },
  {
    id: "nov5-request-slot-metrics-only",
    title: "metrics only (\"CA for under performance on Club Close % and Spa %\"): no card for \"under\" or \"Club Close\"; it asks who",
    report: `${REPORT}: metrics only`,
    status: "fixed",
    fixFlags: [FLAG, SALES, GLOSSARY],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("CA for under performance on Club Close % and Spa %");
      expect(reply.content, `a metric is named as a person:\n${reply.content}`).not.toMatch(/\*\*(?:under|Club Close)\*\*/i);
      expect(thread.proposal?.employeeName ?? "", "a metric is on the card").not.toMatch(/under|club close/i);
      if (thread.proposal) {
        expect(reply.content, `a card with no employee does not ask who it is for:\n${reply.content}`).toMatch(/Who is this (?:\*\*[^*]+\*\* |form )?for\?|Employee's full name/);
      }
    },
  },
  {
    id: "nov5-request-slot-two-people",
    title: "control: \"CA for Wilhelmina Corvina and Peregrine Varnholt for being late\", both on the roster, still asks which of them",
    report: `${REPORT}: control, two people named`,
    status: "fixed",
    fixFlags: [FLAG, SALES, GLOSSARY],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("CA for Wilhelmina Corvina and Peregrine Varnholt for being late");
      expect(reply.content, `does not ask which of the two:\n${reply.content}`).toMatch(/Wilhelmina Corvina/);
      expect(reply.content, `does not ask which of the two:\n${reply.content}`).toMatch(/Peregrine Varnholt/);
      expect(thread.proposal?.employeeName ?? null, "a card was made for one of them without asking").toBeNull();
    },
  },
  {
    id: "nov5-request-slot-no-name-verbal",
    title: "QA review: \"I need a corrective action verbal. This is for Under Performance on …\" names nobody: it asks who; never \"Under Performance\" or \"Under\"",
    report: `${REPORT}: QA review of the request slot, edge case 1`,
    status: { open: "\"I couldn't find **Club Close** or **Under** in the Woven roster\"; with the three flags on (before the QA review fix), \"I couldn't find **Under** …\"" },
    fixFlags: [FLAG, SALES, GLOSSARY],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("I need a corrective action verbal. This is for Under Performance on PPTA, LPSVA, Club Average, Club Close %, and Spa %.");
      noUnderAsPerson(thread, reply);
    },
  },
  {
    id: "nov5-request-slot-ca-for-under-performance",
    title: "QA review: \"I need a CA for Under Performance on …\": the slot is an offense, not a name; it asks who",
    report: `${REPORT}: QA review of the request slot, edge case 2`,
    status: { open: "\"I couldn't find **Under** in the Woven roster\" and a card for **Club Close**; with the three flags on (before the QA review fix), \"I couldn't find **Under** …\"" },
    fixFlags: [FLAG, SALES, GLOSSARY],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("I need a CA for Under Performance on PPTA, LPSVA, Club Average, Club Close %, and Spa %.");
      noUnderAsPerson(thread, reply);
    },
  },
  {
    id: "nov5-request-slot-ca-for-store",
    title: "QA review: \"I need a CA for Store 264\": never a card for \"Store\" or \"Store 264\"",
    report: `${REPORT}: QA review of the request slot, edge case 3`,
    status: "fixed",
    fixFlags: [FLAG, SALES, GLOSSARY],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("I need a CA for Store 264");
      expect(thread.proposal?.employeeName ?? "", "a location is the card's employee").not.toMatch(/Store|\b\d+\b/i);
      expect(reply.content, `a location is named or asked about as a person:\n${reply.content}`).not.toMatch(/\*\*Store(?: \d+)?\*\*|couldn't find \*\*Store/i);
    },
  },
  /*
   * The flip's eval check in the sibling app (5 Nov 2026): with
   * FORM_NAME_FROM_ROSTER_ENABLED and the sales policy on, a name typed in
   * lowercase straight after "for" was lost — "ima" to the lowercase rule (the
   * card had no employee and asked who), "merriwether" to the request slot
   * (the card was for "Odalys"). The words after a request's first "for" are
   * the person asked for, in any case (`request-slot.ts` typedAfterFor).
   */
  {
    id: "nov5-lowercase-after-for-ima",
    title: "\"create a CA form for ima employee, for opening the store late on 9-28-26\": the card is for Ima",
    report: "The flip's eval check, 5 Nov 2026 (the sibling app's eval s9 shape)",
    status: "fixed",
    fixFlags: [FLAG, SALES, GLOSSARY],
    async run(t) {
      // This app makes no card for a name on no roster, so the person is on it here.
      const thread = start(t, [...ROSTER, person("e-ima-employee", "Ima", "Employee")]);
      const reply = await thread.say("create a CA form for ima employee, for opening the store late on 9-28-26");
      expect(thread.proposal?.employeeName ?? "", `no card for Ima:\n${reply.content}`).toMatch(/^Ima\b/i);
    },
  },
  {
    id: "nov5-lowercase-after-for-surname",
    title: "\"make me a CA for Odalys merriwether for being late to opening this morning\": the card keeps the surname",
    report: "The flip's eval check, 5 Nov 2026 (the sibling app's eval sf-s4)",
    status: "fixed",
    fixFlags: [FLAG, SALES, GLOSSARY],
    async run(t) {
      const thread = start(t, [...ROSTER, person("e-odalys-merriwether", "Odalys", "Merriwether")]);
      const reply = await thread.say("make me a CA for Odalys merriwether for being late to opening this morning");
      expect(thread.proposal?.employeeName ?? "", `the card lost the surname:\n${reply.content}`).toMatch(/^Odalys Merriwether$/i);
    },
  },
];
