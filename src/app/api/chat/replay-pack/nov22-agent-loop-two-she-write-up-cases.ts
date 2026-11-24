import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * TWO PEOPLE WHO ARE BOTH "SHE" ARE NEVER MIXED UP IN THE WRITE-UP (QA, 22 Nov 2026, production; names invented)
 * ============================================================================
 *
 * The manager wrote about <A> (she) and a coworker <B> (she) who was giving <A> an attitude. The card's write-up said
 * "<A> was giving <A> an attitude": the name-for-pronoun rewrite (`reply-pronouns.ts`, on the reply, the card's account
 * and the saved write-up) replaced the coworker's "she" with the employee's name. U23 (e5e7a97) covers only another
 * person of a different pronoun kind ("they"). Now a pronoun whose nearest named antecedent is another person of the
 * same kind is not the employee's, and is left as the manager wrote it. Controls: one "she" (still named), and a
 * coworker who is "he" (his "he" stays, her "her" is named). Board item f136: the saved Observation never swaps in the
 * Woven legal first name when the manager used the preferred one. Every person invented.
 */

const REPORT = "QA (22 Nov 2026, production; names invented): two people who are both \"she\" — the card's write-up said \"<A> was giving <A> an attitude\"";

/** Woven legal first name Perpetua, preferred Pip (board item f136). Invented. */
const PIP: DirectoryRow = { id: "e-perpetua-hensleigh", firstName: "Perpetua", lastName: "Hensleigh", preferredFirstName: "Pip", employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };

interface Story {
  readonly person: string;
  readonly request: string;
  /** The account the loop's model writes on the card (its own paraphrase, pronouns as the manager used them). */
  readonly account: string;
  /** What Create's drafter writes in the Observation. */
  readonly drafted: string;
}

/** One turn: the card is proposed with the story's account; then Create. The card, its reply and the saved Observation. */
async function tell(t: ReplayContext, story: Story): Promise<{ reply: string; issue: string; saved: string }> {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF, PIP]);
  t.as("location_manager", WEST_DODGE);
  t.loopModel!(loopStandIn((view): LoopDecision => {
    const proposed = lastResult(view, "propose_form") as { card?: { observation?: string | null } } | null;
    if (proposed?.card) return { text: `Here's the Corrective Action Form for **${story.person.split(" ")[0]}**.\n\n**Observation of Offense:** ${proposed.card.observation ?? ""}` };
    return { tool: "propose_form", input: { template_key: "dpoa", employee_name: story.person, person_evidence: evidenceFrom(view, story.person), what_happened: story.account, incident_date: "2026-11-21", policy: "Standards of Conduct" } };
  }));
  const thread = t.thread();
  const answer = await thread.say(story.request);
  const issue = String((thread.proposal as { issue?: string } | null)?.issue ?? "");
  t.draftWrites({ observation: story.drafted });
  const id = await thread.create();
  return { reply: answer.content, issue, saved: t.values(id).observation ?? "" };
}

const TWO_SHE: Story = {
  person: "Fenna Prewitt",
  request: "ca for Fenna Prewitt, she got into it with her coworker Thaddea Kroll on register last night. she was giving her an attitude and Fenna cussed at her in front of guests",
  account: "Fenna got into it with her coworker Thaddea Kroll on register on 11/21/26. She was giving her an attitude, and Fenna cussed at her in front of guests.",
  drafted: "Fenna got into it with her coworker Thaddea Kroll on register on 11/21/26. She was giving her an attitude, and Fenna cussed at her in front of guests.",
};

const ONE_SHE: Story = {
  person: "Fenna Prewitt",
  request: "ca for Fenna Prewitt, she was rude to a guest on register last night. she rolled her eyes at the guest and walked off",
  account: "Fenna was rude to a guest on register on 11/21/26. She rolled her eyes at the guest and walked off.",
  drafted: "Fenna was rude to a guest on register on 11/21/26. She rolled her eyes at the guest and walked off.",
};

