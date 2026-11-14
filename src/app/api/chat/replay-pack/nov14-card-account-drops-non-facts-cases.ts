import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * THE CARD'S ISSUE IS EVERY FACT SHE GAVE, AND NO HEDGE (CARD_ACCOUNT_DROPS_NON_FACTS_ENABLED)
 * ============================================================================
 *
 * QA, tonight's Bubbles live chat on 17w (14 Nov 2026), in the manager's words; the person is the pack's invented one:
 *   t1 "<A> was late on 11/3/26"                          → no card; the reply offers Coaching vs Corrective Action
 *   t2 "she yelled at a customer and she maybe forgot"    → no card; the reply asks "forgot what, exactly?"
 *   t3 "corrective action form"                           → the first card
 * The card's Issue was "she yelled at a customer and she maybe forgot": the t1 lateness was dropped and the hedge kept,
 * while the card's date and Attendance policy came from t1. The card check did not apply (no card was open before t3), so
 * this is the card's own building, pre-existing, not a 17w regression. Expected: "<A> was late on 11/3/26; she yelled at
 * a customer", no hedge.
 */

const T1 = "Marnie Holloway was late on 11/3/26";
const T2 = "she yelled at a customer and she maybe forgot";
const T3 = "corrective action form";
const REPORT = "QA, Bubbles 17w live chat (14 Nov 2026): the card's Issue was \"she yelled at a customer and she maybe forgot\"; the lateness was dropped and the hedge kept";
const FLAG = "CARD_ACCOUNT_DROPS_NON_FACTS_ENABLED";

export const NOV14_CARD_ACCOUNT_DROPS_NON_FACTS_CASES: ReplayCase[] = [
  {
    id: "nov14-card-account-three-turns-both-facts-no-hedge",
    title: `"${T1}" → "${T2}" → "${T3}": the card's Issue holds both facts, the lateness first, and no hedge`,
    report: REPORT,
    status: { open: "the Issue is \"she yelled at a customer and she maybe forgot\": the lateness dropped, the hedge kept" },
    fixFlags: [FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-13T16:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say(T1);
      await thread.say(T2);
      const reply = await thread.say(T3);
      const issue = String((thread.proposal as Record<string, unknown> | null)?.issue ?? "");
      expect(issue, `no card, or no Issue:\n${reply.content}`).not.toBe("");
      expect(issue, `the lateness was dropped:\n${reply.content}`).toMatch(/late on 11\/3\/26/i);
      expect(issue, `the customer was dropped:\n${reply.content}`).toMatch(/yelled at a customer/i);
      expect(issue, "the hedge is on the card").not.toMatch(/maybe|forgot/i);
      expect(issue.search(/late on/i), "the lateness comes first, as she said it").toBeLessThan(issue.search(/yelled/i));
      expect(issue, "QA's expected Issue").toBe("Marnie Holloway was late on 11/3/26; she yelled at a customer");
    },
  },
];
