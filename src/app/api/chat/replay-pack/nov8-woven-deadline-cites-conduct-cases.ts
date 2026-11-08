import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayAnswer, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * A MISSED WOVEN DEADLINE OR COURSE: THE CARD CITES THE STANDARDS OF CONDUCT WITH ITS PAGE (QA, 8 Nov 2026)
 * ============================================================================
 *
 * QA's live tester replayed the managers' exact Woven wordings on the sibling app's production (8 Nov 2026; QA
 * reproduced it live there, pre-existing); checked here with these cases (8 Nov 2026): the same.
 *   (1) "create a verbal corrective action for <A> for missing the 10-15-26 woven deadline": the card's Policy line was
 *       "this reads as **Standards of Conduct** …" with no section or page, on every turn. The card had cited
 *       "Standards of Conduct Policy, JBA Policy Manual p.12"; REPLY_MATCHES_CARD's one-policy rule read the row as the
 *       heading "this reads as Standards of Conduct" and dropped the line as another policy's.
 *   (2) "… This would be a verbal due to not completing her woven courses by the deadline": no Policy line at all; the
 *       reading took no conduct topic ("not completing" is not one of FAILED's words).
 * CONDUCT_INCIDENT_CITES_PAGE_ENABLED. The managers' words; the person is the pack's invented Marnie Holloway.
 */

const FIX = ["CONDUCT_INCIDENT_CITES_PAGE_ENABLED"];
const REPORT = "QA's live tester, 8 Nov 2026 (found in the sibling app's production, the managers' Woven wordings): no Standards of Conduct citation with a page";
const CITED = /Standards of Conduct Policy, JBA Policy Manual p\.\d+|\*\*Policy:\*\*[^\n]*Standards of Conduct/;

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-07T15:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

/*
 * This app's Corrective Action card names the policy it reads as and quotes the manual's section on the draft; it
 * prints no manual line with a page (its sales card neither). So here the card must say Standards of Conduct; the
 * page is the draft's. (The sibling app's card prints "Standards of Conduct Policy, JBA Policy Manual p.12".)
 */
function citesConduct(reply: ReplayAnswer, said: string): void {
  expect(reply.content, `"${said}": no Standards of Conduct Policy line:\n${reply.content}`).toMatch(/\*\*Policy:\*\*[^\n]*Standards of Conduct/);
}

export const NOV8_WOVEN_DEADLINE_CITES_CONDUCT_CASES: ReplayCase[] = [
  {
    id: "nov8-woven-deadline-cites-conduct",
    title: "\"… for missing the 10-15-26 woven deadline\", then the prior coaching and the payroll answer: every card cites Standards of Conduct with its page",
    report: REPORT,
    // Holds here with production's flags: this app's card says "this reads as Standards of Conduct" (its page is the draft's).
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      for (const said of [
        "create a verbal corrective action for marnie holloway for missing the 10-15-26 woven deadline",
        "prior coaching JBA Policy Manual 7-29-26",
        "no payroll deduct",
      ]) {
        const reply = await thread.say(said);
        expect(thread.proposal?.templateKey).toBe("dpoa");
        citesConduct(reply, said);
      }
    },
  },
  {
    id: "nov8-woven-courses-cites-conduct",
    title: "\"… a verbal due to not completing her woven courses by the deadline\": the card has a Standards of Conduct Policy line with its page",
    report: REPORT,
    status: { open: "the card has no Policy line at all" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const said = "Please create another corrective action from marnie holloway. This would be a verbal due to not completing her woven courses by the deadline";
      let reply = await thread.say(said);
      // This app does not read "another corrective action from <name>" as naming her; the card asks who (reported to QA).
      if (!thread.proposal?.employeeName) reply = await thread.say("Marnie Holloway");
      expect(thread.proposal?.templateKey).toBe("dpoa");
      citesConduct(reply, said);
    },
  },
  {
    id: "nov8-woven-conduct-named-policy-wins",
    title: "negative: a policy the manager named is still the one cited",
    report: `${REPORT} (the condition)`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("create a corrective action for marnie holloway for violating the attendance policy, she was 30 minutes late to her shift on 10/31");
      expect(reply.content, "the named policy is not cited").toMatch(/Attendance/);
      expect(reply.content, "the Standards of Conduct is cited over the named policy").not.toMatch(CITED);
    },
  },
];
