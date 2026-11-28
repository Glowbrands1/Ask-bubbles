import { expect, vi } from "vitest";

import { WEST_DODGE, STAFF, type ReplayCase, type ReplayContext } from "./cases";
import { lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A STAFF-LIST OUTAGE IS NEVER "NOT ON THE STAFF LIST" (E1, owner's review, 28 Nov 2026)
 * ============================================================================
 *
 * The owner's review: when the roster read fails (an error or a timeout), the chat tells the manager the person isn't
 * on the staff list. The scoped roster reader never throws (a directory outage must not stop a form), so the loop read
 * the outage as an empty roster: find_staff answered not_on_roster and the reply said "I can't find <name> on your
 * staff list". It must say the staff list couldn't be checked right now. The manager's words are invented (the review
 * named the behaviour, not a chat); Marnie Holloway is the pack's invented staff member, on the list.
 */
const REPORT = "Owner's review (28 Nov 2026): when the roster/staff read fails (error or timeout), the chat tells the manager the person isn't on the staff list";
const SAID = "write up Marnie Holloway for being late again today";
const OFF_ROSTER = /(?:isn['’]t|is not|not) on (?:your|the) [^.\n]{0,40}staff list|can['’]t find \*\*[^*]+\*\* on your staff list/i;

const lookUpFirst = () =>
  loopStandIn((view: LoopView): LoopDecision => {
    const staff = lastResult(view, "find_staff") as { reason_code?: string; error?: string; not_on_roster?: string; ask_exactly?: string } | null;
    if (!staff) return { tool: "find_staff", input: { name: "Marnie Holloway", person_evidence: { message_id: view.turns.at(-1)?.messageIds?.at(-1) ?? "m1", quote: "Marnie Holloway" } } };
    // What a live model says with each answer: the tool's own words.
    if (staff.reason_code === "roster_failed") return { text: "I couldn't check the staff list just now, so I can't look up Marnie Holloway yet. Please try again in a moment." };
    return { text: staff.ask_exactly ?? `I can't find **${staff.not_on_roster}** on your staff list.` };
  });

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-28T16:00:00Z"));
  t.directory([...STAFF]);
  t.as("location_manager", WEST_DODGE);
}

export const NOV28_ROSTER_OUTAGE_NOT_OFF_ROSTER_CASES: ReplayCase[] = [
  {
    id: "nov28-roster-outage-find-staff-says-unchecked",
    title: `"${SAID}" while the staff list cannot be read: find_staff says the list could not be checked, never not_on_roster`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      if (!t.loopOn?.() || process.env.AGENT_LOOP_LIVE === "1") return;
      start(t);
      t.rosterFails!();
      const standIn = lookUpFirst();
      t.loopModel!(standIn);
      const reply = await t.thread().say(SAID);
      const staff = standIn.views.map((view) => lastResult(view, "find_staff")).find(Boolean) as { reason_code?: string; error?: string; not_on_roster?: string } | null;
      expect(staff?.reason_code, `find_staff:\n${JSON.stringify(staff)}`).toBe("roster_failed");
      expect(staff?.not_on_roster).toBeUndefined();
      expect(staff?.error ?? "").toMatch(/staff list could not be checked/i);
      expect(reply.content, reply.content).not.toMatch(OFF_ROSTER);
    },
  },
  {
    id: "nov28-roster-outage-propose-form-says-unchecked",
    title: `"${SAID}" while the staff list cannot be read, the card proposed straight away: propose_form refuses as unchecked, never "not on your staff list"`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      if (!t.loopOn?.() || process.env.AGENT_LOOP_LIVE === "1") return;
      start(t);
      t.rosterFails!();
      const standIn = loopStandIn((view: LoopView): LoopDecision => {
        const card = lastResult(view, "propose_form") as { reason_code?: string; error?: string; ask_exactly?: string } | null;
        if (!card) return { tool: "propose_form", input: { template_key: "dpoa", employee_name: "Marnie Holloway", person_evidence: { message_id: view.turns.at(-1)?.messageIds?.at(-1) ?? "m1", quote: "Marnie Holloway" } } };
        return { text: card.reason_code === "roster_failed" ? "I couldn't check the staff list just now. Please try again in a moment." : card.ask_exactly ?? "Here is the form." };
      });
      t.loopModel!(standIn);
      const reply = await t.thread().say(SAID);
      const card = standIn.views.map((view) => lastResult(view, "propose_form")).find(Boolean) as { reason_code?: string } | null;
      expect(card?.reason_code, `propose_form:\n${JSON.stringify(card)}`).toBe("roster_failed");
      expect(reply.content, reply.content).not.toMatch(OFF_ROSTER);
    },
  },
];
