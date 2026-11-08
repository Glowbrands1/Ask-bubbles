import { expect, vi } from "vitest";

import { WEST_DODGE, STAFF, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * A POLICY CORRECTION IS NOT THE ACCOUNT (QA, 8 Nov 2026, ported from the sibling app's round-5 live tester, item 3;
 * pre-existing; POLICY_CORRECTION_NOT_ACCOUNT_ENABLED)
 * ============================================================================
 *
 * A sales Corrective Action (the person invented): the request, the numbers, "no payroll deduct", then "it should be
 * under performance not standard of conduct". The card answered that Under Performance isn't on the CA form, but
 * the correction became the card's Issue ("**Issue:** it should be under performance not standard of conduct").
 */
const TURNS = [
  "Can you make a written CA for remy calder",
  "She had 24 tans and was below in PPTA, LPSVA, Avg Club, CC%, and Spa%",
  "no payroll deduct",
  "it should be under performance not standard of conduct",
] as const;
const FIX = ["POLICY_CORRECTION_NOT_ACCOUNT_ENABLED"];
const REPORT = "QA, 8 Nov 2026 (the sibling app's round-5 live tester, item 3): the policy correction became the Issue";

/** The card's Issue, without the summary items after it. */
function observationLine(content: string): string {
  const line = content.split("\n").find((text) => /\*\*Issue:\*\*/.test(text)) ?? "";
  return line.replace(/^.*?\*\*Issue:\*\*\s*/, "").split(" · ")[0] ?? "";
}

async function chat(t: ReplayContext, turns: readonly string[]): Promise<string> {
  vi.setSystemTime(new Date("2026-11-07T15:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  let content = "";
  for (const turn of turns) content = (await thread.say(turn)).content;
  expect(thread.proposal, `no Corrective Action card for Remy Calder:\n${content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Remy Calder" });
  return content;
}

export const NOV8_POLICY_CORRECTION_NOT_ACCOUNT_CASES: ReplayCase[] = [
  {
    id: "nov8-policy-correction-not-account",
    title: "\"it should be under performance not standard of conduct\" on a sales CA: the Issue keeps the account, never the correction",
    report: REPORT,
    status: { open: "the Issue is \"it should be under performance not standard of conduct\"" },
    fixFlags: FIX,
    async run(t) {
      const content = await chat(t, TURNS);
      const line = observationLine(content);
      expect(line, `the account is lost:\n${content}`).toMatch(/24 tans/);
      expect(line, `the correction is the account:\n${content}`).not.toMatch(/should be|standard of conduct|under performance/i);
    },
  },
  {
    id: "nov8-policy-correction-account-kept",
    title: "must not change: an account sentence that says \"should be\" about the work (\"her drawer should be counted …\") stays",
    report: REPORT,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const content = await chat(t, [
        "create a written CA for remy calder for a cash shortage on 11/2",
        "her drawer was $40 short at close and she did not count it with a manager",
      ]);
      // This app's Issue is the request's own for-clause ("a cash shortage on 11/2") when it gives one.
      expect(observationLine(content), `the account is lost:\n${content}`).toMatch(/cash shortage|\$40 short/);
    },
  },
];
