import { expect, vi } from "vitest";

import type { ReplayCase, ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * A PLACE THE APP CAN'T MATCH, SAID AGAIN, GETS A "DID YOU MEAN" PICK OF THE PERSON'S STORES (A7)
 * ============================================================================
 *
 * QA's Bubbles live re-run (22 Nov 2026, A7), the manager's words (the person invented): T1 "do verbal for team member
 * <P> at empire, sd. …", T5 "store location is empire, sd. create corrective action". Each turn answered "'Empire, SD'
 * isn't a store name I know … W 41st St or E 18th St?" and never got further; no Create. No store data the app holds
 * says "Empire" (QA read woven_location_map: the W 41st St store is "SD Sioux Falls" in Woven), so nothing can match
 * it by data. Now: the offer names each store's street address from the app's own store data, the typed store is read
 * with the Woven-aware store index (as the regular chat path), and the same place said again gets "Did you mean …?"
 * with the person's own Woven stores, never the same question; the pick makes the card.
 */

const REPORT = "QA's Bubbles live re-run (22 Nov 2026, A7): \"empire, sd\" got the same \"isn't a store name I know\" question every turn and never a card that could Create";
const PERSON = { id: "e-wren-halvorsen", firstName: "Wren", lastName: "Halvorsen", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-338", "loc-225"], positionName: "Team Member Part Time" };
const SD_MANAGER = { level: "location", primaryAreaId: "loc-338", alsoCoversAreaIds: ["loc-225"] };
const T1 = "do verbal for team member Wren Halvorsen at empire, sd. payroll deduct does not apply. previous coaching jba manual 11-1-26. on 10-22-26 Wren Halvorsen was not scheduled to work and came into the store to show her team her new puppy. Wren Halvorsen was in the store 45 min";
const T5 = "store location is empire, sd. create corrective action";
const PICK = "the w 41st st one";
const ACCOUNT = "Wren Halvorsen was not scheduled to work on 10/22/26 and came into the store to show her team her new puppy; she was in the store 45 minutes.";

type Offer = { facts?: { typed_store_not_found?: { ask_exactly?: string; said_again?: boolean } } } | null;

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...LOOP_STAFF, PERSON as never]);
  t.as("location_manager", SD_MANAGER);
}

/** The live model: proposes with the place as the manager typed it, then says the app's store question as given. */
const live = () =>
  loopStandIn((view): LoopDecision => {
    const said = view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";
    const result = lastResult(view, "propose_form") as Offer;
    if (result) return { text: result.facts?.typed_store_not_found?.ask_exactly ?? "Here's the Corrective Action Form for **Wren**." };
    const store = said.startsWith(PICK) ? "Sioux Falls, SD (W 41st St)" : "empire, sd";
    return { tool: "propose_form", input: { template_key: "dpoa", employee_id: PERSON.id, what_happened: ACCOUNT, incident_date: "2026-10-22", policy: headingWith(view, /standards of conduct/i), store, person_evidence: evidenceFrom(view, "Wren Halvorsen", said.startsWith(T1.slice(0, 20)) ? 0 : said.startsWith("store") ? 1 : 2) } };
  });

export const NOV22_AGENT_LOOP_STORE_SAID_AGAIN_CASES: ReplayCase[] = [
  {
    id: "nov22-a7-store-said-again-did-you-mean",
    title: "A7: T1 \"… at empire, sd …\" offers the person's stores with their street addresses; T5 \"store location is empire, sd. create corrective action\" asks \"Did you mean …?\" with her Woven stores (not the same question); \"the w 41st st one\" makes the card at that store",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      t.loopModel!(live());
      const thread = t.thread();
      const first = await thread.say(T1);
      expect(first.content, `the first offer names no street address:\n${first.content}`).toMatch(/4025 W 41st St/);
      const again = await thread.say(T5);
      expect(again.content, `the same question again:\n${again.content}`).not.toMatch(/isn't a store name I know/);
      expect(again.content, `no Did-you-mean pick:\n${again.content}`).toMatch(/Did you mean \*\*Sioux Falls, SD/);
      await thread.say(PICK);
      expect(thread.proposal?.locationId, "the pick did not make the card at that store").toBe("loc-225");
      expect(thread.proposal?.status, "the card cannot Create").toBe("ready");
    },
  },
];
