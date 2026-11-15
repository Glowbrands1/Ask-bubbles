import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * Ported from the sibling app (QA's J11, 15 Nov 2026): after "change observation of offense to: <B> completed
 * onboarding with new hire <C> on 9-28-26. …", the person reader took <C> as the form's subject. People invented:
 * Juno Paxton (STAFF's), the new hire Corran Vale.
 */
const FLAG = "ACCOUNT_PERSON_NOT_SUBJECT_ENABLED";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-15T05:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV15_ACCOUNT_PERSON_NOT_SUBJECT_CASES: ReplayCase[] = [
  {
    id: "nov15-j11-new-hire-in-the-account-not-the-subject",
    title: "J11: \"… with new hire <C> …\" in the account never makes the form <C>'s; Create files <B>'s card",
    report: "QA, J11 (15 Nov 2026), from the sibling app: Create refused the card as \"out of date: the conversation now says the form is for <C>\"",
    status: { open: "a person named inside the account (\"with new hire <C>\") is read as the form's subject" },
    fixFlags: [FLAG],
    async run(t) {
      const thread = start(t);
      await thread.say("create a CA for juno paxton for violating the standards of conduct");
      await thread.say("change observation of offense to: Juno completed onboarding with new hire Corran Vale on 9-28-26. As of 10-16-26 Corran had not acknowledged onboarding policies in Woven that should have been completed during onboarding.");
      expect(thread.proposal?.employeeName, "the card is not Juno's").toBe("Juno Paxton");
      const id = await thread.create();
      expect(t.forms().find((row) => row.id === id)?.employee_name).toBe("Juno Paxton");
    },
  },
];
