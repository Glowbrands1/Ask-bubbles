import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * THE LETTER'S OTHER PERSON IS NEVER OFFERED AS THE EXIT FORM'S SUBJECT (QA, 8 Nov 2026, ported from the sibling app's round-5 live
 * tester, item 4b; pre-existing; EXIT_OTHER_PERSON_NOT_SUBJECT_ENABLED)
 * ============================================================================
 *
 * The letter of nov5-exit-termination-paste (the people invented): "I need an exit form with this information. …"
 * was answered "Which of them is this **Resignation/Exit Form** for — **Philippa** or **Dorran**?": the letter's "your
 * General Manager, Philippa" offered as the subject.
 */
const DORRAN: DirectoryRow = {
  id: "e-dorran-ashby",
  firstName: "Dorran",
  lastName: "Ashby",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

const LETTER = [
  "Meeting with Dorran tomorrow 11/06 at 7:30am ",
  "",
  "    This decision follows the text message you sent to your General Manager on 11/05, in which you said that if you were asked to clean up a toilet overflow, you would turn in your keys.",
  "    Cleaning up this kind of incident is part of the job. We covered it in our recent safety training, including the correct PPE and cleanup steps.",
  "    The tone of the message was also disrespectful to your General Manager, Philippa.",
  "    We expect every team member to treat our General Managers with respect, and we are not able to continue working with you.",
  "",
  "",
  "This meeting confirms that your employment is terminated, effective 11/06/2026.",
  "",
  "Please return your store keys and any other company property today 11/06. Your final paycheck, including all hours worked through 11/05/2026, will be issued on 11/27/2026.",
].join("\n");

const FIX = ["EXIT_OTHER_PERSON_NOT_SUBJECT_ENABLED"];
const REPORT = "QA, 8 Nov 2026 (the sibling app's round-5 live tester, item 4b): the letter's General Manager offered as the exit form's subject";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-05T20:28:00Z"));
  t.directory([...STAFF, DORRAN]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV8_EXIT_OTHER_PERSON_CASES: ReplayCase[] = [
  {
    id: "nov8-exit-other-person-not-offered",
    title: "a termination letter naming \"your General Manager, Philippa\": the exit form's question never offers Philippa, nor echoes her title",
    report: REPORT,
    status: { open: "\"Which of them is this **Resignation/Exit Form** for — **Philippa** or **Dorran**?\"" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say(LETTER);
      const { content } = await thread.say(`I need an exit form with this information. ${LETTER}`);
      expect(content, `the letter's other person is offered:\n${content}`).not.toMatch(/\*\*Philippa\*\*/);
      expect(content, `her title is echoed as the employee's:\n${content}`).not.toMatch(/\*\*Job title:\*\*\s*General Manager/i);
      expect(content, `the form's person is not asked for:\n${content}`).toMatch(/Who is this \*\*Resignation\/Exit Form\*\* for\?|\*\*Dorran/);
      const reply = await thread.say("For Dorran Ashby");
      expect(thread.proposal?.employeeName, `the card is for someone else:\n${reply.content}`).toBe("Dorran Ashby");
    },
  },
  {
    id: "nov8-exit-other-person-two-real-candidates",
    title: "must not change: two people named plainly are both offered",
    report: REPORT,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const { content } = await thread.say("I need an exit form. Dorran and Rowan both quit yesterday with no notice.");
      if (/Which of them/.test(content)) expect(content, `a plain candidate is dropped:\n${content}`).toMatch(/\*\*Dorran\*\*[\s\S]*\*\*Rowan\*\*|\*\*Rowan\*\*[\s\S]*\*\*Dorran\*\*/);
    },
  },
];
