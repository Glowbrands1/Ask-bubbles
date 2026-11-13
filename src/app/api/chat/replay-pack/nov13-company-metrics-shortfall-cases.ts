import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * BUFF CITY SOAP'S KPIs ON A CA CITE THE STANDARDS OF CONDUCT (QA's ruling (a), 13 Nov 2026)
 * ============================================================================
 *
 * Found by the CA_NO_POLICY_ASKS_WHICH replay diff (Ask-bubbles#848): the nov11-bcs-metrics turns, word for word, made a
 * built Corrective Action card with no Policy line. A sales shortfall is the sales part of the Standards of Conduct
 * (CA_SALES_POLICY, Pau 4 Nov 2026); this company's KPIs were not read as one. COMPANY_METRICS_SHORTFALL_ENABLED.
 */
const REPORT = "QA's ruling (a) on CA_NO_POLICY_ASKS_WHICH, 13 Nov 2026";

const CASES: [id: string, account: string][] = [
  ["nov13-company-metrics-comp-sales-cites-conduct", "She was below goal in IPT, AOV and Comp Sales % for October"],
  ["nov13-company-metrics-discount-rate-cites-conduct", "She had 40 transactions and was below in IPT, AOV, and Discount Rate"],
];

export const NOV13_COMPANY_METRICS_SHORTFALL_CASES: ReplayCase[] = CASES.map(([id, account]) => ({
  id,
  title: `"${account}" on a written CA: the card cites the Standards of Conduct`,
  report: REPORT,
  status: { open: "the card has no Policy line" },
  fixFlags: ["COMPANY_METRICS_SHORTFALL_ENABLED"],
  async run(t) {
    vi.setSystemTime(new Date("2026-11-13T10:00:00Z"));
    t.directory(STAFF);
    t.as("location_manager", WEST_DODGE);
    const thread = t.thread();
    await thread.say("Can you make a written CA for remy calder");
    const reply = await thread.say(account);
    expect(thread.proposal, `no CA card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Remy Calder" });
    expect(reply.content.split("\n").find((line) => line.startsWith("**Policy:**")) ?? "", reply.content).toMatch(/Standards of Conduct/);
  },
}));
