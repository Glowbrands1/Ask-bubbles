import { expect } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * "A COACHING FORM FOR <A>, <B>, AND <C>" — WHICH <A> IS ASKED, THEN ONE FORM EACH, EACH NAMED (ported from the sibling app: QA's
 * P7 there, 10 Nov 2026; ONE_FORM_EACH_PERSON, CARD_NAMES_EMPLOYEE)
 * ============================================================================
 *
 * "Make me a coaching form for <A>, <B>, and <C> for not closing duties correctly" (<A> a first name two people share)
 * → "Did you mean <A> <s1> or <A> <s2>?" → "create draft for failure to do closing duties and staying over hours" gave
 * ONE card, for one of the two <A>s unasked, its Observation "<B>, and <C> for … create draft for …", its reply "I have
 * the employee". QA's decisions: one form each (ask which <A> first, then offer <B>'s and <C>'s); the unanswered question
 * is asked again; the reply names the employee. Here the unanswered question is already asked again, and this app's
 * Coaching card shows no Observation line, so the cases check the queue, each person's card and the named reply.
 * The people are invented.
 */
const row = (id: string, firstName: string, lastName: string): DirectoryRow => ({ id, firstName, lastName, preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" });
const PEOPLE = [row("p7-tamsin-rookwood", "Tamsin", "Rookwood"), row("p7-tamsin-ashby", "Tamsin", "Ashby"), row("p7-corwin-halsey", "Corwin", "Halsey"), row("p7-ione-marchetti", "Ione", "Marchetti")];
const T1 = "Make me a coaching form for Tamsin, Corwin, and Ione for not closing duties correctly";
const T2 = "create draft for failure to do closing duties and staying over hours";
const FIX = ["ONE_FORM_EACH_PERSON_ENABLED", "CARD_NAMES_EMPLOYEE_ENABLED"];
const REPORT = "QA's P7 in the sibling app (10 Nov 2026): three people asked for, only the first handled";
const ASKS_WHICH_TAMSIN = /Did you mean \*\*Tamsin (?:Rookwood|Ashby)\*\* or \*\*Tamsin (?:Rookwood|Ashby)\*\*\?/;

function start(t: ReplayContext) {
  t.directory([...STAFF, ...PEOPLE]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV10_ONE_FORM_EACH_PERSON_CASES: ReplayCase[] = [
  {
    id: "nov10-p7-unanswered-which-tamsin-asked-again",
    title: "QA's two turns: \"Did you mean …?\" is asked again (no card for either Tamsin, as here today), and Corwin's and Ione's forms are queued",
    report: REPORT,
    status: { open: "Corwin's and Ione's forms are never queued" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const first = await thread.say(T1);
      expect(first.content, `which Tamsin is not asked:\n${first.content}`).toMatch(ASKS_WHICH_TAMSIN);
      const reply = await thread.say(T2);
      expect(thread.proposal?.employeeName ?? null, `a card for one of the two Tamsins, never chosen:\n${reply.content}`).toBeNull();
      expect(reply.content, `which Tamsin is not asked again:\n${reply.content}`).toMatch(ASKS_WHICH_TAMSIN);
      expect(reply.content, `Corwin's and Ione's forms are not queued:\n${reply.content}`).toMatch(/\*\*Next:\*\* a Coaching Form each for \*\*Corwin Halsey\*\* and \*\*Ione Marchetti\*\*/);
    },
  },
  {
    id: "nov10-p7-one-form-each-named",
    title: "T1 → \"Tamsin Ashby\" → \"yes\" → \"yes\": one Coaching card each for Tamsin Ashby, Corwin Halsey and Ione Marchetti, each reply naming them",
    report: REPORT,
    status: { open: "one card, for one person; the other two never handled" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say(T1);
      for (const [said, person, next] of [
        ["Tamsin Ashby", "Tamsin Ashby", "Corwin Halsey"],
        ["yes", "Corwin Halsey", "Ione Marchetti"],
        ["yes", "Ione Marchetti", null],
      ] as const) {
        const reply = await thread.say(said);
        expect(thread.proposal, `"${said}": no Coaching card for ${person}:\n${reply.content}`).toMatchObject({ templateKey: "coaching", employeeName: person });
        expect(reply.content, `"${said}": the reply does not name ${person}:\n${reply.content}`).toMatch(new RegExp(`I have \\*\\*${person}\\*\\*`));
        expect(reply.content, `"${said}": "I have the employee":\n${reply.content}`).not.toMatch(/I have the employee\b/);
        if (next) expect(reply.content, `"${said}": ${next} is not offered next:\n${reply.content}`).toMatch(new RegExp(`\\*\\*Next:\\*\\* a Coaching Form each for \\*\\*${next}\\*\\*`));
        else expect(reply.content, `"${said}": a Next line after the last person:\n${reply.content}`).not.toMatch(/\*\*Next:\*\*/);
      }
    },
  },
];
