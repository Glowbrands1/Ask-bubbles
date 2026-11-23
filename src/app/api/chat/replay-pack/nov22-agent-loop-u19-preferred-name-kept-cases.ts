import { expect, vi } from "vitest";

import { type DirectoryRow, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE CARD KEEPS THE NAME THE MANAGER CHOSE WHEN THE ACCOUNT USES THE OTHER FIRST NAME (round 2's offline replay, 21 Nov
 * 2026, U19)
 * ============================================================================
 *
 * A location manager (primary Bellevue + Omaha West Dodge), the turns word for word, the person invented: Woven's legal
 * first name Ilsabet, preferred Sabeth Corvelle. T1 named her by the preferred full name; T3's account said "on 11/14
 * Ilsabet worked …". The card's name flipped from "Sabeth Corvelle" to "Ilsabet Corvelle" unasked, and the reply's
 * headline from Sabeth to Ilsabet. The same person throughout; the name changed without the manager asking.
 */

const REPORT = "Round 2 offline replay (21 Nov 2026, U19): the card's name flipped from the preferred to the legal name when the account used the legal first name";
const ILSABET: DirectoryRow = { id: "e-ilsabet-corvelle", firstName: "Ilsabet", lastName: "Corvelle", preferredFirstName: "Sabeth", employmentStatus: "active", locationIds: ["loc-264", "loc-67"], positionName: "Team Member Part Time" };
const SCOPE = { level: "location", primaryAreaId: "loc-67", alsoCoversAreaIds: ["loc-264"] };
const T1 = "make a corrective action for sabeth corvelle verbal warning payroll not deductable";
const T2 = "here is what happened:";
const T3 = "observation of offense: on 11/14 Ilsabet worked 50 minutes over the scheduled shift and did not clean up after themself";

const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).length;

export const NOV22_AGENT_LOOP_U19_PREFERRED_NAME_KEPT_CASES: ReplayCase[] = [
  {
    id: "nov22-u19-preferred-name-kept-when-account-says-legal",
    title: "U19 verbatim: T1 \"… for sabeth corvelle …\", T3's account \"on 11/14 Ilsabet worked …\" with the model passing the legal name: the card stays \"Sabeth Corvelle\"",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-16T18:00:00Z"));
      t.directory([...LOOP_STAFF, ILSABET]);
      t.as("location_manager", SCOPE);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        if (lastResult(view, "propose_form")) return { text: "Here's the Corrective Action Form." };
        const turn = users(view);
        if (turn === 2) return { text: "What happened?" };
        /* As live: T3's card named by the first name the account uses. */
        const name = turn === 1 ? "Sabeth Corvelle" : "Ilsabet Corvelle";
        return {
          tool: "propose_form",
          input: {
            template_key: "dpoa", employee_name: name, person_evidence: evidenceFrom(view, turn === 1 ? "sabeth corvelle" : "Ilsabet", turn === 1 ? 0 : 0),
            warning_level: "verbal", level_evidence: evidenceFrom(view, "verbal warning", turn - 1),
            payroll_deduct: "no", payroll_evidence: evidenceFrom(view, "payroll not deductable", turn - 1),
            ...(turn === 3 ? { what_happened: "On 11/14 Ilsabet worked 50 minutes over the scheduled shift and did not clean up after themself.", incident_date: "2026-11-14" } : {}),
          },
        };
      }));
      const thread = t.thread();
      await thread.say(T1);
      expect(thread.proposal?.employeeName, "T1's card is not Sabeth's (the case proves nothing)").toBe("Sabeth Corvelle");
      await thread.say(T2);
      const reply = await thread.say(T3);
      expect(thread.proposal?.employeeName, reply.content).toBe("Sabeth Corvelle");
    },
  },
  {
    id: "nov22-u19-legal-full-name-asked-moves-card",
    title: "U19 control: \"it's for Ilsabet Corvelle\" (the legal FULL name) after a card for Sabeth Corvelle moves the card to the legal name",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-16T18:00:00Z"));
      t.directory([...LOOP_STAFF, ILSABET]);
      t.as("location_manager", SCOPE);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        if (lastResult(view, "propose_form")) return { text: "Here's the Corrective Action Form." };
        const turn = users(view);
        const name = turn === 1 ? "Sabeth Corvelle" : "Ilsabet Corvelle";
        return {
          tool: "propose_form",
          input: {
            template_key: "dpoa", employee_name: name, person_evidence: evidenceFrom(view, turn === 1 ? "sabeth corvelle" : "Ilsabet Corvelle"),
            warning_level: "verbal", level_evidence: evidenceFrom(view, "verbal warning", turn - 1),
            payroll_deduct: "no", payroll_evidence: evidenceFrom(view, "payroll not deductable", turn - 1),
          },
        };
      }));
      const thread = t.thread();
      await thread.say(T1);
      await thread.say("it's for Ilsabet Corvelle");
      expect(thread.proposal?.employeeName).toBe("Ilsabet Corvelle");
    },
  },
  {
    id: "nov23-u19-legal-first-name-in-account-is-the-card-person",
    title: "U19 (QA's live re-run on cad9c15): the card is Sabeth Corvelle (Ilsabet in Woven); T3's account \"on 11/14 Ilsabet worked 50 minutes over the scheduled shift and did not clean up after themself\": the card and the saved form name the person, never \"clean up after Sabeth Corvelle\" or \"another individual\"",
    report: `${REPORT}; QA's live re-run (23 Nov 2026, cad9c15): "did not clean up after Tamsin Brookfield" on the card and saved form, and "the account describes another individual's actions" in the saved Expectation`,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-16T18:00:00Z"));
      t.directory([...LOOP_STAFF, ILSABET]);
      t.as("location_manager", SCOPE);
      const account = "On 11/14 Ilsabet worked 50 minutes over the scheduled shift and did not clean up after themself.";
      t.loopModel!(loopStandIn((view): LoopDecision => {
        if (lastResult(view, "propose_form")) return { text: "Here's the Corrective Action Form." };
        const turn = users(view);
        if (turn === 2) return { text: "What happened?" };
        return {
          tool: "propose_form",
          input: {
            template_key: "dpoa", employee_id: ILSABET.id, person_evidence: evidenceFrom(view, "sabeth corvelle", turn - 1),
            warning_level: "verbal", level_evidence: evidenceFrom(view, "verbal warning", turn - 1),
            payroll_deduct: "no", payroll_evidence: evidenceFrom(view, "payroll not deductable", turn - 1),
            ...(turn === 3 ? { what_happened: account, incident_date: "2026-11-14" } : {}),
          },
        };
      }));
      const thread = t.thread();
      await thread.say(T1);
      await thread.say(T2);
      const reply = await thread.say(T3);
      const issue = String((thread.proposal as { issue?: string | null } | null)?.issue ?? "");
      expect(issue, reply.content).toMatch(/worked 50 minutes/);
      expect(issue, `the card makes the person the object of their own action:\n${issue}`).not.toMatch(/after (?:Sabeth|Ilsabet)/i);
      // She works at two stores; the manager picks hers on the card, as the browser's store picker does.
      const id = await thread.create("loc-67");
      const saved = JSON.stringify(t.values(id));
      expect(saved, saved).not.toMatch(/after (?:Sabeth|Ilsabet)/i);
      expect(saved, saved).not.toMatch(/another individual/i);
    },
  },
];
