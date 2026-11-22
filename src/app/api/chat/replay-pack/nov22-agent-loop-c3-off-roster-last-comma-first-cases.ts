import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * AN OFF-ROSTER "<LAST>, <FIRST>" STILL GETS ITS CARD, AS "<FIRST> <LAST>" (QA's live round 3 on production 1c71e11, 22
 * Nov 2026, C3 regression)
 * ============================================================================
 *
 * The manager's turn, word for word (the person invented, nobody on the staff list): "create a CA form for <Last>,
 * <First> at dodge. she was late on 10-16". Earlier that day the card was made for the name as typed, with the
 * off-roster note. On 1c71e11 the reply said "I wasn't able to create that card — **<First> <Last>** isn't on your
 * store's Woven staff list, and the form wasn't built" and there was no card: the model passed the name in first-last
 * order, which the manager never typed in that order, so every as-typed check missed it. With AGENT_LOOP_LIVE=1 the real
 * model plays the turn.
 */

const REPORT = "QA's live round 3 (22 Nov 2026, C3 regression): an off-roster \"<Last>, <First>\" got no card, \"isn't on your store's Woven staff list, and the form wasn't built\"";
const T1 = "create a CA form for Quillane, Odessa at dodge. she was late on 10-16";
const ADMIN = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

/* QA's tester used Pau's admin (all-store) login; the live reply said "your store's" staff list, so a store login too. */
const LOGINS = [
  { suffix: "", role: "admin", scope: ADMIN, who: "an all-store admin" },
  { suffix: "-store-login", role: "location_manager", scope: WEST_DODGE, who: "a store manager" },
] as const;

export const NOV22_AGENT_LOOP_C3_OFF_ROSTER_LAST_COMMA_FIRST_CASES: ReplayCase[] = LOGINS.map((login): ReplayCase => (
  {
    id: `nov22-c3-off-roster-last-comma-first-gets-card${login.suffix}`,
    title: `C3 regression (${login.who}): "create a CA form for <Last>, <First> at dodge. she was late on 10-16" (nobody on the staff list) gets a card for "<First> <Last>" with the off-roster note, even when the model passes the name in first-last order`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as(login.role, login.scope);
      /* The stand-in: as live, the model passes the name in first-last order ("Odessa Quillane"), quoting the manager's words. */
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form") as { card?: { employee?: string }; ask_exactly?: string; error?: string } | null;
        if (result) return { text: result.card ? `Here's the Corrective Action Form for **${result.card.employee}**.` : (result.ask_exactly ?? result.error ?? "no card") };
        return { tool: "propose_form", input: { template_key: "dpoa", employee_name: "Odessa Quillane", what_happened: "Odessa was late on 10/16.", incident_date: "2026-10-16", policy: headingWith(view, /^attendance/i), store: "dodge", person_evidence: evidenceFrom(view, "Quillane, Odessa") } };
      }));
      const thread = t.thread();
      const reply = await thread.say(T1);
      expect(thread.proposal?.employeeName, `no card for the typed name:\n${reply.content}`).toBe("Odessa Quillane");
      expect(reply.content, "the reply says the form was not built").not.toMatch(/wasn't built|wasn.t able to create/i);
    },
  }
)).concat([
  {
    id: "nov22-c3-same-request-twice-never-loops",
    title: "C3 (QA: find_staff and propose_form agree): the same off-roster \"<Last>, <First>\" request sent twice in a row gets a card each time, and propose_form never refuses it — the name find_staff takes as typed is never refused by propose_form",
    report: `${REPORT}; QA (22 Nov 2026): find_staff said "propose it as typed" and propose_form refused that name, 3–6 times`,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as("admin", ADMIN);
      const refusals: string[] = [];
      /* The stand-in as the looping model: it proposes "<First> <Last>" and, refused, proposes that same name again. */
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form") as { card?: { employee?: string } } | null;
        if (result && !result.card) refusals.push(JSON.stringify(result).slice(0, 300));
        if (result?.card || view.step >= 6) return { text: result?.card ? `Here's the Corrective Action Form for **${result.card.employee}**.` : "no card" };
        return { tool: "propose_form", input: { template_key: "dpoa", employee_name: "Odessa Quillane", what_happened: "Odessa was late on 10/16.", incident_date: "2026-10-16", policy: headingWith(view, /^attendance/i), store: "dodge", person_evidence: evidenceFrom(view, "Quillane, Odessa") } };
      }));
      const thread = t.thread();
      for (const turn of [1, 2]) {
        const reply = await thread.say(T1);
        expect(thread.proposal?.employeeName, `turn ${turn}: no card:\n${reply.content}`).toBe("Odessa Quillane");
        expect(refusals, `turn ${turn}: propose_form refused the name find_staff takes as typed`).toEqual([]);
      }
    },
  },
]);
