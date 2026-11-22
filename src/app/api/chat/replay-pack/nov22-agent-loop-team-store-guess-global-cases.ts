import { expect, vi } from "vitest";

import type { ReplayCase, ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A GLOBAL LOGIN'S TEAM CARD NEVER NARROWS THE STORES FROM "SFS" EITHER (QA's Bubbles live re-run 2, 22 Nov 2026, A8)
 * ============================================================================
 *
 * QA's live re-run on production f9461c1 (a global login, the loop on), the manager's turns verbatim (no names in them):
 * T1 "can you create a coaching form for my whole staff?", T2 "coaching is on sfs operations for clean organization and
 * flow. BCS has flagged our SFS …" (SFS: ship from store). T2's reply, verbatim: "You have two Sioux Falls stores —
 * Sioux Falls, SD (W 41st St) and Sioux Falls, SD (E 18th St). Which one is this coaching for?", repeated to T5.
 *
 * Root cause: #1010's check (`store-guess.ts`) ran only on a team card waiting for its store (needs_location). A global
 * login's team card with no store is ready (a global login may file a form with no store), so the check never ran; the
 * pack's case used a three-store store manager. Now the check runs on any team card that holds no store. T3 "this is
 * perfect" and T4 "make that update" called no tool (production's trace: steps []) and repeated the narrowed question
 * ("Glad it looks right! I still just need to know which Sioux Falls store this is for — W 41st St or E 18th St — before
 * you can press Create."); the check had no card to read there. It now reads the team card shown under the last reply
 * from its card record. QA's ruling: any team card with no store carries store_question and store_note, from all the
 * manager's stores. The three-store control is nov22-a8-team-store-not-guessed-from-sfs.
 */

const REPORT = "QA's Bubbles live re-run 2 (22 Nov 2026, A8): a global login's T2 \"coaching is on sfs operations …\" still got \"You have two Sioux Falls stores — … Which one is this coaching for?\"";
const T1 = "can you create a coaching form for my whole staff?";
const T2 = "coaching is on sfs operations for clean organization and flow. BCS has flagged our SFS due to printing shipping labels within 0 minutes of printing packing slips. So we are implementing a new flow. when packing slips are printed, they will be clipped to a designated rolling rack, in order of receiving the orders, then those orders will be fulfilled in order, and placed back on the rack in their basket, once orders are all fulfilled, the rack will go back to the shipping station, packed, and then print the shipping label. Then, the next round of packing slips will be printed and clipped in order on the rack.";
const LIVE_T1 = "You have several stores, so I need to know which one this coaching is for. Which store should it cover?";
const LIVE_T2 =
  "You have two Sioux Falls stores — Sioux Falls, SD (W 41st St) and Sioux Falls, SD (E 18th St). Which one is this coaching for?\n\nThe team card now includes the new shipping-flow details (packing slips clipped to a rolling rack in order, fulfilled in order, rack returned to shipping station before printing labels). Once you confirm the store, it's ready for Create.";
const T3 = "this is perfect";
const LIVE_T3 = "Glad it looks right! I still just need to know which Sioux Falls store this is for — W 41st St or E 18th St — before you can press Create.";
const GLOBAL = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

const checkedBack = (view: LoopView) => view.turns.some((turn) => /^\[app check\]/.test(turn.text) && /named no such/.test(turn.text));

/** The live model: coach_team each turn; T1 asks for a store, T2 narrows to the two Sioux Falls stores (`fixes`: not after the hand-back). */
const live = (fixes: boolean) =>
  loopStandIn((view): LoopDecision => {
    const said = view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";
    /* T3 "this is perfect": no tool call this turn (production's trace). */
    if (said === T3) return { text: view.turns.some((turn) => /^\[app check\]/.test(turn.text) && /named no such/.test(turn.text)) && fixes ? "Glad it looks right! Which store is this for?" : LIVE_T3 };
    if (!lastResult(view, "coach_team")) return { tool: "coach_team", input: {} };
    if (said.startsWith(T1)) return { text: LIVE_T1 };
    return { text: checkedBack(view) && fixes ? "The team card now includes the new shipping-flow details. Which store is this for?" : LIVE_T2 };
  });

const scoped = (role: "location_manager" | "admin", fixes: boolean): ReplayCase["run"] =>
  async (t: ReplayContext) => {
    vi.setSystemTime(new Date("2026-11-21T18:50:00Z"));
    t.directory([...LOOP_STAFF]);
    t.as(role, GLOBAL);
    const model = live(fixes);
    t.loopModel!(model);
    const thread = t.thread();
    await thread.say(T1);
    expect((thread.proposal as { subject?: string } | null)?.subject, "T1 made no team card (the case proves nothing)").toBe("team");
    expect(thread.proposal?.locationId ?? null, "the team card already holds a store (the case proves nothing)").toBeNull();
    /* QA's ruling: a team card with no store, any scope, carries the plain store question for the reply to end with. */
    const first = model.views.map((view) => lastResult(view, "coach_team") as { card?: { store_question?: string } } | null).find(Boolean);
    expect(first?.card?.store_question, "the global team card with no store carries no store question").toBe("Which store is this for?");
    const reply = await thread.say(T2);
    expect(model.views.some(checkedBack), "the guessed stores were never handed back").toBe(true);
    expect(reply.content, `the reply narrowed the stores from "SFS":\n${reply.content}`).not.toMatch(/Sioux Falls|41st|18th/);
    expect(reply.content).toMatch(/shipping-flow details/);
    const views = model.views.length;
    const third = await thread.say(T3);
    expect(model.views.slice(views).some(checkedBack), "T3's narrowed question (no tool call) was never handed back").toBe(true);
    expect(third.content, `T3 narrowed the stores again:\n${third.content}`).not.toMatch(/Sioux Falls|41st|18th/);
  };

export const NOV22_AGENT_LOOP_TEAM_STORE_GUESS_GLOBAL_CASES: ReplayCase[] = [
  {
    id: "nov22-a8-global-team-store-not-guessed-from-sfs",
    title: "A8 (live re-run 2): a global district manager's T2 \"coaching is on sfs operations …\" — \"You have two Sioux Falls stores — …\" goes back once, and the reply names no store",
    report: REPORT,
    status: "fixed",
    run: scoped("location_manager", true),
  },
  {
    id: "nov22-a8-admin-team-store-guess-repeated-left-out",
    title: "A8 (live re-run 2): an admin's T2, the model repeating \"You have two Sioux Falls stores — …\" after the hand-back — the guessed sentence is left out and the store question asked plainly",
    report: REPORT,
    status: "fixed",
    run: scoped("admin", false),
  },
];
