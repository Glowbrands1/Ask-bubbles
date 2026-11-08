import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayAnswer, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * THE SALES FLAGS KEEP THE MANAGER'S WORDS (ported from the sibling app's round-4 gate, 8 Nov 2026)
 * ============================================================================
 *
 * SALES_SHORTFALL_OBJECT + SALES_OBSERVATION_ACCOUNT cut the reason and a payroll answer wherever they stood in the
 * Observation, here the card's Issue ("This is for Under Performance on …" → "This is on …"; "which will be payroll deducted from <name>'s
 * check" → "which will be from …"). Only the request clause may be cut (`forms/ca-policy.ts` observationAccount). The
 * sibling app's wording with this app's own metrics; the people the pack's invented Remy Calder and Marnie Holloway.
 */
const PAIR = ["SALES_SHORTFALL_OBJECT_ENABLED", "SALES_OBSERVATION_ACCOUNT_ENABLED"];
const REPORT = "The sibling app's round-4 gate, 8 Nov 2026: the sales flags cut the manager's words from the Issue";

/** This app's card shows the account as its Issue (`forms/incident-issue.ts`, which reads it through observationAccount). */
function issueLine(reply: ReplayAnswer): string {
  return /\*\*Issue:\*\*[^·\n]*/.exec(reply.content)?.[0] ?? "";
}

function start(t: ReplayContext, at = "2026-11-07T18:56:00Z") {
  vi.setSystemTime(new Date(at));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV8_SALES_TRIPLE_KEEPS_WORDS_CASES: ReplayCase[] = [
  {
    id: "nov8-sales-triple-this-is-for-under-performance",
    title: "\"… This is for Under Performance on her sales goals for October.\": the Issue is never \"This is on …\"",
    report: REPORT,
    status: "fixed",
    fixFlags: PAIR,
    async run(t) {
      const reply = await start(t).say("I need a corrective action verbal for Remy Calder. This is for Under Performance on her sales goals for October.");
      const line = issueLine(reply);
      expect(line, `the Issue cuts the manager's words:\n${reply.content}`).not.toMatch(/This is on/i);
    },
  },
  {
    id: "nov8-sales-triple-payroll-deducted-from-check",
    title: "\"… which will be payroll deducted from Marnie's check\": the Issue keeps \"payroll deducted\"",
    report: REPORT,
    status: "fixed",
    fixFlags: PAIR,
    async run(t) {
      const reply = await start(t, "2026-11-05T15:49:00Z").say(
        "create a verbal ca for marnie holloway. on 11-1-26 the register was off $20. which will be payroll deducted from Marnie's check. previous coaching was jba policy manual on 8-1-26. payroll deduct applies",
      );
      expect(issueLine(reply), `the Issue cuts "payroll deducted":\n${reply.content}`).not.toMatch(/which will be from/i);
    },
  },
];
