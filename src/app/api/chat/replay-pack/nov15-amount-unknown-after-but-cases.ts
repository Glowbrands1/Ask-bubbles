import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * Ported from the sibling app (QA, batch J, 15 Nov 2026): its live re-run's "yes payroll but I don't know the amount"
 * was asked for the figure. The shared reader (`saysAmountUnknown`) reads the clause after "but", a comma or a
 * semicolon; the card answers its own amount question with the acknowledgement. People are STAFF's invented ones.
 */
function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-11T16:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV15_AMOUNT_UNKNOWN_AFTER_BUT_CASES: ReplayCase[] = [
  {
    id: "nov15-amount-unknown-after-but",
    title: "\"yes payroll but I don't know the amount\" is payroll Yes with the amount left blank, never asked for; \"yes payroll but only for the shift\" is not an unknown amount",
    report: "QA, 15 Nov 2026 (the sibling app's batch J): fix the shared reader in both apps",
    status: "fixed",
    fixFlags: ["AMOUNT_UNKNOWN_ACK_ENABLED"],
    async run(t) {
      const thread = start(t);
      await thread.say("verbal ca for remy calder, she was 20 minutes late on 11/9/26");
      const reply = await thread.say("yes payroll but I don't know the amount");
      expect(reply.content, "the amount was not acknowledged as unknown").toContain("Noted — I'll leave the **Payroll deduction amount** blank for you to fill on the form once you know it.");
      expect(reply.content, "the amount was asked for after the manager said it is not known").not.toContain("One more question: **Payroll deduction amount?**");

      // A clause after "but" that is not about the amount is no unknown amount.
      const other = start(t);
      await other.say("verbal ca for remy calder, she was 20 minutes late on 11/9/26");
      const asked = await other.say("yes payroll but only for the shift");
      expect(asked.content).not.toContain("I'll leave the **Payroll deduction amount** blank");
    },
  },
  {
    id: "nov15-amount-unknown-of-something-else",
    title: "an unknown amount of time, of a drawer shortage or of a total is never the payroll amount; the amount question stays",
    report: "Ported from the sibling app (QA's review of its batch J salvage, 15 Nov 2026): the reader read any clause, so these replaced the payroll amount question with the acknowledgement",
    status: "fixed",
    fixFlags: ["AMOUNT_UNKNOWN_ACK_ENABLED"],
    async run(t) {
      for (const said of ["she was late, but I don't know the amount of time", "she was short on the drawer, not sure of the amount", "verbal for Remy, she was $40 short, idk the total"]) {
        const thread = start(t);
        await thread.say("verbal ca for remy calder, she was 20 minutes late on 11/9/26");
        await thread.say("yes payroll");
        const reply = await thread.say(said);
        expect(reply.content, `"${said}" was read as the payroll amount`).not.toContain("I'll leave the **Payroll deduction amount** blank");
      }
    },
  },
];
