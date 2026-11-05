import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * A METRIC IS NEVER OFFERED AS THE PERSON (QA's LIVE=1, 5 Nov 2026, the smaller set)
 * ============================================================================
 *
 * QA's live run on main f99ee58a with CA_SALES_POLICY_ENABLED +
 * REPLY_MATCHES_CARD_ENABLED + TITLE_OF_THE_EMPLOYEE_ENABLED (+ the glossary),
 * 3/3 runs, mgr-1-roster-first-initial: "I need a corrective action verbal for
 * <first name> <last initial>. This is for Under Performance on PPTA, LPSVA,
 * Club Average, Club Close %, and Spa %." replied "Which of them is this
 * Corrective Action Form for — **Club Close**, **<first name>** or **Under**?".
 * With the flags off the metric CA is refused; with the six-flag set
 * FORM_NAME_FROM_ROSTER_ENABLED masked it: the guards that rule out a list item
 * or a word of the offense ("Under Performance") are all behind FORM_NAME.
 * METRIC_GUARD_ENABLED runs those two whatever FORM_NAME says.
 *
 * The person is invented (checked against both apps' directories).
 */

type T = ReplayContext;

const PERPETUA: DirectoryRow = {
  id: "e-perpetua-thornquist",
  firstName: "Perpetua",
  lastName: "Thornquist",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

const SMALLER_SET = ["CHAT_GLOSSARY_ENABLED", "CA_SALES_POLICY_ENABLED", "REPLY_MATCHES_CARD_ENABLED", "TITLE_OF_THE_EMPLOYEE_ENABLED"];
const REPORT = "QA's LIVE=1 on f99ee58a, 5 Nov 2026 (the smaller set, 3/3 runs): mgr-1-roster-first-initial offered metrics as people";
const say = (name: string) =>
  `I need a corrective action verbal for ${name}. This is for Under Performance on PPTA, LPSVA, Club Average, Club Close %, and Spa %.`;
const METRIC_AS_PERSON = /\*\*(?:Club Close|Club Average|Under|Spa|PPTA|LPSVA)\*\*/i;

function start(t: T) {
  for (const flag of SMALLER_SET) vi.stubEnv(flag, "true");
  vi.setSystemTime(new Date("2026-11-05T15:30:00Z"));
  t.directory([...STAFF, PERPETUA]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV5_METRIC_GUARD_CASES: ReplayCase[] = [
  ...(
    [
      ["first-initial", "Perpetua T"],
      ["first-name", "Perpetua"],
    ] as const
  ).map(
    ([shape, typed]): ReplayCase => ({
      id: `nov5-metric-guard-${shape}`,
      title: `the smaller set: "${say(typed).slice(0, 60)}…": no metric is the card's employee or offered as a person`,
      report: `${REPORT}; typed "${typed}"`,
      /*
       * A GUARD, not the proof (5 Nov 2026): replay's stand-in readers never build QA's live choice — with these
       * flags, with the readings "Perpetua T", "Perpetua" or "Club Close", and with the answering model's own
       * text listing the metrics, the reply is "Is this for **Perpetua Thornquist**?" — so the case holds with
       * production's flags too. The proof is `forms/metric-guard.test.ts` (QA's live reply, word for word) and
       * QA's LIVE=1 rerun.
       */
      status: "fixed",
      fixFlags: ["METRIC_GUARD_ENABLED"],
      async run(t) {
        const thread = start(t);
        const reply = await thread.say(say(typed));
        const card = thread.proposal?.employeeName ?? "";
        expect(card, `a metric is the card's employee:\n${reply.content}`).not.toMatch(/club close|club average|^under$|ppta|lpsva|^spa$/i);
        expect(reply.content, `a metric is offered as a person:\n${reply.content}`).not.toMatch(METRIC_AS_PERSON);
      },
    }),
  ),
  {
    id: "nov5-metric-guard-full-name-kept",
    title: "negative control, the smaller set: the same message for \"Perpetua Thornquist\" is her card",
    report: `${REPORT}; negative control`,
    status: "fixed",
    fixFlags: ["METRIC_GUARD_ENABLED"],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say(say("Perpetua Thornquist"));
      expect(thread.proposal?.employeeName, `not her card:\n${reply.content}`).toBe("Perpetua Thornquist");
      expect(reply.content, `a metric is offered as a person:\n${reply.content}`).not.toMatch(METRIC_AS_PERSON);
    },
  },
];
