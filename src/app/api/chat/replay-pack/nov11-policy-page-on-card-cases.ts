import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * THE CARD'S POLICY LINE CARRIES ITS PRINTED PAGE (QA, 25 Oct 2026, replay items S4, S7, S22, S24, B1, B5, B7, H13;
 * PR #136 rebuilt on main in QA's stale-PR cleanup, 11 Nov 2026; POLICY_PAGE_ON_CARD_ENABLED)
 * ============================================================================
 *
 * The Corrective Action card printed "**Policy:** Standards of Conduct" with no page (the JBA Policy Manual prints it
 * on p.12), and Late Opening without p.15. QA's words; "Test Employee" (QA's test login, not a person) is an invented
 * team member on this store's directory.
 */
const STANDARDS =
  "create corrective action for Marnie Holloway for violating standards of conduct policy on 10-20-26. Marnie failed to acknowledge policies in woven by the 10-15-26 deadline.";
const LATE_OPENING =
  "create verbal ca for Marnie Holloway for opening store late on 10-1-26. previous coaching is jba policy manual 1-1-26. payroll deduct DOES apply and state $25 will be payroll deducted";

function policyLine(content: string): string {
  return content.split("\n").find((line) => /\*\*Policy:\*\*/.test(line)) ?? "";
}

export const NOV11_POLICY_PAGE_ON_CARD_CASES: ReplayCase[] = [
  {
    id: "nov11-policy-page-on-card-standards-of-conduct",
    title: "a Standards of Conduct Corrective Action card: the policy line says p.12",
    report:
      "QA, 25 Oct 2026 (S4, S7, S22, S24, B1, B5, B7, H13): the CA and coaching card printed \"Policy: Standards of Conduct\" with no page (should be p.12)",
    status: { open: "**Policy:** Standards of Conduct, with no page" },
    fixFlags: ["POLICY_PAGE_ON_CARD_ENABLED"],
    fixStatus: { open: "POLICY_PAGE_ON_CARD_ENABLED's lines in src/lib/ai/server-ask.ts await Coding-2" },
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say(STANDARDS, { employeeName: "Marnie Holloway" });
      expect(thread.proposal, `no Corrective Action card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa" });
      const line = policyLine(reply.content);
      expect(line, `the card names no Standards of Conduct policy:\n${reply.content}`).toMatch(/Standards of Conduct/);
      expect(line, `the policy line has no printed page:\n${line}`).toMatch(/Standards of Conduct[^\n]*\bp\.\s?12\b/);
    },
  },
  {
    id: "nov11-policy-page-on-card-late-opening",
    title: "a late-opening Corrective Action card: the policy line says p.15",
    report: "QA, 25 Oct 2026 (same replay items): Late Opening was printed on the card without p.15",
    // Fixed on main another way (11 Nov 2026): the card already says "the policy manual's section on page 15".
    status: "fixed",
    fixFlags: ["POLICY_PAGE_ON_CARD_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say(LATE_OPENING, { employeeName: "Marnie Holloway" });
      expect(thread.proposal, `no Corrective Action card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa" });
      const line = policyLine(reply.content);
      expect(line, `the card names no Late Opening policy:\n${reply.content}`).toMatch(/Late Opening/i);
      expect(line, `the policy line has no printed page:\n${line}`).toMatch(/Late Opening[^\n]*\b(?:p\.\s?|page )15\b/i);
    },
  },
];
