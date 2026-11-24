import { expect, vi } from "vitest";

import type { ReplayCase, ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * "EMPIRE, SD" IS THE SIOUX FALLS W 41st St STORE; A PLACE NO STORE DATA NAMES, SAID AGAIN, GETS "DID YOU MEAN" (A7)
 * ============================================================================
 *
 * QA's Bubbles live re-runs (22 Nov 2026, A7), the manager's words (the person invented): T1 "do verbal for team member
 * <P> at empire, sd. payroll deduct does not apply. previous coaching jba manual 11-1-26. on 10-22-26 <P> was not
 * scheduled to work and came into the store to show her team her new puppy. <P> was in the store 45 min", T2 "jba manual
 * 11-1-25", T3 "cite pets in workplace", T4 "cite animals in the workplace policy", T5 "store location is empire, sd.
 * create corrective action". Every turn asked which store, and no Create appeared; T1's Observation read "… was not
 * scheduled to work at Empire, SD and came into the store …", and T5's card dropped the place again.
 *
 * Root cause: no store data named "Empire" (QA read woven_location_map: the W 41st St store is "SD Sioux Falls" in
 * Woven). Pau confirmed (22 Nov 2026, via QA): "Empire, SD" is the Sioux Falls W 41st St store. It is a reviewed company
 * nickname (`COMPANY_LOCATION_NICKNAMES`, read by the Woven-aware store index), so T1 is filed there with no question, the
 * store phrase leaves the account (R13, `withoutNamedSalon`) and T1 and T5 agree.
 *
 * CHANGED ON PURPOSE (Pau's confirmation): the earlier case here proved the "said again" pick with "empire, sd"; it now
 * proves it with a place no store data names ("maple ridge, sd", invented), unchanged otherwise.
 */

const REPORT = "QA's Bubbles live re-runs (22 Nov 2026, A7): \"empire, sd\" was asked about every turn and never gave a card that could Create";
const PERSON = { id: "e-wren-halvorsen", firstName: "Wren", lastName: "Halvorsen", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-338", "loc-225"], positionName: "Team Member Part Time" };
const SD_MANAGER = { level: "location", primaryAreaId: "loc-338", alsoCoversAreaIds: ["loc-225"] };
const GLOBAL = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const T1 = "do verbal for team member Wren Halvorsen at empire, sd. payroll deduct does not apply. previous coaching jba manual 11-1-26. on 10-22-26 Wren Halvorsen was not scheduled to work and came into the store to show her team her new puppy. Wren Halvorsen was in the store 45 min";
const T2 = "jba manual 11-1-25";
const T3 = "cite pets in workplace";
const T4 = "cite animals in the workplace policy";
const T5 = "store location is empire, sd. create corrective action";
/** The live model's account at T1 (production's, the person invented): the store phrase inside it. */
const LIVE_ACCOUNT = "On 10/22/26, Wren was not scheduled to work at Empire, SD and came into the store to show the team the new puppy. Wren was in the store 45 min.";

type Offer = { facts?: { typed_store_not_found?: { ask_exactly?: string; said_again?: boolean } } } | null;
const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";
const issueOf = (proposal: unknown) => (proposal as { issue?: string | null } | null)?.issue ?? "";
/** How many manager messages back the first one (T1, the request) is. */
const backToFirst = (view: LoopView) => Math.max(0, view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).length - 1);

function start(t: ReplayContext, scope: unknown = SD_MANAGER, role: "location_manager" | "admin" = "location_manager") {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...LOOP_STAFF, PERSON as never]);
  t.as(role, scope);
}

/** The live model: proposes with the place as the manager typed it (`place`), and says the app's store question as given. */
const live = (place: (message: string) => string) =>
  loopStandIn((view): LoopDecision => {
    const message = said(view);
    const result = lastResult(view, "propose_form") as Offer;
    if (result) return { text: result.facts?.typed_store_not_found?.ask_exactly ?? "Here's the Corrective Action Form for **Wren**." };
    return {
      tool: "propose_form",
      input: {
        template_key: "dpoa", employee_id: PERSON.id, what_happened: LIVE_ACCOUNT, incident_date: "2026-10-22",
        warning_level: "verbal", level_evidence: evidenceFrom(view, "do verbal", backToFirst(view)),
        policy: headingWith(view, /animals in the workplace/i) ?? headingWith(view, /standards of conduct/i), store: place(message),
        person_evidence: evidenceFrom(view, "Wren Halvorsen", backToFirst(view)),
      },
    };
  });

