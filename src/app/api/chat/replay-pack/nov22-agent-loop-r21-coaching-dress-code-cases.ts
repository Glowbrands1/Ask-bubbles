import { expect, vi } from "vitest";

import { type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A CA TURNED COACHING FORM CITES THE DRESS CODE ITS OWN ACCOUNT DESCRIBES (round 2's offline replay, 21 Nov 2026, R21)
 * ============================================================================
 *
 * An admin (global), the turns word for word, the person invented (one first name typed): T1 "I have an employee <First>
 * at our Grand Island location who has been out of dress code three shifts. …" made a Corrective Action citing
 * "Standards of Conduct Policy, JBA Policy Manual p.12". T2 "Create a Coaching Form from this conversation." dropped the
 * policy (QA's 16 Nov ruling: a non-CA card never copies another form's heading) and the reply offered "tell me if you'd
 * like a different policy cited, or none"; T3 "Yes" made it "Other — Dress Code", and the saved form ticked no topic.
 * QA's ruling (22 Nov 2026, R21 (b)): the 16 Nov ruling stands; the Coaching card's own account reaches its heading
 * through the existing dress-code reader (`dressCodeFit`, used on the CA), never a copied heading and never "Other".
 */

const REPORT = "Round 2 offline replay (21 Nov 2026, R21): a CA→Coaching switch dropped the policy line, and a bare \"Yes\" made it \"Other — Dress Code\"";
const RHOSYN: DirectoryRow = { id: "e-rhosyn-dellacroix", firstName: "Rhosyn", lastName: "Dellacroix", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-236"], positionName: "Team Member Part Time" };
const T1 = "I have an employee Rhosyn at our Grand Island location who has been out of dress code three shifts. I verbally coached her on the second offense and she still is out of dress code";
const T2 = "Create a Coaching Form from this conversation.";
const ACCOUNT = "Rhosyn has been out of dress code for three shifts. Rhosyn was verbally coached on the second offense and is still out of dress code.";

const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).length;
type Out = { card?: { policy?: string | null }; reason_code?: string; error?: string } | null;
/** The policy a hand-back names ("Propose the card again with policy \"<heading>\""), as a model following it would pass. */
const named = (error: string | undefined) => /with policy "([^"]+)"/.exec(error ?? "")?.[1] ?? null;

/** The manual's Dress Code section, as the production manual rows hold it (as `nov10-not-following-dress-code-cases.ts`). */
const DRESS_CODE_CHUNK = {
  chunkIndex: 44,
  chunkId: "jba-44",
  locator: "Page 15 — Dress Code for The Company",
  page: 16,
  content:
    "Dress Code for The Company\nThe Company Employees are to keep a neat, clean, professional appearance at all times. Anyone\nviolating their Brand’s Dress code policy will be sent home to change into proper work attire.",
  section: "Dress Code for The Company",
  printedPage: 15,
  sections: [
    { heading: "Dress Code for The Company", page: 15 },
    { heading: "All Locations Dress Code", page: 15 },
  ],
};

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-10-16T18:00:00Z"));
  t.manualAlsoHas?.([DRESS_CODE_CHUNK]);
  t.directory([...LOOP_STAFF, RHOSYN]);
  t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] });
}

/** T1: the CA as live (Standards of Conduct). Later turns: the Coaching card with `policy` (null: none, as live). */
function standIn(later: (turn: number) => string | null) {
  return loopStandIn((view): LoopDecision => {
    const result = lastResult(view, "propose_form") as Out;
    const turn = users(view);
    if (result?.card) return { text: `Here's the card.${result.card.policy ? ` **Policy:** ${result.card.policy}` : ""}` };
    const handedBack = named(result?.error);
    const coaching = turn >= 2;
    const policy = handedBack ?? (coaching ? later(turn) : "Standards of Conduct");
    return {
      tool: "propose_form",
      input: {
        template_key: coaching ? "coaching" : "dpoa", employee_name: "Rhosyn Dellacroix", person_evidence: evidenceFrom(view, "Rhosyn", turn - 1),
        what_happened: ACCOUNT, prior_actions: "Verbal coaching on the second dress code offense.",
        ...(policy ? { policy } : {}),
        ...(coaching ? { new_form_evidence: evidenceFrom(view, "Create a Coaching Form", turn - 2) } : {}),
      },
    };
  });
}

export const NOV22_AGENT_LOOP_R21_COACHING_DRESS_CODE_CASES: ReplayCase[] = [
  {
    id: "nov22-r21-ca-to-coaching-cites-dress-code",
    title: "R21 verbatim: T2 \"Create a Coaching Form from this conversation.\" after a CA citing the Standards of Conduct: the Coaching card cites the manual's Dress Code heading (its own account), never the copied Standards of Conduct and never no policy",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      t.loopModel!(standIn(() => null));
      const thread = t.thread();
      await thread.say(T1);
      expect(thread.proposal?.templateKey, "T1 made no CA (the case proves nothing)").toBe("dpoa");
      const reply = await thread.say(T2);
      expect(thread.proposal?.templateKey, reply.content).toBe("coaching");
      const policy = String((thread.proposal as { policyLine?: string | null } | null)?.policyLine ?? "");
      expect(policy, reply.content).toMatch(/dress code/i);
      expect(policy, reply.content).not.toMatch(/standards of conduct|^other/i);
    },
  },
  {
    id: "nov22-r21-bare-yes-never-other-dress-code",
    title: "R21 verbatim: T3 \"Yes\" with the model citing \"Other — Dress Code\" on the Coaching card: the card cites the manual's Dress Code heading, not Other",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      t.loopModel!(standIn((turn) => (turn >= 3 ? "Other — Dress Code" : null)));
      const thread = t.thread();
      await thread.say(T1);
      await thread.say(T2);
      const reply = await thread.say("Yes");
      const policy = String((thread.proposal as { policyLine?: string | null } | null)?.policyLine ?? "");
      expect(thread.proposal?.templateKey, reply.content).toBe("coaching");
      expect(policy, reply.content).toMatch(/dress code/i);
      expect(policy, reply.content).not.toMatch(/^other/i);
    },
  },
];
