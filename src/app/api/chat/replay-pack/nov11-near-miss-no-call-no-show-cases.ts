import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";
import { at } from "./nov4-live-regressions-scenarios";

/**
 * NEAR_MISS_TURNED_DOWN_EVERYWHERE (QA, 11 Nov 2026; port of the sibling app's). After "Is this for **<roster name>**?",
 * "no call no show on 11/3, verbal warning" was read as turning the name down (any turn opening with "no"): the name
 * left the card, the details were dropped, and the reply asked who. It is an account: the name stays. Only "no"/"nope"
 * on their own or with their own punctuation turn it down. The same chat as nov7-near-miss-details (invented people).
 */
const ON = [
  "FORM_NAME_FROM_ROSTER_ENABLED",
  "ROSTER_NEAR_MISS_ENABLED",
  "ROSTER_NAME_IN_CANDIDATE_ENABLED",
  "ROSTER_COMPOUND_SURNAME_ENABLED",
  "ROSTER_NOT_FOUND_ANY_PHRASING_ENABLED",
  "OFF_ROSTER_CONFIRM_ENABLED",
  "NEAR_MISS_DETAILS_ACCEPT_ENABLED",
  "NEAR_MISS_QUESTION_RULES_ENABLED",
  "NEAR_MISS_TURNED_DOWN_EVERYWHERE_ENABLED",
];
const CORVINA = at("nm-corvina", "Corvina", "Vellacott");
const DELPHINE = at("nm-delphine", "Delphine", "Marlowe Ostrander");
const ASKED = /Is this for \*\*[^*]+\*\*\? Tell me if that should change\./;
const FIRST = "i have an employee, Corvina Ashdown Vellacot that needs a corrective action form with a customer complaint";
const NO_CALL = "no call no show on 11/3, verbal warning";
const REPORT = "QA, 11 Nov 2026: \"no call no show …\" after the near-miss question is read as turning the name down";

export const NOV11_NEAR_MISS_NO_CALL_NO_SHOW_CASES: ReplayCase[] = [
  {
    id: "nov11-near-miss-no-call-no-show-after-question",
    title: `after "Is this for **Corvina Vellacott**?", "${NO_CALL}": the card keeps Corvina Vellacott and "no call no show"`,
    report: REPORT,
    status: { open: "the asked name is taken off and the reply asks who" },
    fixFlags: ON,
    async run(t) {
      vi.setSystemTime(new Date("2026-11-04T15:30:00Z"));
      t.directory([...STAFF, CORVINA, DELPHINE]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const asked = await thread.say(FIRST);
      expect(asked.content, "the near-miss question was not asked").toMatch(ASKED);
      const reply = await thread.say(NO_CALL);
      expect(thread.proposal?.employeeName ?? null, `the asked name was taken off:\n${reply.content}`).toBe("Corvina Vellacott");
      expect(reply.content, reply.content).not.toMatch(/^\*\*(?:Observation of Offense|Issue|What happened):\*\*\s*call no show/im);
    },
  },
  {
    id: "nov11-near-miss-no-call-no-show-fresh",
    title: `"create a ca for Corvina Vellacott, ${NO_CALL}": the account keeps "no call no show"`,
    report: REPORT,
    status: "fixed",
    fixFlags: ON,
    async run(t) {
      vi.setSystemTime(new Date("2026-11-04T15:30:00Z"));
      t.directory([...STAFF, CORVINA, DELPHINE]);
      t.as("location_manager", WEST_DODGE);
      const reply = await t.thread().say(`create a ca for Corvina Vellacott, ${NO_CALL}`);
      expect(reply.content, reply.content).not.toMatch(/^\*\*(?:Observation of Offense|Issue|What happened):\*\*\s*call no show/im);
    },
  },
];
