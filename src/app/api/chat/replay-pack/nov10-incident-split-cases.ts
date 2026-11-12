import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * THE ISSUE IS THE REQUEST'S ACCOUNT IN WHOLE SENTENCES (QA, 25 Oct 2026; QA's October triage of #189, 10 Nov 2026)
 * ============================================================================
 *
 * Production, plain path: "Hi, I need a verbal corrective action for <A>, she is a team member at our Dodge, NE store.
 * On 10-1-26 she opened the store late. She did not call ahead." made the card's Issue "she is a team member at our
 * Dodge"; "… she works at our Dodge, NE store as a team member and was late today." made it "she works at our Dodge";
 * "create verbal CA for <A> for violating visitors at work policy on 10-10-26. <A> spent 40 minutes talking with friend
 * and ignoring guests." kept only the first sentence; a later "Policy violated: Standards of Conduct" replaced the
 * account. INCIDENT_SPLIT_FIX_ENABLED (`forms/incident-issue.ts`, `splitFixedIssue`). QA's wording; the pack's people.
 */
const FIX = ["INCIDENT_SPLIT_FIX_ENABLED"];
const REPORT =
  "QA, 25 Oct 2026 (production): \"Hi, I need a verbal corrective action for <A>, she is a team member at our Dodge, NE store. On 10-1-26 she opened the store late. She did not call ahead.\" gave the Issue \"she is a team member at our Dodge\"";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-10-25T16:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

function issueOf(proposal: unknown): string {
  return (proposal as { issue?: string | null } | null)?.issue ?? "";
}

export const NOV10_INCIDENT_SPLIT_CASES: ReplayCase[] = [
  {
    id: "nov10-incident-split-dodge-ne-team-member",
    title: "\"…, she is a team member at our Dodge, NE store. On 10-1-26 she opened the store late. She did not call ahead.\": the Issue is what she did, never where she works",
    report: REPORT,
    status: { open: "Issue: she is a team member at our Dodge" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const { content } = await thread.say(
        "Hi, I need a verbal corrective action for Marnie Holloway, she is a team member at our Dodge, NE store. On 10-1-26 she opened the store late. She did not call ahead.",
      );
      const issue = issueOf(thread.proposal);
      expect(thread.proposal?.employeeName ?? null, content).toBe("Marnie Holloway");
      expect(issue, `the Issue is where she works:\n${content}`).not.toMatch(/team member|Dodge/i);
      expect(issue, `the Issue is not the account:\n${content}`).toMatch(/On 10-1-26 she opened the store late\. She did not call ahead/);
    },
  },
  {
    id: "nov10-incident-split-dodge-ne-works-as",
    title: "\"…, she works at our Dodge, NE store as a team member and was late today.\": the Issue is \"was late today\"",
    report: "QA, 25 Oct 2026 (production): \"Please create a corrective action form for <A>, she works at our Dodge, NE store as a team member and was late today.\" gave the Issue \"she works at our Dodge\"",
    status: { open: "Issue: she works at our Dodge" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const { content } = await thread.say(
        "Please create a corrective action form for Marnie Holloway, she works at our Dodge, NE store as a team member and was late today.",
      );
      const issue = issueOf(thread.proposal);
      expect(issue, `the Issue is where she works:\n${content}`).not.toMatch(/works at|Dodge|team member/i);
      expect(issue, `the Issue is not the account:\n${content}`).toMatch(/was late today/);
    },
  },
  {
    id: "nov10-incident-split-second-sentence",
    title: "\"… for violating visitors at work policy on 10-10-26. Remy spent 40 minutes talking with friend …\": both sentences are the Issue",
    report: "QA, 25 Oct 2026 (production): \"create verbal CA for <A> for violating visitors at work policy on 10-10-26. <A> spent 40 minutes talking with friend and ignoring guests.\" kept only the first sentence",
    status: { open: "Issue: violating visitors at work policy on 10-10-26 (the second sentence dropped)" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const { content } = await thread.say(
        "create verbal CA for Remy Calder for violating visitors at work policy on 10-10-26. Remy spent 40 minutes talking with friend and ignoring guests.",
      );
      const issue = issueOf(thread.proposal);
      expect(issue, `the Issue:\n${content}`).toMatch(/visitors at work policy on 10-10-26/);
      expect(issue, `the second sentence is dropped:\n${content}`).toMatch(/spent 40 minutes talking with friend and ignoring guests/);
    },
  },
  {
    id: "nov10-incident-split-policy-line-later",
    title: "a later \"Policy violated: Standards of Conduct\" does not replace the account",
    report: "QA, 25 Oct 2026 (production): a later \"Policy violated: Standards of Conduct\" became the Issue",
    status: { open: "Issue: Policy violated: Standards of Conduct" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say("create a ca for Rowan Kestrel. on 10-21-26 rowan opened the store 20 minutes late.");
      const { content } = await thread.say("Policy violated: Standards of Conduct");
      const issue = issueOf(thread.proposal);
      expect(issue, `the policy line is the Issue:\n${content}`).not.toMatch(/Policy violated|Standards of Conduct/i);
      expect(issue, `the account is lost:\n${content}`).toMatch(/opened the store 20 minutes late/);
    },
  },
];
