import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * "PAYROLL IS DEDUCTABLE" IS THE MANAGER'S YES (ported from the sibling app's QA history, 25 Oct 2026; PR #140
 * rebuilt on main in QA's stale-PR cleanup, 11 Nov 2026; PAYROLL_DEDUCTIBLE_WORD_ENABLED)
 * ============================================================================
 *
 * QA's words, the person invented (Rowan Kestrel, on this store's directory, for QA's "Test Employee"). After "payroll
 * is deductable" (their spelling) the card kept asking "Is payroll deduct applicable?", and Create left the Payroll
 * Deduct box blank.
 */
const REQUEST = "create a corrective action form for Rowan Kestrel, she was caught vaping, verbal warning";
const ANSWER = "payroll is deductable";

export const NOV11_PAYROLL_DEDUCTIBLE_WORD_CASES: ReplayCase[] = [
  {
    id: "nov11-payroll-deductible-word-yes",
    title: "a vaping Corrective Action, then \"payroll is deductable\": the card stops asking the payroll question and Create ticks Payroll Deduct Yes",
    report:
      "QA, 25 Oct 2026 (the sibling app's history, ported in PR #140): \"payroll is deductable\" was read as nothing, and \"Is payroll deduct applicable?\" was asked on every later turn",
    status: { open: "\"payroll is deductable\" is read as nothing: the card still asks \"Is payroll deduct applicable?\"" },
    fixFlags: ["PAYROLL_DEDUCTIBLE_WORD_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const first = await thread.say(REQUEST);
      expect(thread.proposal, `no Corrective Action card:\n${first.content}`).toMatchObject({ templateKey: "dpoa" });
      const reply = await thread.say(ANSWER);
      expect(thread.proposal, `the card was lost:\n${reply.content}`).toMatchObject({ templateKey: "dpoa" });
      expect(reply.content, `the card asks the payroll question the manager answered:\n${reply.content}`).not.toMatch(/\*\*Is payroll deduct applicable\?\*\* Yes or No\?/i);
      expect(reply.content, `the card does not carry the manager's Yes:\n${reply.content}`).toMatch(/Is payroll deduct applicable\? \*\*Yes\*\*/i);
      const id = await thread.create();
      expect(t.checked(id).payroll_deduct ?? [], "Payroll Deduct is not Yes").toEqual(["yes"]);
    },
  },
];
