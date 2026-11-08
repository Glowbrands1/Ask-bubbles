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
  {
    id: "nov8-sales-triple-reason-alone-is-the-issue",
    title: "\"I need a corrective action for <A> for under performance\": the reason alone stays the Issue",
    report: "QA's Bubbles round-5 gate, 8 Nov 2026 (the sales group lost the Issue)",
    status: "fixed",
    fixFlags: PAIR,
    async run(t) {
      const reply = await start(t).say("I need a corrective action for Remy Calder for under performance");
      expect(issueLine(reply), `the Issue is lost:\n${reply.content}`).toMatch(/\*\*Issue:\*\* under performance\b/i);
    },
  },
  {
    id: "nov8-sales-triple-place-lead",
    title: "\"create a written CA for <A> at <store> for missing the 10-15-26 woven deadline\": the Issue never opens with \"at <store>\"",
    report: "QA's Bubbles round-5 final gate, 8 Nov 2026 (nov7-refusal-bub-phone, with the sales group on)",
    status: "fixed",
    fixFlags: [...PAIR, "ACCOUNT_PLACE_LEAD_ENABLED"],
    async run(t) {
      const reply = await start(t).say("create a written CA for Remy Calder at West Dodge Rd for missing the 10-15-26 woven deadline");
      expect(issueLine(reply), `the Issue opens with the request's place:\n${reply.content}`).not.toMatch(/Issue:\*\*\s*at\b/i);
      expect(issueLine(reply), `the account is lost:\n${reply.content}`).toMatch(/woven deadline/i);
    },
  },
];
