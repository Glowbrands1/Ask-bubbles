import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * "WRITE UP <EMPLOYEE> FOR …": THE ISSUE IS THE ACCOUNT, NOT THE MESSAGE (ported from the sibling app: QA's October
 * triage of its #167, 10 Nov 2026; WRITE_UP_LEAD_NOT_ACCOUNT_ENABLED)
 * ============================================================================
 *
 * #167's wording, "write up <employee> for cell phone use" (the person here is from the pack's STAFF list): with
 * production's flags the Corrective Action card's Issue was the whole message. It should be the account, "Cell phone
 * use", without "write up" and the employee's name.
 */
export const NOV10_WRITE_UP_OBSERVATION_CASES: ReplayCase[] = [
  {
    id: "nov10-write-up-observation-167",
    title: "\"write up Marnie Holloway for cell phone use\": the Issue is \"Cell phone use\", not the message",
    report: "the sibling app's #167 (QA's October triage, 10 Nov 2026): \"write up <employee> for cell phone use\" gave the Issue \"write up <employee> for cell phone use\"",
    status: { open: "Issue: \"write up Marnie Holloway for cell phone use\"" },
    fixFlags: ["WRITE_UP_LEAD_NOT_ACCOUNT_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const reply = await t.thread().say("write up Marnie Holloway for cell phone use");
      expect(reply.formProposal, `no Corrective Action card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Marnie Holloway" });
      const issue = (reply.formProposal as { issue?: string | null } | null | undefined)?.issue ?? "";
      expect(issue, `the Issue is the request:\n${reply.content}`).not.toMatch(/\bwrite\s+up\b|\bMarnie\b|\bHolloway\b/i);
      expect(issue, `the Issue lost the account:\n${reply.content}`).toMatch(/^cell phone use\.?$/i);
    },
  },
];
