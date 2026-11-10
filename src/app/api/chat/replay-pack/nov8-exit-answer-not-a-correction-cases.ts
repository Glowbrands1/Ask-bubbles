import { expect, vi } from "vitest";

import { STAFF, TWO_STORES, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A LATER TURN OF THE SAME EXIT REQUEST NEVER DROPS WHAT TURN 1 STATED (QA, the Bubbles live tester, 8 Nov 2026;
 * pre-existing; EXIT_ANSWER_NOT_A_CORRECTION_ENABLED)
 * ============================================================================
 *
 * A district manager's six-turn exit chat (6872309a), replayed word for word (the person and her address invented). Turn 1 filled
 * the address, last day worked, store items, store key, wage/bonus and not-eligible-for-rehire; from turn 2 ("<C> told
 * management … she quit effective immediately due to personal reasons.") every one of them was "Left blank for you to
 * review", and "create exit for <C>" lost the Resignation Details too. Turn 1's "not returned" and "not eligible" were
 * read as names negated, so the turn counted as a correction naming other people, and it was cut from this form's
 * turns. Identical before and after round 5.
 */
const TURNS = [
  "create an exit for marnie holloway, assistant store manager at lees summit, mo. last day worked 10-26-26. store items not returned and $25 will be payroll deducted for store key. immediate voluntary term, no notice given. payroll deduct applies. drop wage and forfeit bonus. not eligible for rehire. marnie's address is 48 Ne Briar Hollow Lane, lees summit, MO. 64064",
  "marnie told management on 10-26-26 that she quit effective immediately due to personal reasons.",
  "exit is for marnie holloway",
  "create exit for marnie holloway",
  "resignation date 10-26-2026. how employee resigned - Marnie told management she quit effective immediately on 10-26-2026. Reason for resignation - Marnie quit due to personal family issues.",
  "how employee resigned - told management",
] as const;
const STATED = ["Permanent Address", "Last Day Worked", "Store Items Returned", "Store Key Returned", "Minimum Wage / Bonus Forfeiture", "Eligible for Rehire"];
const blank = (content: string) => content.split("\n").find((line) => line.startsWith("**Left blank for you to review:**")) ?? "";

export const NOV8_EXIT_ANSWER_NOT_A_CORRECTION_CASES: ReplayCase[] = [
  {
    id: "nov8-exit-answer-not-a-correction",
    title: "a six-turn exit chat: every later card keeps every fact turn 1 stated (address, last day, items, key, wage/bonus, rehire)",
    report: "QA, the Bubbles live tester, 8 Nov 2026 (a district manager's chat, replayed): turn 1's facts dropped from turn 2 on",
    status: { open: "from turn 2, Permanent Address, Last Day Worked, Store Items/Key, Wage/Bonus and Rehire are \"Left blank for you to review\"" },
    fixFlags: ["EXIT_ANSWER_NOT_A_CORRECTION_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-08T15:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", TWO_STORES);
      const thread = t.thread();
      for (const [index, said] of TURNS.entries()) {
        const { content } = await thread.say(said);
        // Turns 5-6 (field-label edits) are answered as a policy question with no card, in both apps: a separate item.
        if (!blank(content)) continue;
        for (const field of STATED) expect(blank(content), `turn ${index + 1} drops ${field}:\n${content}`).not.toContain(field);
        if (index === 3) expect(blank(content), `"create exit for …" drops the Resignation Details:\n${content}`).not.toMatch(/Resignation Details/);
      }
    },
  },
];
