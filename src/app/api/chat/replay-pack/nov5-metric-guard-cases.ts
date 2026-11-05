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
    id: "nov5-metric-guard-metrics-only",
    title: "the smaller set: \"CA for under performance on Club Close % and Spa %\" (no name): no card for \"under\" or \"Club Close\"; it asks who",
    report: `${REPORT}; the gate's twin (5 Nov 2026): nov4-pau-metrics-not-people-metrics-only and nov5-request-slot-metrics-only hold with production's flags and fail with the smaller set (a card for **under**)`,
    status: { open: "with the smaller set the card is for **under** (\"I'll draft a **Corrective Action Form** for **under**\")" },
    fixFlags: ["METRIC_GUARD_ENABLED"],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("CA for under performance on Club Close % and Spa %");
      expect(thread.proposal?.employeeName ?? "", `a metric is the card's employee:\n${reply.content}`).not.toMatch(/^under$|club close|spa/i);
      expect(reply.content, `a metric is offered as a person:\n${reply.content}`).not.toMatch(/\*\*(?:under|Club Close|Spa)\*\*/i);
      expect(reply.content, `does not ask who:\n${reply.content}`).toMatch(/Who is this|employee'?s full name/i);
    },
  },
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
  /*
   * Found in the smaller-set gate's records (5 Nov 2026), not in its table: nov2-p1b-next-message-new-draft
   * passes with the flags on, but its turn 3 reply is EMPTY. With CA_SALES_POLICY_ENABLED on (alone, or in the
   * six-flag set) "underperformance for the month of october", said with the Corrective Action draft open, gets
   * no reply and no update; off, "I haven't changed the **Corrective Action Form** for **Remy Calder** …".
   * Recorded OPEN, no fix yet.
   */
  {
    id: "nov5-ca-sales-open-draft-reply-not-empty",
    title: "the smaller set: with the CA draft open, \"underperformance for the month of october\" gets a reply, never an empty one",
    report: "the smaller-set gate's records (5 Nov 2026): nov2-p1b-next-message-new-draft turn 3, an empty reply with CA_SALES_POLICY_ENABLED on",
    status: { open: "with CA_SALES_POLICY_ENABLED on the reply is empty (no text, no update)" },
    async run(t) {
      const thread = start(t);
      await thread.say("I need to create a verbal corrective action form");
      await thread.say("Remy Calder");
      t.draftWrites({});
      const first = await thread.create();
      t.typeOnForm(first, { observation: "Remy was below the store average in October on every metric we track." });
      t.revisionWrites({ observation: "Remy was below the store average in October on every metric we track — underperformance for the month of October." });
      const reply = await thread.say("underperformance for the month of october");
      expect(reply.content.trim(), "the reply is empty").not.toBe("");
    },
  },
];