const HE: Story = {
  person: "Fenna Prewitt",
  request: "ca for Fenna Prewitt, she got into it with her coworker Ozren Brack on register last night. he was giving her an attitude and Fenna cussed at him in front of guests",
  account: "Fenna got into it with her coworker Ozren Brack on register on 11/21/26. He was giving her an attitude, and Fenna cussed at him in front of guests.",
  drafted: "Fenna got into it with her coworker Ozren Brack on register on 11/21/26. He was giving her an attitude, and Fenna cussed at him in front of guests.",
};

const PREFERRED: Story = {
  person: "Pip Hensleigh",
  request: "ca for Pip Hensleigh, she got into it with her coworker Thaddea Kroll on register last night. she was giving her an attitude and Pip cussed at her in front of guests",
  account: "Pip got into it with her coworker Thaddea Kroll on register on 11/21/26. She was giving her an attitude, and Pip cussed at her in front of guests.",
  drafted: "Pip got into it with her coworker Thaddea Kroll on register on 11/21/26. She was giving her an attitude, and Pip cussed at her in front of guests.",
};

const all = (out: { reply: string; issue: string; saved: string }) => `REPLY:\n${out.reply}\n\nCARD:\n${out.issue}\n\nSAVED:\n${out.saved}`;

export const NOV22_AGENT_LOOP_TWO_SHE_WRITE_UP_CASES: ReplayCase[] = [
  {
    id: "nov22-two-she-coworkers-attitude-not-mixed-up",
    title: "Two \"she\": \"she was giving her an attitude\" (the coworker Thaddea) never becomes \"Fenna was giving Fenna an attitude\" in the reply, the card or the saved Observation",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const out = await tell(t, TWO_SHE);
      for (const text of [out.reply, out.issue, out.saved]) {
        expect(text, all(out)).not.toMatch(/Fenna was giving/);
        expect(text, all(out)).not.toMatch(/Fenna cussed at Fenna/);
      }
      expect(out.saved, all(out)).toMatch(/Thaddea/);
    },
  },
  {
    id: "nov22-two-she-control-one-she-still-named",
    title: "Control, one \"she\": \"She rolled her eyes at the guest\" is still written with the employee's name in the reply, the card and the saved Observation",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const out = await tell(t, ONE_SHE);
      for (const text of [out.reply, out.issue, out.saved]) {
        expect(text, all(out)).toMatch(/Fenna rolled/);
        expect(text, all(out)).not.toMatch(/\b[Ss]he\b/);
      }
    },
  },
  {
    id: "nov22-two-she-control-coworker-is-he",
    title: "Control, the coworker is \"he\": \"He was giving her an attitude\" keeps his \"he\" and \"him\" (never Fenna) and names her (\"He was giving Fenna an attitude\")",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const out = await tell(t, HE);
      for (const text of [out.reply, out.issue, out.saved]) {
        expect(text, all(out)).not.toMatch(/Fenna was giving/);
        expect(text, all(out)).not.toMatch(/cussed at Fenna/);
        // The live model may write his name, first or full, for "he" itself (a live run wrote "coworker Ozren Brack was
        // giving Fenna an attitude", which is right); either way her "her" is named. Widened on purpose, 22 Nov 2026.
        expect(text, all(out)).toMatch(/(?:He|Ozren(?: Brack)?) was giving Fenna an attitude/);
      }
    },
  },
  {
    id: "nov22-two-she-preferred-name-never-legal",
    title: "Two \"she\" with Woven legal Perpetua / preferred Pip (board item f136): the coworker's \"she\" is never Pip, and the saved Observation never says Perpetua",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const out = await tell(t, PREFERRED);
      for (const text of [out.reply, out.issue, out.saved]) {
        expect(text, all(out)).not.toMatch(/Pip was giving|Perpetua was giving/);
        expect(text, all(out)).not.toMatch(/\bPerpetua\b(?! Hensleigh in Woven)/);
      }
      expect(out.saved, all(out)).not.toMatch(/\bPerpetua\b/);
      expect(out.saved, all(out)).toMatch(/\bPip\b/);
    },
  },
];
