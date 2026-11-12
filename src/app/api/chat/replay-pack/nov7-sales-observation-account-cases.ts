import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayAnswer, type ReplayCase, type ReplayContext } from "./cases";

/**
 * The sibling app's flip-4 gate (QA, 7 Nov 2026), checked here: with SALES_SHORTFALL_OBJECT on, "on performance"
 * counts as the account, so the request's own words became the card's Observation of Offense, with the
 * employee's name first and a payroll answer in it:
 *   h01      "**Observation of Offense:** <name> on performance"
 *   nov2-p1a "<name> on performance She had 24 … and was below in …"
 *   sf-s23   "performance for october not pay roll deductable"
 * Here (probed 7 Nov 2026, SALES_SHORTFALL_OBJECT on): h01's card shows "**Issue:** written CA for Remy Calder on
 * performance" (none with it off); p1a's Issue is her account; sf-s23 gets no card. With
 * SALES_OBSERVATION_ACCOUNT_ENABLED the Issue holds the account: never the employee's name as its first words, never the request's reason
 * ("on / for performance (for october)"), never a payroll answer. The person is the pack's invented Remy Calder.
 */
/** The card's Issue (this app's card shows the account as "Issue"), or "". */
function observationLine(reply: ReplayAnswer): string {
  const issue = /\*\*Issue:?\*\*([^·\n]*)/i.exec(reply.content);
  return issue ? `**Issue:**${issue[1]}` : "";
}

const FIX = ["SALES_SHORTFALL_OBJECT_ENABLED", "SALES_OBSERVATION_ACCOUNT_ENABLED"];
const REPORT = "The sibling app's flip-4 gate (QA, 7 Nov 2026): the request words became the card's account (here, its Issue) under SALES_SHORTFALL_OBJECT";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-04T23:30:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

function noRequestWords(line: string): void {
  expect(line, `the Observation starts with the employee's name:\n${line}`).not.toMatch(/Issue:\*\*\s*remy\b/i);
  expect(line, `the request's reason is the Observation:\n${line}`).not.toMatch(/\b(?:on|for)\s+performance\b/i);
  expect(line, `a payroll answer is in the Observation:\n${line}`).not.toMatch(/pay\s*roll/i);
}

export const NOV7_SALES_OBSERVATION_ACCOUNT_CASES: ReplayCase[] = [
  {
    id: "nov7-sales-observation-h01",
    title: "h01: \"written CA for <name> on performance\": the Observation is never \"<name> on performance\"",
    report: `${REPORT} (h01)`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("written CA for Remy Calder on performance");
      noRequestWords(observationLine(reply));
    },
  },
  {
    id: "nov7-sales-observation-p1a",
    title: "nov2-p1a: the metrics she gave are the Observation, without \"<name> on performance\"",
    report: `${REPORT} (nov2-p1a turn 1)`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say("Can you make a written CA for remy calder on performance");
      const reply = await thread.say("She had 24 transactions and was below in Below in UPT, ATV, average ticket, and units per transaction");
      const line = observationLine(reply);
      noRequestWords(line);
    },
  },
  {
    id: "nov7-sales-observation-sf-s23",
    title: "sf-s23: \"…for performance for october\" then \"not pay roll deductable\": neither is the Observation",
    report: `${REPORT} (sf-s23 turn 2)`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say("can you write me a Ca for remy calder for performance for october");
      const reply = await thread.say("not pay roll deductable");
      noRequestWords(observationLine(reply));
    },
  },
];
