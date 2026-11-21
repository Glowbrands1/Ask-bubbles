import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * A CLOSE SPELLING OF A STAFF MEMBER IS OFFERED, NEVER KEPT AS TYPED (QA's Bubbles round 2, 22 Nov 2026, HIGH)
 * ============================================================================
 *
 * The managers' words (each real name rewritten to one invented name on the staff list at the manager's store): U34
 * "create a ca form for <P13-first> Garica" (Woven: "… Garcia"), U35 T2 "<P13-first> Rameirz", U25 T2 "<P9-first>
 * Sheirs" — each answered "isn't on your store's Woven staff list, so I've used the name as you typed it", and the card
 * and saved draft carried the typo. Pau's rule: a staff match is taken only on the manager's exact words or her "yes" to
 * "Did you mean <name>?" (which also offers keeping it as typed). Two swapped letters ("Garica", "Perwitt") are one
 * slip, not two.
 */

const REPORT = "QA's Bubbles round 2 (22 Nov 2026, U25/U34/U35): a one-slip misspelling of a staff member at the same store was kept as typed, never offered";
const LETTERS_SWAPPED = "create a ca form for Fenna Perwitt";

export const NOV22_AGENT_LOOP_NEAR_MISS_OFFERED_CASES: ReplayCase[] = [
  {
    id: "nov22-r2-near-miss-swapped-letters-offered",
    title: "U34: \"create a ca form for <P13-first> Garica\" (two letters swapped in the staff list's surname): \"Did you mean <name>?\" is asked; no card for the name as typed",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as("location_manager", WEST_DODGE);
      const model = loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form") as { card?: unknown; ask_exactly?: string; did_you_mean?: unknown; not_on_roster?: string } | null;
        if (result) return { text: result.ask_exactly ?? (result.card ? "Here's the Corrective Action Form for **Fenna Perwitt**. Fenna Perwitt isn't on your store's Woven staff list, so I've used the name as you typed it." : JSON.stringify(result).slice(0, 300)) };
        return { tool: "propose_form", input: { template_key: "dpoa", employee_name: "Fenna Perwitt", what_happened: "Fenna Perwitt was late on 11/18.", incident_date: "2026-11-18", policy: headingWith(view, /^attendance/i), person_evidence: evidenceFrom(view, "Fenna Perwitt") } };
      });
      t.loopModel!(model);
      const thread = t.thread();
      const reply = await thread.say(LETTERS_SWAPPED);
      expect(thread.proposal?.employeeName ?? null, `a card was made for the name as typed:\n${reply.content}`).not.toBe("Fenna Perwitt");
      expect(reply.content, `no Did-you-mean:\n${reply.content}`).toMatch(/Did you mean \*\*Fenna Prewitt\*\*/);
    },
  },
];