const empire = (scope: unknown, role: "location_manager" | "admin"): ReplayCase["run"] =>
  async (t: ReplayContext) => {
    start(t, scope, role);
    const model = live(() => "empire, sd");
    t.loopModel!(model);
    const thread = t.thread();
    const first = await thread.say(T1);
    expect(thread.proposal?.locationId, `T1 is not filed at the W 41st St store:\n${first.content}`).toBe("loc-225");
    expect(first.content, `T1 asked for the store:\n${first.content}`).not.toMatch(/isn't a store name I know|Did you mean|which one\?/i);
    expect(issueOf(thread.proposal), "the store phrase stayed in T1's Observation").not.toMatch(/empire|\bSD\b/i);
    const t1Issue = issueOf(thread.proposal);
    for (const turn of [T2, T3, T4]) await thread.say(turn);
    const last = await thread.say(T5);
    expect(thread.proposal?.locationId).toBe("loc-225");
    expect(last.content, `T5 asked for the store:\n${last.content}`).not.toMatch(/isn't a store name I know|Did you mean|can't match/i);
    expect(issueOf(thread.proposal), "T1 and T5 disagree on the Observation").toBe(t1Issue);
    expect(thread.proposal?.status, "no Create by T5").toBe("ready");
  };

export const NOV22_AGENT_LOOP_STORE_SAID_AGAIN_CASES: ReplayCase[] = [
  {
    id: "nov22-a7-empire-is-w-41st-st-store-manager",
    title: "A7 (Pau: Empire, SD is W 41st St): T1 \"… at empire, sd …\" is filed at the W 41st St store with no store question; the store phrase leaves the Observation, T5 \"store location is empire, sd. create corrective action\" agrees, and the card is ready (Sioux Falls manager)",
    report: REPORT,
    status: "fixed",
    run: empire(SD_MANAGER, "location_manager"),
  },
  {
    id: "nov22-a7-empire-is-w-41st-st-admin",
    title: "A7, an admin (global) login: the same turns — W 41st St, no question, the same Observation at T1 and T5, ready",
    report: REPORT,
    status: "fixed",
    run: empire(GLOBAL, "admin"),
  },
  {
    id: "nov22-a7-control-e-18th-st-still-e-18th",
    title: "A7, control: \"… at e 18th st. …\" is still the E 18th St store (the nickname takes nothing from the other Sioux Falls store)",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      t.loopModel!(live(() => "e 18th st"));
      const thread = t.thread();
      const reply = await thread.say(T1.replace("at empire, sd", "at e 18th st"));
      expect(thread.proposal?.locationId, `not filed at the E 18th St store:\n${reply.content}`).toBe("loc-338");
    },
  },
  {
    id: "nov22-a7-store-said-again-did-you-mean",
    title: "A7, control: a place no store data names (\"maple ridge, sd\"), said again at T5, asks \"Did you mean …?\" with the person's Woven stores and their street addresses; \"the w 41st st one\" makes the card at that store",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const unknown = (text: string) => text.replace(/empire, sd/g, "maple ridge, sd");
      const PICK = "the w 41st st one";
      t.loopModel!(live((message) => (message.startsWith(PICK) ? "Sioux Falls, SD (W 41st St)" : "maple ridge, sd")));
      const thread = t.thread();
      const first = await thread.say(unknown(T1));
      expect(first.content, `the first offer is not the person's Woven stores:\n${first.content}`).toMatch(/works at \*\*Sioux Falls, SD/);
      const again = await thread.say(unknown(T5));
      expect(again.content, `the pick names no street address:\n${again.content}`).toMatch(/4025 W 41st St/);
      expect(again.content, `no Did-you-mean pick:\n${again.content}`).toMatch(/Did you mean \*\*Sioux Falls, SD/);
      await thread.say(PICK);
      expect(thread.proposal?.locationId, "the pick did not make the card at that store").toBe("loc-225");
      expect(thread.proposal?.status, "the card cannot Create").toBe("ready");
    },
  },
];
