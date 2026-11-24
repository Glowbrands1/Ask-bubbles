import { expect, vi } from "vitest";

import type { ReplayCase, ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE TEAM CARD'S STORE COMES ONLY FROM A PLACE THE MANAGER NAMED (QA's Bubbles live re-run, 22 Nov 2026, A8)
 * ============================================================================
 *
 * The manager's turns, verbatim (no names in them): T1 "can you create a coaching form for my whole staff?", T2
 * "coaching is on sfs operations for clean organization and flow. BCS has flagged our SFS …" (SFS: ship from store).
 * The reply after T2: "… Still need the store — which Sioux Falls location is this for, W 41st St or E 18th St?" No
 * store was named; the model read "SFS" as the city, and every later turn repeated the narrowed question. Now the team
 * card's result carries store_question (all stores, no guess) and a reply naming a store nobody named goes back once,
 * then asks the store question plainly (`agent-loop/store-guess.ts`, read with the app's own store reader).
 */

const REPORT = "QA's Bubbles live re-run (22 Nov 2026, A8): \"sfs operations\" (ship from store) narrowed the team card's store question to the two Sioux Falls stores";
const T1 = "can you create a coaching form for my whole staff?";
const T2 = "coaching is on sfs operations for clean organization and flow. BCS has flagged our SFS due to printing shipping labels within 0 minutes of printing packing slips. So we are implementing a new flow. when packing slips are printed, they will be clipped to a designated rolling rack, in order of receiving the orders, then those orders will be fulfilled in order, and placed back on the rack in their basket, once orders are all fulfilled, the rack will go back to the shipping station, packed, and then print the shipping label. Then, the next round of packing slips will be printed and clipped in order on the rack.";
const LIVE = "Updated the team card with the new SFS shipping/packing flow details. Still need the store — which Sioux Falls location is this for, W 41st St or E 18th St?";
const MANY_STORES = { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: ["loc-225", "loc-338"] };

const checkedBack = (view: LoopView) => view.turns.some((turn) => /^\[app check\]/.test(turn.text) && /named no such/.test(turn.text));

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T18:50:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", MANY_STORES);
}

/** The live model: coach_team each turn; after T2 it narrows the stores by "SFS" until handed back (`fixes`). */
const live = (fixes: boolean) =>
  loopStandIn((view): LoopDecision => {
    const said = view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";
    const result = lastResult(view, "coach_team") as { card?: { store_question?: string } } | null;
    if (!result) return { tool: "coach_team", input: {} };
    if (said.startsWith(T1)) return { text: `Here's the team Coaching card for all team members. ${result.card?.store_question ?? ""}`.trim() };
    return { text: checkedBack(view) && fixes ? `Updated the team card with the new shipping and packing flow. ${result.card?.store_question ?? "Which store is this for?"}` : LIVE };
  });

async function chat(t: ReplayContext, fixes: boolean) {
  start(t);
  t.loopModel!(live(fixes));
  const thread = t.thread();
  await thread.say(T1);
  expect((thread.proposal as { subject?: string } | null)?.subject, "T1 made no team card (the case proves nothing)").toBe("team");
  return thread.say(T2);
}

export const NOV22_AGENT_LOOP_TEAM_STORE_NEVER_GUESSED_CASES: ReplayCase[] = [
  {
    id: "nov22-a8-team-store-not-guessed-from-sfs",
    title: "A8: T2 \"coaching is on sfs operations … BCS has flagged our SFS …\" on the team card: the reply never narrows the store question to Sioux Falls; it asks which store",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const reply = await chat(t, true);
      expect(reply.content, `the reply guessed a store from "SFS":\n${reply.content}`).not.toMatch(/Sioux Falls|41st|18th/i);
      expect(reply.content).toMatch(/Which store is this for\?/);
    },
  },
  {
    id: "nov22-a8-team-store-guess-repeated-replaced",
    title: "A8: the model names the Sioux Falls stores again after the hand-back: that sentence is left out and the reply asks which store",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const reply = await chat(t, false);
      expect(reply.content, `the reply guessed a store from "SFS":\n${reply.content}`).not.toMatch(/Sioux Falls|41st|18th/i);
      expect(reply.content).toMatch(/Which store is this for\?/);
    },
  },
];
