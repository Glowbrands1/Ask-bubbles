import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * THE STORE PHRASE LEAVES THE ACCOUNT WITH ITS OWN PLACE WORD (port of the sibling app's QA live R13 on its main, 22 Nov 2026)
 * ============================================================================
 *
 * R13's manager turn, word for word (QA's test name, on no directory): "create a verbal CA for team member Testy Testerson
 * at Dodge, NE. location. On 10-16-26 Testy was not properly measuring and weighing product. …". In the sibling app the
 * live model wrote the account with the phrase after the date or first, and the card kept "On 10/16/26 location, Testy …"
 * or "Location, on …": the phrase and its state left, the place word that closed it stayed. This app has the same
 * `withoutNamedSalon` code. Mechanism: words after the state, up to the phrase's own comma or full stop, that are all
 * words of the phrase (the store's name or the place words the phrase is already read with) leave with it.
 */

const REPORT = "Sibling app's QA live R13 on its main (22 Nov 2026): the Observation read \"On 10/16/26 location, …\" / \"Location, on …\"";
const T1 = "create a verbal CA for team member Testy Testerson at Dodge, NE. location. On 10-16-26 Testy was not properly measuring and weighing product. payroll deduct is not applicable";
/** The live model's accounts: the phrase after the date, the phrase first, and as the manager typed it. */
const LIVE_ACCOUNTS = [
  "On 10/16/26 at Dodge, NE location, Testy was not properly measuring and weighing product.",
  "At Dodge, NE location, on 10/16/26 Testy was not properly measuring and weighing product.",
  "At Dodge, NE. location. On 10/16/26 Testy was not properly measuring and weighing product.",
];

const issueOf = (proposal: unknown) => (proposal as { issue?: string | null } | null)?.issue ?? "";

export const NOV22_AGENT_LOOP_PLACE_WORD_AFTER_STATE_CASES: ReplayCase[] = LIVE_ACCOUNTS.map((account, index): ReplayCase => ({
  id: `nov22-r13-live-place-word-after-state-${index + 1}`,
  title: `R13 (ported): the model's account "${account.slice(0, 40)} …" for "… at Dodge, NE. location. On 10-16-26 …": the Observation is "On 10/16/26 Testy was not properly measuring …", never "Location, on …"`,
  report: REPORT,
  status: "fixed",
  async run(t) {
    /* A stand-in's account: live, the model writes its own (the case's invariants are R13's). */
    if (process.env.AGENT_LOOP_LIVE === "1") return;
    vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
    t.directory([...LOOP_STAFF]);
    t.as("location_manager", WEST_DODGE);
    t.loopModel!(loopStandIn((view): LoopDecision => (lastResult(view, "propose_form")
      ? { text: "Here's the Corrective Action Form for **Testy**." }
      : {
          tool: "propose_form",
          input: {
            template_key: "dpoa",
            employee_name: "Testy Testerson",
            what_happened: account,
            incident_date: "2026-10-16",
            warning_level: "verbal",
            level_evidence: evidenceFrom(view, "create a verbal CA"),
            payroll_deduct: "no",
            payroll_evidence: evidenceFrom(view, "payroll deduct is not applicable"),
            policy: headingWith(view, /standards of conduct/i),
            person_evidence: evidenceFrom(view, "Testy Testerson"),
          },
        })));
    const thread = t.thread();
    await thread.say(T1);
    expect(thread.proposal?.locationId, "the case proves nothing: the card is not filed at the store the manager named").toBe("loc-264");
    expect(issueOf(thread.proposal), "a word of the store phrase stayed in the Observation").not.toMatch(/^Location|\blocation\b|\bNE\b|Dodge/i);
    expect(issueOf(thread.proposal)).toBe("On 10/16/26 Testy was not properly measuring and weighing product.");
  },
}));
