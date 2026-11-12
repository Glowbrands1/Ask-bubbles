import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * QA, 11 Nov 2026 (Coding-5's BCS-metrics probe): a sales Corrective Action written in Buff City Soap's own KPI words
 * (the Domo KPI deck: IPT, AOV, Comp Sales %, Discount Rate) lost its Issue. The name reader took "Comp Sales" and
 * "Discount Rate" for a person, and the next turn's card was drawn from that turn alone ("no payroll deduct"). The
 * account turns word for word; the employee is invented (on the replay roster).
 */
const FIX = ["COMPANY_METRIC_WORDS_NOT_NAMES_ENABLED"];
const REPORT = "QA, 11 Nov 2026: a sales CA in Buff City Soap's KPI words has no Issue";

/** The card's Issue, without the summary items after it. */
function issue(content: string): string {
  const line = content.split("\n").find((text) => /\*\*Issue:\*\*/.test(text)) ?? "";
  return line.replace(/^.*?\*\*Issue:\*\*\s*/, "").split(" · ")[0] ?? "";
}

async function chat(t: ReplayContext, account: string): Promise<string> {
  vi.setSystemTime(new Date("2026-11-11T15:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  let content = "";
  for (const turn of ["Can you make a written CA for remy calder", account, "no payroll deduct"]) content = (await thread.say(turn)).content;
  expect(thread.proposal, `no Corrective Action card for Remy Calder:\n${content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Remy Calder" });
  return content;
}

const CASES: [id: string, account: string, kept: RegExp][] = [
  ["nov11-bcs-metrics-comp-sales", "She was below goal in IPT, AOV and Comp Sales % for October", /IPT, AOV and Comp Sales %/],
  ["nov11-bcs-metrics-discount-rate", "She had 40 transactions and was below in IPT, AOV, and Discount Rate", /40 transactions .* Discount Rate/],
];

export const NOV11_COMPANY_METRIC_WORDS_NOT_NAMES_CASES: ReplayCase[] = CASES.map(([id, account, kept]) => ({
  id,
  title: `"${account}" on a sales CA: the Issue keeps the account`,
  report: REPORT,
  status: { open: "the card has no Issue: the account is lost on the next turn" },
  fixFlags: FIX,
  async run(t) {
    const content = await chat(t, account);
    expect(issue(content), `the account is lost:\n${content}`).toMatch(kept);
  },
}));
