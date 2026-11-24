import { expect, vi } from "vitest";

import { TWO_STORES, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";
import { TAMSIN, U23_TURNS } from "./nov22-agent-loop-u23-tamsin-chat-cases";

/**
 * ============================================================================
 * U23, ROUND 3: THE SAVED OBSERVATION KEEPS THE OTHER EMPLOYEE'S "THEY" (QA's live round-3 re-run, 22 Nov 2026)
 * ============================================================================
 *
 * The tester's chat verbatim (invented: Woven legal Odessa, preferred Tamsin, Brookfield; admin, global). The chat and
 * the card kept "she asked another employee what they would do if they had 8 arms and 8 legs" (e5e7a97), but the
 * Observation written at Create read "what Tamsin would do if Tamsin had 8 arms": Create's pronoun pass
 * (`first-name-write-up.ts`) got no manager words, so it never knew the manager calls Tamsin "she". Now it reads the
 * same words the card pass reads. With AGENT_LOOP_LIVE=1 the real model plays every turn.
 */

const REPORT = "QA's live round-3 re-run (22 Nov 2026, U23): the saved Observation read \"what <P> would do if <P> had 8 arms\"; the card kept \"they\"";
const ADMIN = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").length;

export const NOV22_AGENT_LOOP_U23_SAVED_THEY_CASES: ReplayCase[] = [
  {
    id: "nov22-u23-saved-observation-keeps-they",
    title: "U23 round 3 verbatim (T1–T7, admin): Create's saved Observation keeps \"what they would do if they had 8 arms\" (the other employee), as the card does; never \"what Tamsin would do\"",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T15:53:00Z"));
      t.directory([...LOOP_STAFF, TAMSIN]);
      t.as("admin", ADMIN);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const turn = users(view);
        const result = lastResult(view, "propose_form") as { card?: { observation?: string | null } } | null;
        if (result?.card) return { text: `Here's the Corrective Action Form for **Tamsin**.\n\n**Observation of Offense:** ${result.card.observation ?? ""}` };
        if (result) return { text: "Noted." };
        if (turn === 1) return { tool: "propose_form", input: { template_key: "dpoa", employee_name: "Tamsin Brookfield", person_evidence: evidenceFrom(view, "Tamsin Brookfield") } };
        if (turn === 4 || turn === 7) return { text: "Go ahead." };
        const said = view.turns.filter((entry) => entry.role === "user").slice(1, turn).map((entry) => entry.text).filter((text) => !/written warning|give you examples/i.test(text));
        return { tool: "propose_form", input: { template_key: "dpoa", employee_name: "Tamsin Brookfield", person_evidence: evidenceFrom(view, "Tamsin Brookfield", turn - 1), what_happened: said.join(" "), policy: "Standards of Conduct", warning_level: turn >= 3 ? "written" : undefined } };
      }));
      const thread = t.thread();
      for (const said of U23_TURNS) await thread.say(said);
      const issue = String((thread.proposal as { issue?: string } | null)?.issue ?? "");
      expect(issue, issue).toMatch(/what they would do if they had 8 arms/);
      /* Create: the drafter writes the account as the live one did, the other employee's "they" kept. */
      t.draftWrites({ observation: "Observed:\nOn multiple occasions, Tamsin engaged in personal conversations with customers about her boyfriend or ex-boyfriend. She has also told customers about taking medication for different things, including stating that she was sick. On November 22, 2026, while checking out a customer, Tamsin asked another employee what they would do if they had 8 arms and 8 legs, and the customer appeared very uncomfortable.\n\nExpectation:\nTamsin is expected to keep conversations with guests professional." });
      const id = await thread.create();
      const observation = t.values(id).observation ?? "";
      expect(observation, `the saved Observation made the other employee's "they" the card's person:\n${observation}`).not.toMatch(/what (?:Tamsin|Odessa)(?: Brookfield)? would do|if (?:Tamsin|Odessa)(?: Brookfield)? had 8 arms/);
      expect(observation, observation).toMatch(/what they would do if they had 8 arms/);
      expect(observation, observation).not.toMatch(/\bOdessa\b/);
    },
  },
];
