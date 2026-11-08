import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayAnswer, type ReplayCase } from "./cases";
import { underPerformanceExplainedPeople } from "./nov6-under-performance-explained-cases";

/**
 * QA's round-5 Bubbles check (8 Nov 2026), from the sibling app's history 1143df48: "I need a corrective action for
 * under performance. <A> was below on …" gave "**Issue:** under performance": the request's reason, and the account
 * was lost. With "made for" ("I need a corrective action made for under performance. <A> was below on …") the Issue
 * was the whole message, request and all. ISSUE_AFTER_REQUEST_REASON_ENABLED (with ISSUE_IS_THE_ACCOUNT, live here):
 * a request whose for-clause is only a sales reason gives no Issue of its own; the account sentence after it is the
 * Issue. The person is the pack's invented Remy Calder; the metrics are this app's own words, not the sibling's.
 */
const FLAG = "ISSUE_AFTER_REQUEST_REASON_ENABLED";
const REPORT = "QA's round-5 Bubbles check (8 Nov 2026): \"I need a corrective action for under performance. <A> was below on …\" gave \"Issue: under performance\"";
const ACCOUNT = "Remy Calder was below on sales per hour, add-on sales and conversion in the month of October.";

function issueLine(reply: ReplayAnswer): string {
  return /\*\*Issue:\*\*\s*([^·\n]*)/.exec(reply.content)?.[1]?.trim() ?? "";
}

async function issue(t: Parameters<ReplayCase["run"]>[0], said: string): Promise<string> {
  vi.setSystemTime(new Date("2026-11-07T18:56:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return issueLine(await t.thread().say(said));
}

export const NOV8_ISSUE_AFTER_REQUEST_REASON_CASES: ReplayCase[] = [
  {
    id: "nov8-issue-after-request-reason-for",
    title: "\"I need a corrective action for under performance. <A> was below on …\": the Issue is the account, not \"under performance\"",
    report: REPORT,
    status: { open: "with production's flags the Issue is \"under performance\"" },
    fixFlags: [FLAG],
    async run(t) {
      const line = await issue(t, `I need a corrective action for under performance. ${ACCOUNT}`);
      expect(line, "the Issue is only the request's reason").not.toMatch(/^under performance$/i);
      expect(line, "the Issue is not the account").toMatch(/^Remy Calder was below on sales per hour/);
    },
  },
  {
    id: "nov8-issue-after-request-reason-made-for",
    title: "\"I need a corrective action made for under performance. <A> was below on …\": the Issue is the account, without the request",
    report: REPORT,
    status: { open: "with production's flags the Issue is the whole message, request included" },
    fixFlags: [FLAG],
    async run(t) {
      const line = await issue(t, `I need a corrective action made for under performance. ${ACCOUNT}`);
      expect(line, "the request is in the Issue").not.toMatch(/\bI need a corrective action\b|\bmade for\b/i);
      expect(line, "the Issue is not the account").toMatch(/^Remy Calder was below on sales per hour/);
    },
  },
  {
    id: "nov8-issue-after-request-reason-alone",
    title: "negative: \"I need a corrective action for under performance\" alone: the reason stays the Issue",
    report: REPORT,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      expect(await issue(t, "I need a corrective action for Remy Calder for under performance")).toMatch(/under performance/i);
    },
  },
  {
    id: "nov8-issue-after-request-reason-offense",
    title: "negative: \"a corrective action for late opening the store on 11/2. <A> …\": an offense in the for-clause is still the Issue",
    report: REPORT,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      const line = await issue(t, "I need a corrective action for Remy Calder for late opening the store on 11/2. He opened 40 minutes late.");
      expect(line).toMatch(/late opening the store/i);
    },
  },
  {
    // QA's round-5 regression on this flag (8 Nov 2026): the sibling-port tester's two turns. With the flag the
    // correction turn became the Issue; off, the Issue is "her sales are low". A turn that only corrects the policy or
    // the level is no account. The person is nov6-under-performance-explained's invented Odalys Fenmarrow.
    id: "nov8-issue-after-request-reason-policy-correction",
    title: "negative: \"it should be under performance not standard of conduct\" (a policy correction) is never the Issue",
    report: "QA's round-5 Bubbles check (8 Nov 2026): in nov6-under-performance-explained-tester, T2 \"it should be under performance not standard of conduct\" became the Issue (off: \"her sales are low\")",
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-06T15:00:00Z"));
      t.directory([...STAFF, ...underPerformanceExplainedPeople()]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("CA for Odalys Fenmarrow, her sales are low");
      const line = issueLine(await thread.say("it should be under performance not standard of conduct"));
      expect(line, "the policy correction is the Issue").not.toMatch(/should be|standard of conduct/i);
      expect(line, "the account is lost").toMatch(/her sales are low/i);
    },
  },
];
