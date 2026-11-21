import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase } from "./cases";
import { LOOP_OZREN, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * QA'S LIVE RE-TEST B4a (21 Nov 2026, Pau's account, agent loop on, production 3e2c30dd): A NO-SHOW WITHOUT COVERAGE
 * ============================================================================
 *
 * The coaching card cited Standards of Conduct p.12; expected the attendance / shift-coverage section the manager
 * referred to. The live model read "acknowledged the shift coverage policy in Woven" as the rules book's Standards of
 * Conduct line about acknowledgements (assigned in Woven and not done). The fix is the rules book's (an instruction to
 * the model, QA's class): a shift missed without finding coverage is Attendance, the shift replacement section when the
 * manager names that policy, and a policy the employee DID acknowledge is background, never the offense.
 *
 * No live model runs here, so the stand-in plays one that follows the rules book it is given: it cites the heading the
 * book's ruling for a missed shift without coverage names, when the book has that ruling, and otherwise what the live
 * model cited. Everything after (propose_form's checks, the card, Create's saved policy) is the app's own code. QA's
 * wording; invented people: <A> is the pack's Ozren, <B> (whom he messaged) the pack's Thaddea, a third person.
 */
const REPORT = "QA's live re-test (21 Nov 2026, Pau's account, agent loop on, production 3e2c30dd), B4a: the no-show without coverage cited Standards of Conduct p.12";
const SAID =
  "I need to make a coaching form for Ozren. He was scheduled to come in for a shift on 10/28/2026. He messaged Thaddea stating he had a personal event happen and would not be into work. He did not find coverage. He also acknowledged the shift coverage policy in Woven on 10/09/2026.";

/** The heading the rules book's ruling names for a shift missed without coverage, if the book has that ruling. */
function rulingHeading(view: LoopView): string | null {
  const ruling = view.system.split("\n").find((line) => /without finding coverage/i.test(line));
  if (!ruling) return null;
  const headings = (view.system.split("JBA Policy Manual headings")[1] ?? "").split("\n").map((line) => line.replace(/^- /, "").trim()).filter(Boolean);
  return headings.find((heading) => /replacement/i.test(heading) && ruling.includes(heading)) ?? null;
}

export const NOV21_LIVE_RETEST_B4A_SHIFT_COVERAGE_CASES: ReplayCase[] = [
  {
    id: "nov21-live-retest-b4a-no-show-without-coverage-cites-shift-section",
    title: "B4a (item 22): \"… He did not find coverage. He also acknowledged the shift coverage policy in Woven …\" cites the shift replacement section, never Standards of Conduct",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as("location_manager", WEST_DODGE);
      const standIn = loopStandIn((view): LoopDecision => {
        if (lastResult(view, "propose_form")) return { text: "Here's the Coaching Form for **Ozren**." };
        return {
          tool: "propose_form",
          input: {
            template_key: "coaching", employee_id: LOOP_OZREN.id, person_evidence: evidenceFrom(view, "a coaching form for Ozren"),
            policy: rulingHeading(view) ?? "Standards of Conduct",
            what_happened: "Ozren was scheduled to come in for a shift on 10/28/2026. Ozren messaged Thaddea stating he had a personal event happen and would not be into work. Ozren did not find coverage. Ozren also acknowledged the shift coverage policy in Woven on 10/09/2026.",
          },
        };
      });
      t.loopModel!(standIn);
      const thread = t.thread();
      const reply = await thread.say(SAID);
      expect(thread.proposal?.employeeName ?? null, `the card is not Ozren's (Thaddea is the person he messaged):\n${reply.content}`).toBe("Ozren Brack");
      const card = standIn.views.map((view) => lastResult(view, "propose_form")?.card as { policy?: string } | undefined).find(Boolean);
      expect(card?.policy ?? "", `the card's policy: ${JSON.stringify(card)}`).toMatch(/^Shift Replacement\b.*JBA Policy Manual p\.37$/);
    },
  },
];
