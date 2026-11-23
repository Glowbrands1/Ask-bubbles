import { expect, vi } from "vitest";

import type { DirectoryRow, ReplayCase, ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE CARD'S STORE, REWORDED INTO ITS ACCOUNT, GOES BACK ONCE (QA's Bubbles live re-run, 22 Nov 2026, A7 follow-up)
 * ============================================================================
 *
 * After #1046 ("Empire, SD" is the W 41st St store), the live model sometimes wrote the store into the Observation
 * mid-sentence: "On 10/22/26 Wren was not scheduled to work and came into the store at Empire to show the team the new
 * puppy." No whole-phrase strip reads that (#869: "at kearney high" is no store). QA's option 2: propose_form names the
 * phrase the store reader matched as the card's store in the manager's own words when it is still in what_happened
 * (`store_phrase_in_account`), and the reply is handed back once (`agent-loop/store-phrase.ts`, `run.ts`). The store reader
 * decides; never a word list. Control: a manager who also used the place another way ("she was at kearney high to show
 * …") is never flagged, and that account stays.
 */

const REPORT = "QA's Bubbles live re-run (22 Nov 2026, A7 follow-up): the card's store reworded into the Observation mid-sentence (\"… came into the store at Empire to show the team …\")";
const WREN: DirectoryRow = { id: "e-wren-halvorsen", firstName: "Wren", lastName: "Halvorsen", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-338", "loc-225"], positionName: "Team Member Part Time" };
const ODILE: DirectoryRow = { id: "e-odile-varga", firstName: "Odile", lastName: "Varga", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66"], positionName: "Team Member Part Time" };
const BRAM: DirectoryRow = { id: "e-bram-teller", firstName: "Bram", lastName: "Teller", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };

const handedBack = (view: LoopView) => view.turns.some((turn) => /^\[app check\]/.test(turn.text) && /still names its store/.test(turn.text));
const issueOf = (proposal: unknown) => (proposal as { issue?: string | null } | null)?.issue ?? "";

/** The live model: the account with the store reworded in (`worded`); handed back, the same account without it (`plain`). */
const live = (person: DirectoryRow, store: string, worded: string, plain: string) =>
  loopStandIn((view): LoopDecision => {
    if (lastResult(view, "propose_form")) return { text: `Here's the Corrective Action Form for **${person.firstName}**.` };
    return {
      tool: "propose_form",
      input: {
        template_key: "dpoa", employee_id: person.id, store, what_happened: handedBack(view) ? plain : worded,
        policy: headingWith(view, /standards of conduct/i), person_evidence: evidenceFrom(view, person.firstName),
      },
    };
  });

function start(t: ReplayContext, person: DirectoryRow, scope: unknown) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...LOOP_STAFF, person]);
  t.as("location_manager", scope);
}

export const NOV22_AGENT_LOOP_STORE_PHRASE_LEFT_CASES: ReplayCase[] = [
  {
    id: "nov22-a7-store-phrase-reworded-handed-back-empire",
    title: "A7 follow-up: \"do verbal for team member <P> at empire, sd. …\" with the account \"… came into the store at Empire to show the team …\" — handed back once; the card's Observation no longer names Empire",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t, WREN, { level: "location", primaryAreaId: "loc-338", alsoCoversAreaIds: ["loc-225"] });
      const model = live(
        WREN,
        "empire, sd",
        "On 10/22/26 Wren was not scheduled to work and came into the store at Empire to show the team the new puppy. Wren was in the store 45 min.",
        "On 10/22/26 Wren was not scheduled to work and came into the store to show the team the new puppy. Wren was in the store 45 min.",
      );
      t.loopModel!(model);
      const thread = t.thread();
      await thread.say("do verbal for team member Wren Halvorsen at empire, sd. payroll deduct does not apply. previous coaching jba manual 11-1-26. on 10-22-26 Wren Halvorsen was not scheduled to work and came into the store to show her team her new puppy. Wren Halvorsen was in the store 45 min");
      expect(thread.proposal?.locationId, "the case proves nothing: the card is not at the W 41st St store").toBe("loc-225");
      /* The stand-in puts the phrase in on purpose, so the hand-back is its own path (#1062): checked only when it plays; live, the Observation the manager sees is checked. */
      if (!model.live) expect(model.views.some(handedBack), "the store phrase left in the account was never handed back").toBe(true);
      expect(issueOf(thread.proposal), "the Observation still names the store").not.toMatch(/empire/i);
    },
  },
  {
    id: "nov22-a7-store-phrase-reworded-handed-back-street-form",
    title: "A7 follow-up, another store's street form: \"ca for <P> at west dodge. …\" with the account \"<P> was at West Dodge measuring product wrong …\" — handed back once; the Observation no longer names West Dodge",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t, BRAM, { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] });
      const model = live(BRAM, "west dodge", "On 11/20 Bram was at West Dodge measuring product wrong for an hour.", "On 11/20 Bram was measuring product wrong for an hour.");
      t.loopModel!(model);
      const thread = t.thread();
      await thread.say("ca for Bram Teller at west dodge. on 11/20 he was measuring product wrong for an hour");
      expect(thread.proposal?.locationId, "the case proves nothing: the card is not at the West Dodge store").toBe("loc-264");
      /* The stand-in puts the phrase in on purpose, so the hand-back is its own path (#1062): checked only when it plays; live, the Observation the manager sees is checked. */
      if (!model.live) expect(model.views.some(handedBack), "the store phrase left in the account was never handed back").toBe(true);
      expect(issueOf(thread.proposal)).not.toMatch(/dodge/i);
    },
  },
  {
    id: "nov22-a7-store-phrase-control-other-use-stays",
    title: "A7 follow-up, control: \"ca for <P> at kearney. she was at kearney high to show the team her puppy\" — the manager used the place another way too, so nothing is handed back and \"at kearney high\" stays in the account",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t, ODILE, { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] });
      const account = "On 11/20 Odile was at kearney high to show the team her puppy.";
      const model = live(ODILE, "kearney", account, account);
      /* The control's condition is the stand-in's input (an account that keeps "at kearney high"): it plays in live runs too (#1062). */
      t.loopModel!(model, { scripted: true });
      const thread = t.thread();
      await thread.say("ca for Odile Varga at kearney. on 11/20 she was at kearney high to show the team her puppy");
      expect(model.views.some(handedBack), "a place the manager also used another way was handed back").toBe(false);
      expect(issueOf(thread.proposal)).toMatch(/at kearney high to show/);
    },
  },
];
