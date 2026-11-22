import { expect, vi } from "vitest";

import { TWO_STORES, type DirectoryRow, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * U23, THE TESTER'S CHAT VERBATIM (QA's live round-2 re-run on production f9461c1, 22 Nov 2026)
 * ============================================================================
 *
 * A location manager (Bellevue + Omaha West Dodge). The person, invented by the tester: Woven legal first name Odessa,
 * PREFERRED Tamsin, last Brookfield; the manager types the preferred name. Live, the replies invented two names (a formal
 * one and a short nickname of it, from the rules book's example), and the saved Observation used the legal first name
 * while the card used the preferred one. With AGENT_LOOP_LIVE=1 the real model plays every turn.
 */

export const U23_REPORT = "QA's live round-2 re-run (22 Nov 2026, U23, serious): the replies invented names; the Observation used the legal first name";
export const TAMSIN: DirectoryRow = { id: "e-odessa-brookfield", firstName: "Odessa", lastName: "Brookfield", preferredFirstName: "Tamsin", employmentStatus: "active", locationIds: ["loc-264", "loc-67"], positionName: "Team Member Part Time" };
export const U23_TURNS = [
  "i need to create a corrective action for Tamsin Brookfield",
  "She has unprofessional conversations with guests and staff. I have already had a conversation with her about this.",
  "this is going to be a written warning.",
  "Can i give you examples to put in the form",
  "Multiple times she has talked about her boyfriend or ex boyfriend with customers, she has stated that she takes medication for different things to customers, even stating that she was sick. Today, while checking out a customer, she asked another employee what they would do if they had 8 arms and 8 legs. I could tell the customer was very uncomfortable.",
  "She will also follow customers around the store, constantly bothering them not just about products but about her personal life. Sometimes she will stand behind the makery and talk to them throughout the store.",
  "take what i said but use it in a more professional tone",
] as const;

/** Every name the directory holds for this person, and the other names the manager or the app's own lists use. */
const OWN_WORDS = new Set(["Tamsin", "Odessa", "Brookfield"]);

const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").length;

/** The live model's habit seen in the run: show the card's Observation in the reply, and copy the last reply's text into the next account. */
function liveLikeStandIn() {
  return loopStandIn((view): LoopDecision => {
    const turn = users(view);
    const result = lastResult(view, "propose_form") as { card?: { observation?: string | null }; facts?: { legal_name_in_woven?: { say_exactly?: string } | string } } | null;
    if (result?.card) {
      const legal = result.facts?.legal_name_in_woven;
      const lead = typeof legal === "object" && legal?.say_exactly ? legal.say_exactly : "**Tamsin**";
      return { text: `Here's the Corrective Action Form for ${lead}.\n\n**Observation of Offense:** ${result.card.observation ?? ""}` };
    }
    if (result) return { text: "Noted." };
    if (turn === 1) return { tool: "propose_form", input: { template_key: "dpoa", employee_name: "Tamsin Brookfield", person_evidence: evidenceFrom(view, "Tamsin Brookfield") } };
    if (turn === 4 || turn === 7) return { text: "Go ahead." };
    /* The account so far: the last reply's Observation (as the live model copied it), plus this turn's words. */
    const lastReply = [...view.turns].reverse().find((entry) => entry.role === "assistant")?.text ?? "";
    const shown = /\*\*Observation of Offense:\*\* ([^\n]*)/.exec(lastReply)?.[1] ?? "";
    const said = view.turns.filter((entry) => entry.role === "user").at(-1)!.text;
    return { tool: "propose_form", input: { template_key: "dpoa", employee_name: "Tamsin Brookfield", person_evidence: evidenceFrom(view, "Tamsin Brookfield", turn - 1), what_happened: [shown, said].filter(Boolean).join(" "), policy: "Standards of Conduct", warning_level: turn >= 3 ? "written" : undefined } };
  });
}

export const NOV22_AGENT_LOOP_U23_TAMSIN_CHAT_CASES: ReplayCase[] = [
  {
    id: "nov22-u23-tamsin-chat-no-invented-names",
    title: "U23 verbatim (T1–T7, \"Tamsin Brookfield\", Woven legal first name Odessa): every reply names the person only by a name the directory holds; \"what they would do if they had 8 arms\" keeps \"they\" through T6; the saved Observation says Tamsin, never Odessa",
    report: U23_REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:40:00Z"));
      t.directory([...LOOP_STAFF, TAMSIN]);
      t.as("location_manager", TWO_STORES);
      t.loopModel!(liveLikeStandIn());
      const thread = t.thread();
      const replies: string[] = [];
      for (const said of U23_TURNS) replies.push((await thread.say(said)).content);
      const all = replies.join("\n---\n");
      /* A capitalized word right before "Brookfield", or in "<Name> note", "(<Name> —", is a name for this person: one the directory holds. */
      const named = [...all.matchAll(/\b(\p{Lu}\p{Ll}+)\s+Brookfield\b|\((\p{Lu}\p{Ll}+)\s+(?:—|-|in\b)|\b(\p{Lu}\p{Ll}+)\s+note\b/gu)].map((match) => match[1] ?? match[2] ?? match[3]!);
      for (const name of named) expect(OWN_WORDS.has(name) ? name : `${name} (invented)`, `a name the directory does not hold:\n${all}`).toBe(name);
      expect(all, `a name from the old rules-book example:\n${all}`).not.toMatch(/Margo|Marguerite/);
      /* T5/T6: another employee's "they" is never the card's person. */
      expect(all, `"they" (another employee) became the card's person:\n${all}`).not.toMatch(/what Tamsin would do|if Tamsin had 8 arms/);
      const issue = String((thread.proposal as { issue?: string } | null)?.issue ?? "");
      if (/8 arms/.test(issue)) expect(issue, issue).toMatch(/what they would do if they had 8 arms/);
      /* Create: the drafter writes the Woven legal first name, as live; the saved Observation uses the card's name. */
      if (!thread.proposal) return;
      t.draftWrites({ observation: "Observed:\nOdessa has had unprofessional conversations with guests and staff. Odessa Brookfield asked another employee what they would do if they had 8 arms and 8 legs.\n\nExpectation:\nOdessa is expected to keep conversations with guests professional." });
      const id = await thread.create();
      const observation = t.values(id).observation ?? "";
      expect(observation, `the saved Observation uses the legal first name, not the card's:\n${observation}`).not.toMatch(/\bOdessa\b/);
      expect(observation, observation).toMatch(/\bTamsin\b/);
    },
  },
];
