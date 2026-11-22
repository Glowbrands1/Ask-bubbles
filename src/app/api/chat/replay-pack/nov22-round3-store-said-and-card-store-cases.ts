import { expect, vi } from "vitest";

import type { DirectoryRow, ReplayCase, ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * QA's BUBBLES LIVE ROUND 3 (22 Nov 2026, production 1c71e11): A7 partial and A1(a)
 * ============================================================================
 *
 * A7: T1 "do verbal for team member <P> at empire, sd. …" was filed at the W 41st St store (the reviewed nickname,
 * #1046), but the reply said "The card is filed at Sioux Falls, SD (W 41st St), where Woven lists <P>'s store (Empire, SD
 * isn't one I recognize as a store name) — say if it should be elsewhere.": nothing told the model the manager's words
 * were the card's store. Now propose_form's result names them (store_said), read by the store reader.
 *
 * A1(a): T4 "she is at Omaha dodge" made no card (production's trace: card null), and the reply's true "filed at
 * Omaha, NE (West Dodge Rd)" was a mismatch, because the card record held no store for a person's card; the reply became
 * only "Which store is this for?". The card record now holds the card's store id (never a name).
 */

const REPORT = "QA's Bubbles live round 3 (22 Nov 2026): A7's reply said the card was placed by Woven and that \"Empire, SD\" isn't a store it recognises; A1's T4 \"she is at Omaha dodge\" got only \"Which store is this for?\" though the card was filed at West Dodge";
/** Woven lists this person at the E 18th St store only; the manager names the W 41st St store by its nickname. */
const NOOR: DirectoryRow = { id: "e-noor-ashby", firstName: "Noor", lastName: "Ashby", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-338"], positionName: "Team Member Part Time" };
const SD_MANAGER = { level: "location", primaryAreaId: "loc-338", alsoCoversAreaIds: ["loc-225"] };
const A7_T1 = "do verbal for team member noor ashby at empire, sd. payroll deduct does not apply. previous coaching jba manual 11-1-26. on 10-22-26 noor was not scheduled to work and came into the store to show her team her new puppy. Noor was in the store 45 min";
const LIVE_A7 = "The card is filed at **Sioux Falls, SD (W 41st St)**, where Woven lists Noor's store (Empire, SD isn't one I recognize as a store name) — say if it should be elsewhere.";

const A1 = {
  T1: "My employee della varnick has was 10 minutes late on her last two shifts. On the first shift I verbally coached her on our policy and expectations. Then she was late again. Please create a CA form so I can document. She was late on 10/5 and 10/15",
  T2: "I already told you the employee name. She is at Dodge",
  T3: "Create the coaching form with the information given. Her name is della varnich and she is at Dodge. She is a makery associate",
  T4: "she is at Omaha dodge",
};
const A1_ACCOUNT = "Della was 10 minutes late on the last two shifts, on 10/5 and 10/15. After the first late shift Della was verbally coached on policy and expectations, then Della was late again.";
const LIVE_A1_T4 = "Here's the Coaching Form for **Della Varnich**, filed at **Omaha, NE (West Dodge Rd)**.";

const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";
const back = (view: LoopView, text: string) => {
  const asks = view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0);
  return Math.max(0, asks.length - 1 - asks.findIndex((turn) => turn.text === text));
};

export const NOV22_ROUND3_STORE_SAID_AND_CARD_STORE_CASES: ReplayCase[] = [
  {
    id: "nov22-r3-a7-store-said-never-unrecognised",
    title: "Round 3 A7: \"… at empire, sd …\" for a person Woven lists at E 18th St — filed at W 41st St, propose_form says the manager's \"empire\" is that store (store_said), and the reply never calls Empire unrecognised or Woven-placed",
    report: REPORT,
    status: "fixed",
    async run(t: ReplayContext) {
      vi.setSystemTime(new Date("2026-11-22T15:33:00Z"));
      t.directory([...LOOP_STAFF, NOOR]);
      t.as("location_manager", SD_MANAGER);
      const model = loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form") as { facts?: { store_said?: { said?: string; store?: string } } } | null;
        if (result) return { text: result.facts?.store_said ? `Here's the Corrective Action Form for **Noor**, filed at **${result.facts.store_said.store}**.` : `Here's the Corrective Action Form for **Noor**.\n\n${LIVE_A7}` };
        return { tool: "propose_form", input: { template_key: "dpoa", employee_id: NOOR.id, what_happened: "On 10/22/26 Noor was not scheduled to work and came into the store to show the team the new puppy.", warning_level: "verbal", level_evidence: evidenceFrom(view, "do verbal"), policy: headingWith(view, /animals in the workplace/i) ?? headingWith(view, /standards of conduct/i), person_evidence: evidenceFrom(view, "noor ashby") } };
      });
      t.loopModel!(model);
      const thread = t.thread();
      const reply = await thread.say(A7_T1);
      expect(thread.proposal?.locationId, "the case proves nothing: the card is not at the W 41st St store").toBe("loc-225");
      const facts = model.views.map((view) => lastResult(view, "propose_form") as { facts?: { store_said?: { said?: string } } } | null).filter(Boolean).at(-1)?.facts;
      expect(facts?.store_said?.said ?? "", "the model is not told the manager's words are the card's store").toMatch(/empire/i);
      expect(reply.content, `the reply calls Empire unrecognised or Woven-placed:\n${reply.content}`).not.toMatch(/isn't one I recognize|where Woven lists/i);
    },
  },
  {
    id: "nov22-r3-a1a-no-card-turn-keeps-true-store-claim",
    title: "Round 3 A1(a): T4 \"she is at Omaha dodge\" with no card this turn and the reply \"… filed at Omaha, NE (West Dodge Rd)\" (true: the card shown is filed there) — never replaced by \"Which store is this for?\"",
    report: REPORT,
    status: "fixed",
    async run(t: ReplayContext) {
      vi.setSystemTime(new Date("2026-11-22T15:29:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] });
      const model = loopStandIn((view): LoopDecision => {
        const message = said(view);
        if (message === A1.T4) return { text: LIVE_A1_T4 };
        if (lastResult(view, "propose_form")) return { text: "Here's the card." };
        const coaching = message === A1.T3;
        return {
          tool: "propose_form",
          input: {
            template_key: coaching ? "coaching" : "dpoa", employee_name: coaching ? "Della Varnich" : "Della Varnick", what_happened: A1_ACCOUNT,
            ...(message === A1.T1 ? {} : { store: "Dodge" }), policy: headingWith(view, /attendance/i),
            person_evidence: evidenceFrom(view, coaching ? "della varnich" : "della varnick", coaching ? back(view, A1.T3) : back(view, A1.T1)),
            ...(coaching ? { form_change_evidence: evidenceFrom(view, "Create the coaching form") } : {}),
          },
        };
      });
      t.loopModel!(model);
      const thread = t.thread();
      for (const turn of [A1.T1, A1.T2, A1.T3]) await thread.say(turn);
      expect(thread.proposal?.locationId, "the case proves nothing: T3's card is not at West Dodge").toBe("loc-264");
      const fourth = await thread.say(A1.T4);
      expect(fourth.content, `the true store claim was replaced by the store question:\n${fourth.content}`).not.toMatch(/^Which store is this for\?$/);
      expect(fourth.content).toMatch(/filed at \*\*Omaha, NE \(West Dodge Rd\)\*\*/);
    },
  },
  {
    id: "nov22-r3-a1a-control-team-card-store-on-record",
    title: "Round 3 A1(a), control: a team card filed at a store, then a turn with no card whose reply says it is filed there — kept (the team card's store is on the record too); a team card with no store still asks (#1033)",
    report: REPORT,
    status: "fixed",
    async run(t: ReplayContext) {
      vi.setSystemTime(new Date("2026-11-22T15:41:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as("location_manager", { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: ["loc-225", "loc-338"] });
      const T1 = "can you create a coaching form for my whole staff at west dodge?";
      const T2 = "thanks";
      t.loopModel!(
        loopStandIn((view): LoopDecision => {
          if (said(view) === T2) return { text: "The team Coaching card is filed at **Omaha, NE (West Dodge Rd)**." };
          if (lastResult(view, "coach_team")) return { text: "Here's the team Coaching card." };
          return { tool: "coach_team", input: {} };
        }),
      );
      const thread = t.thread();
      await thread.say(T1);
      expect((thread.proposal as { subject?: string } | null)?.subject, "the case proves nothing: no team card").toBe("team");
      expect(thread.proposal?.locationId, "the case proves nothing: the team card has no store").toBe("loc-264");
      const second = await thread.say(T2);
      expect(second.content).toMatch(/filed at \*\*Omaha, NE \(West Dodge Rd\)\*\*/);
      expect(second.content).not.toMatch(/^Which store is this for\?$/);
    },
  },
  ...[true, false].map((fixes): ReplayCase => ({
    id: fixes ? "nov22-r3-a7-woven-line-without-woven-handed-back" : "nov22-r3-a7-woven-line-without-woven-left-out",
    title: fixes
      ? "Round 3 A7: the reply's \"Filed at <store>, where Woven lists <P>\" when the manager named the store (no store_from_woven) goes back once and is said as the manager's"
      : "Round 3 A7: the model repeating \"where Woven lists <P>\" after the hand-back — that sentence is left out; the card is unchanged",
    report: REPORT,
    status: "fixed",
    async run(t: ReplayContext) {
      vi.setSystemTime(new Date("2026-11-22T15:33:00Z"));
      t.directory([...LOOP_STAFF, NOOR]);
      t.as("location_manager", SD_MANAGER);
      const checked = (view: LoopView) => view.turns.some((turn) => /^\[app check\]/.test(turn.text) && /lists the employee/.test(turn.text));
      const model = loopStandIn((view): LoopDecision => {
        if (lastResult(view, "propose_form")) {
          return { text: checked(view) && fixes ? "Here's the Corrective Action Form for **Noor**.\n\nFiled at **Sioux Falls, SD (W 41st St)**, as you said." : "Here's the Corrective Action Form for **Noor**.\n\nFiled at **Sioux Falls, SD (W 41st St)**, where Woven lists Noor; say if it's another store. The card above is still open." };
        }
        return { tool: "propose_form", input: { template_key: "dpoa", employee_id: NOOR.id, what_happened: "On 10/22/26 Noor was not scheduled to work and came into the store to show the team the new puppy.", policy: headingWith(view, /standards of conduct/i), person_evidence: evidenceFrom(view, "noor ashby") } };
      });
      t.loopModel!(model);
      const thread = t.thread();
      const reply = await thread.say(A7_T1);
      expect(thread.proposal?.locationId).toBe("loc-225");
      expect(model.views.some(checked), "the Woven line with no Woven store was never handed back").toBe(true);
      expect(reply.content, `the reply still says Woven placed the card:\n${reply.content}`).not.toMatch(/where Woven lists/i);
      expect(reply.content).toMatch(fixes ? /as you said/ : /The card above is still open\./);
    },
  })),
];
