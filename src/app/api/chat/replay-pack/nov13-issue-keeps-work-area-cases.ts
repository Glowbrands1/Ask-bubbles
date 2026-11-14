import { expect, vi } from "vitest";

import { STAFF, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * ISSUE_KEEPS_WORK_AREA — "AT THE FRONT DESK" STAYS ON THE CARD'S ISSUE LINE (QA, 13 Nov 2026)
 * ============================================================================
 *
 * QA (13 Nov 2026, low, approved), from the sibling app's 38d live check ("<A> at the front desk, she was rude …"): a
 * request that names the person and where they were works ("create a ca for <A> at the front desk, she was rude to a
 * guest"), but on production flags the card's Issue line is only "she was rude to a guest" — the request's for-clause
 * is read as who and where and passed over, and the work area goes with it. With ISSUE_KEEPS_WORK_AREA_ENABLED the
 * work area stays: "she was rude to a guest at the front desk". A store said the same way is still left off the Issue,
 * and an account that already says where is not changed. Invented people and wording.
 */
const FLAG = "ISSUE_KEEPS_WORK_AREA_ENABLED";
const REPORT = "QA, 13 Nov 2026 (ISSUE_KEEPS_WORK_AREA; from the sibling app's 38d live check; invented wording)";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
  t.directory([...STAFF]);
  t.as("location_manager", { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] });
  return t.thread();
}

const issueLine = (content: string) => /\*\*Issue:\*\*[^\n]*/.exec(content)?.[0] ?? "";

const OPEN: readonly { key: string; turn: string; issue: RegExp }[] = [
  {
    key: "front-desk",
    turn: "create a ca for remy calder at the front desk, she was rude to a guest",
    issue: /\*\*Issue:\*\* she was rude to a guest at the front desk\b/i,
  },
  {
    key: "register",
    turn: "create a ca for rowan kestrel at the register, he was on his phone with a line of guests",
    issue: /\*\*Issue:\*\* he was on his phone with a line of guests at the register\b/i,
  },
];

export const NOV13_ISSUE_KEEPS_WORK_AREA_CASES: ReplayCase[] = OPEN.map((wording) => ({
  id: `nov13-issue-keeps-work-area-${wording.key}`,
  title: `"${wording.turn}" — the card's Issue keeps where it happened`,
  report: REPORT,
  status: { open: "the Issue line is only the account; the work area said with the person is lost" },
  fixFlags: [FLAG],
  async run(t: ReplayContext) {
    const thread = start(t);
    const reply = (await thread.say(wording.turn)).content;
    expect(issueLine(reply), `the Issue line:\n${reply}`).toMatch(wording.issue);
  },
}));

/** Guards, flag off and on: a store is not kept, and an account that already says where is unchanged. */
export const NOV13_ISSUE_KEEPS_WORK_AREA_GUARDS: ReplayCase[] = [
  {
    id: "nov13-issue-keeps-work-area-guard-already-said",
    title: `"create a ca for remy calder at the front desk, she was rude to a guest at the front desk" — said once on the Issue`,
    report: REPORT,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t: ReplayContext) {
      const thread = start(t);
      const reply = (await thread.say("create a ca for remy calder at the front desk, she was rude to a guest at the front desk")).content;
      const line = issueLine(reply);
      expect(line, `the Issue line:\n${reply}`).toMatch(/she was rude to a guest at the front desk/i);
      expect(line.match(/front desk/gi)?.length ?? 0, `the work area is said twice:\n${line}`).toBe(1);
    },
  },
  {
    id: "nov13-issue-keeps-work-area-guard-account-in-request",
    title: `"ca for remy calder for being rude at the front desk" — the request's own account is the Issue, as before`,
    report: REPORT,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t: ReplayContext) {
      const thread = start(t);
      const reply = (await thread.say("create a ca for remy calder for being rude to a guest at the front desk")).content;
      expect(issueLine(reply), `the Issue line:\n${reply}`).toMatch(/being rude to a guest at the front desk/i);
      expect(issueLine(reply), `the work area is said twice:\n${reply}`).not.toMatch(/front desk.*front desk/i);
    },
  },
  {
    id: "nov13-issue-keeps-work-area-guard-account-names-another-area",
    title: `"create a ca for remy calder at the register, she was rude to a guest at the front desk" — no second work area`,
    report: `${REPORT}; Gate-Bubbles' #880 probe`,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t: ReplayContext) {
      const thread = start(t);
      const reply = (await thread.say("create a ca for remy calder at the register, she was rude to a guest at the front desk")).content;
      expect(issueLine(reply), `the Issue line:\n${reply}`).toMatch(/\*\*Issue:\*\* she was rude to a guest at the front desk\s*(?:·|$)/i);
      expect(issueLine(reply), `a second work area was added:\n${reply}`).not.toMatch(/register/i);
    },
  },
  {
    id: "nov13-issue-keeps-work-area-guard-store-left-off",
    title: `"create a ca for remy calder at west dodge, she was rude to a guest" — a store is not a work area; the Issue is the account`,
    report: REPORT,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t: ReplayContext) {
      const thread = start(t);
      const reply = (await thread.say("create a ca for remy calder at west dodge, she was rude to a guest")).content;
      expect(issueLine(reply), `the Issue line:\n${reply}`).toMatch(/\*\*Issue:\*\* she was rude to a guest\s*(?:·|$)/i);
    },
  },
];
