import { expect, vi } from "vitest";

import type { ReplayCase, ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE STORE, WRITTEN AS AN ASIDE, LEAVES THE ACCOUNT WITH ITS COMMAS (QA's Bubbles live re-run, 23 Nov 2026, A1)
 * ============================================================================
 *
 * The tester's turns, word for word (the person invented, on no staff list under either spelling): T1 "My employee della
 * varnick has was 10 minutes late …", T2 "I already told you the employee name. She is at Dodge", T3 "Create the coaching
 * form with the information given. Her name is della varnich and she is at Dodge. She is a makery associate". On
 * production 9340334 T3's card read "<First>, was 10 minutes late to the shift on 10/5.": the model wrote the store as an
 * aside ("<P>, at Dodge, was …"), and the store strip (`withoutNamedSalon`) took the phrase and its closing comma but left
 * the opening one. Now a phrase between two commas leaves with one of them.
 */

const REPORT = "QA's Bubbles live re-run (23 Nov 2026, A1): after \"Her name is della varnich and she is at Dodge\", the card's account read \"Della, was 10 minutes late …\"";
const T1 = "My employee della varnick has was 10 minutes late on her last two shifts. On the first shift I verbally coached her on our policy and expectations. Then she was late again. Please create a CA form so I can document. She was late on 10/5 and 10/15";
const T2 = "I already told you the employee name. She is at Dodge";
const T3 = "Create the coaching form with the information given. Her name is della varnich and she is at Dodge. She is a makery associate";
const ACCOUNT_T1 = "Della Varnick was 10 minutes late to the shift on 10/5. Della Varnick was verbally coached on the attendance policy and expectations. Della Varnick was late again on 10/15.";

const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";
const back = (view: LoopView, text: string) => {
  const asks = view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0);
  return Math.max(0, asks.length - 1 - asks.findIndex((turn) => turn.text === text));
};
const issueOf = (proposal: unknown) => (proposal as { issue?: string | null } | null)?.issue ?? "";

/** The live model: T1–T2 a Corrective Action card for the typed name; T3 the Coaching Form for the corrected name, with the T3 account `t3Account`. */
const live = (t3Account: string) =>
  loopStandIn((view): LoopDecision => {
    const message = said(view);
    if (lastResult(view, "propose_form")) return { text: "Here's the card." };
    const coaching = message === T3;
    return {
      tool: "propose_form",
      input: {
        template_key: coaching ? "coaching" : "dpoa", employee_name: coaching ? "Della Varnich" : "Della Varnick", what_happened: coaching ? t3Account : ACCOUNT_T1,
        ...(message === T1 ? {} : { store: "Dodge" }), policy: headingWith(view, /attendance/i),
        person_evidence: evidenceFrom(view, coaching ? "della varnich" : "della varnick", coaching ? back(view, T3) : back(view, T1)),
        ...(coaching ? { form_change_evidence: evidenceFrom(view, "Create the coaching form") } : {}),
      },
    };
  });

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-23T01:47:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] });
}

async function chat(t: ReplayContext, t3Account: string) {
  start(t);
  /* The condition is the stand-in's input (the account the live model wrote at T3), so it plays in live runs too (#1062). */
  t.loopModel!(live(t3Account), { scripted: true });
  const thread = t.thread();
  for (const turn of [T1, T2, T3]) await thread.say(turn);
  expect(thread.proposal?.employeeName, "the case proves nothing: the card is not the corrected name").toBe("Della Varnich");
  expect(thread.proposal?.locationId, "the case proves nothing: the card is not at the Dodge store").toBe("loc-264");
  return issueOf(thread.proposal);
}

export const NOV23_A1_STORE_ASIDE_COMMA_CASES: ReplayCase[] = [
  {
    id: "nov23-a1-store-aside-leaves-with-its-commas",
    title: "A1 T3 \"… Her name is della varnich and she is at Dodge …\": the model's \"Della Varnich, at Dodge, was 10 minutes late …\" becomes \"Della was 10 minutes late …\", never \"Della, was …\"",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const issue = await chat(t, "Della Varnich, at Dodge, was 10 minutes late to the shift on 10/5. Della Varnich was verbally coached on the attendance policy and expectations. Della Varnich was late again on 10/15.");
      expect(issue, "a comma was left where the store was").not.toMatch(/Della,\s*was/);
      expect(issue).toMatch(/^Della was 10 minutes late to the shift on 10\/5\./);
      expect(issue).not.toMatch(/Dodge|Varnick/i);
    },
  },
  {
    id: "nov23-a1-store-after-title-aside-keeps-closing-comma",
    title: "A1 T3, the store after the title in one aside: \"Della Varnich, a makery associate at Dodge, was …\" becomes \"Della, a makery associate, was …\"",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const issue = await chat(t, "Della Varnich, a makery associate at Dodge, was 10 minutes late to the shift on 10/5. Della Varnich was verbally coached on the attendance policy and expectations. Della Varnich was late again on 10/15.");
      expect(issue, "the aside lost its closing comma").toMatch(/^Della, a makery associate, was 10 minutes late/);
      expect(issue).not.toMatch(/Dodge/i);
    },
  },
];
