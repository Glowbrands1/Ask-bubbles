import { expect, vi } from "vitest";

import type { ReplayCase, ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A CORRECTED SPELLING STAYS CORRECTED, ON THE CARD AND THE SAVED WRITE-UP (QA's Bubbles live round 3, 22 Nov 2026, A1(b))
 * ============================================================================
 *
 * The tester's turns, word for word (the person invented, on no staff list under either spelling): T1 "My employee della
 * varnick has was 10 minutes late …", T2 "I already told you the employee name. She is at Dodge", T3 "Create the coaching
 * form with the information given. Her name is della varnich and she is at Dodge. …", T4 "she is at Omaha dodge". T3's
 * reply said the name changed to "Della Varnich", but the Observation and the saved coaching_details kept "Della
 * Varnick". The correction turn replaced the old spelling; at T4 the model copied T1's "Della Varnick" back into the
 * account and nothing replaced it (no correction in that message, nobody on the staff list). A two-word name in the
 * account that an earlier card in this chat was made for (its record's one-way key) and that is a close spelling of the
 * card's name is the old spelling, and becomes the card's name.
 */

const REPORT = "QA's Bubbles live round 3 (22 Nov 2026, A1(b)): after \"Her name is della varnich\", the Observation and the saved coaching_details kept \"Della Varnick\"";
const T1 = "My employee della varnick has was 10 minutes late on her last two shifts. On the first shift I verbally coached her on our policy and expectations. Then she was late again. Please create a CA form so I can document. She was late on 10/5 and 10/15";
const T2 = "I already told you the employee name. She is at Dodge";
const T3 = "Create the coaching form with the information given. Her name is della varnich and she is at Dodge. She is a makery associate";
const T4 = "she is at Omaha dodge";
const ACCOUNT = "Della Varnick was 10 minutes late on the last two shifts, on 10/5 and 10/15. After the first late shift Della Varnick was verbally coached on policy and expectations, then Della Varnick was late again.";

const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";
const back = (view: LoopView, text: string) => {
  const asks = view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0);
  return Math.max(0, asks.length - 1 - asks.findIndex((turn) => turn.text === text));
};
const issueOf = (proposal: unknown) => (proposal as { issue?: string | null } | null)?.issue ?? "";

/** The live model: every turn's account is T1's, with T1's spelling (`account`); from T3 the card is the Coaching Form for the corrected name. */
const live = (account: string, first = T1) =>
  loopStandIn((view): LoopDecision => {
    const message = said(view);
    if (lastResult(view, "propose_form")) return { text: "Here's the card." };
    const coaching = message === T3 || message === T4;
    const t1 = first;
    return {
      tool: "propose_form",
      input: {
        template_key: coaching ? "coaching" : "dpoa", employee_name: coaching ? "Della Varnich" : "Della Varnick", what_happened: account,
        ...(message === t1 ? {} : { store: message === T4 ? "Omaha dodge" : "Dodge" }), policy: headingWith(view, /attendance/i),
        person_evidence: evidenceFrom(view, coaching ? "della varnich" : "della varnick", coaching ? back(view, T3) : back(view, t1)),
        ...(message === T3 ? { form_change_evidence: evidenceFrom(view, "Create the coaching form") } : {}),
      },
    };
  });

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-22T15:29:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] });
}

export const NOV22_ROUND3_CORRECTED_SPELLING_KEPT_CASES: ReplayCase[] = [
  {
    id: "nov22-r3-a1b-corrected-surname-kept-after-correction-turn",
    title: "Round 3 A1(b): \"Her name is della varnich\" (one letter, same first name, off the staff list), then T4 \"she is at Omaha dodge\" with the model copying \"Della Varnick\" back — the card's Observation and the saved coaching_details say \"Della Varnich\"",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      t.loopModel!(live(ACCOUNT));
      const thread = t.thread();
      for (const turn of [T1, T2, T3, T4]) await thread.say(turn);
      expect(thread.proposal?.employeeName, "the case proves nothing: the card is not the corrected name").toBe("Della Varnich");
      expect(issueOf(thread.proposal), "the Observation kept the old surname").not.toMatch(/Varnick/);
      const id = await thread.create();
      expect(t.values(id).coaching_details ?? "", "the saved coaching_details kept the old surname").not.toMatch(/Varnick/);
    },
  },
  {
    id: "nov22-r3-a1b-control-other-close-name-stays",
    title: "Round 3 A1(b), control: a close spelling no earlier card in the chat was made for (\"Della Varnock covered for her\") is someone else's name and stays as written",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      /* The manager names a coworker whose name is a close spelling too; no card was ever made for her. */
      const first = `${T1}. Della Varnock covered for her`;
      t.loopModel!(live(`${ACCOUNT} Della Varnock covered for her.`, first));
      const thread = t.thread();
      for (const turn of [first, T2, T3, T4]) await thread.say(turn);
      expect(issueOf(thread.proposal), "the coworker's close-spelled name was replaced").toMatch(/Della Varnock covered for/);
      expect(issueOf(thread.proposal)).not.toMatch(/Varnick/);
    },
  },
  {
    id: "nov22-r3-a1b-saved-write-up-from-the-notes-uses-the-corrected-name",
    title: "Round 3 A1(b), the saved write-up: the account names only \"Della\", and Create's draft copies the manager's own \"My employee della varnick …\" — the saved coaching_details never keeps \"varnick\"",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      t.loopModel!(live("Della was 10 minutes late on the last two shifts, on 10/5 and 10/15. After the first late shift Della was verbally coached on policy and expectations, then Della was late again."));
      const thread = t.thread();
      for (const turn of [T1, T2, T3, T4]) await thread.say(turn);
      expect(thread.proposal?.employeeName).toBe("Della Varnich");
      expect((thread.proposal as { earlierNames?: string[] } | null)?.earlierNames ?? [], "the card does not carry the earlier spelling").toContainEqual(expect.stringMatching(/varnick/i));
      const id = await thread.create();
      expect(t.values(id).coaching_details ?? "", `the saved write-up kept the old surname:\n${t.values(id).coaching_details}`).not.toMatch(/varnick/i);
    },
  },
];
