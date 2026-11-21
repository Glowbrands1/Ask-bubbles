import { expect, vi } from "vitest";

import type { ChatFormProposal } from "@/types";

import type { DirectoryRow, ReplayCase, ReplayContext } from "./cases";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A STORE NICKNAME THE APP DOES NOT KNOW IS NEVER REFUSED IN A LOOP (QA's live re-test, 21 Nov 2026, item 10 / A7)
 * ============================================================================
 *
 * Pau's account, agent loop on: "do verbal for team member <A> at <nickname>, sd ..." and later "store location is
 * <nickname>, sd. create corrective action" got "isn't one of your stores" three times, offering other stores, and never
 * a card that could Create. propose_form refused any `store` it could not read (salon_unknown), so every answer that
 * repeated the nickname was refused again. QA's evidence: the person's Woven primary store was another store in the same
 * city than the nickname suggested, and the form the manager filed in the end was at the Woven store.
 *
 * Now a store the app cannot read is not a refusal: the card is made at the person's own Woven store, and the reply
 * offers it first ("<First> is at <store> in Woven — use that?") with the manager's other stores; "yes" (or a store's
 * name) answers it, and Create works. A nickname the company lists (`COMPANY_LOCATION_NICKNAMES`, empty until the owner
 * fills it) resolves as that store and asks nothing. Invented people; "bluffview" is an invented nickname.
 */

const REPORT = "QA's live re-test, 21 Nov 2026 (A7, Pau's account, loop on): \"do verbal for team member <A> at <nickname>, sd\" was refused as \"isn't one of your stores\" three times and never got a card that could Create";

/** A Store Manager over both Sioux Falls stores and the Omaha West Dodge store. */
const THREE_STORES = { level: "location", primaryAreaId: "loc-225", alsoCoversAreaIds: ["loc-338", "loc-264"] };
/** Invented. Woven lists her at both Sioux Falls stores; her primary store is the E 18th St one. */
const CORLISS: DirectoryRow = { id: "e-corliss-pellwright", firstName: "Corliss", lastName: "Pellwright", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-225", "loc-338"], positionName: "Team Member Part Time", primaryLocationId: "loc-338" };
/** Invented. Woven lists him at one store only. */
const ANSELM: DirectoryRow = { id: "e-anselm-quarry", firstName: "Anselm", lastName: "Quarry", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-225"], positionName: "Team Member Full Time", primaryLocationId: "loc-225" };

const E_18TH = "Sioux Falls, SD (E 18th St)";
const W_41ST = "Sioux Falls, SD (W 41st St)";
const DODGE = "Omaha, NE (West Dodge Rd)";

type Offer = { ask_exactly?: string; woven_stores?: string[]; other_stores?: string[] };
type Proposed = { error?: string; reason_code?: string; facts?: { typed_store_not_found?: Offer } } | null;

/** The rules book's line on answering the offer (instruction): the store chosen, by its name as offered. */
const ANSWER_LINE = /propose the same card again with store set to the name of the/;

/** The store the manager chose from the offer, as the rules book teaches the model to read it. */
function chosen(said: string, offer: Offer): string {
  const woven = offer.woven_stores ?? [];
  const all = [...woven, ...(offer.other_stores ?? [])];
  if (/^yes\b/i.test(said) && woven.length === 1) return woven[0]!;
  if (/\bfirst\b/i.test(said) && woven[0]) return woven[0];
  const word = said.toLowerCase().split(/\s+/).find((part) => all.some((store) => store.toLowerCase().includes(` ${part} `)) && part.length >= 3 && part !== "the" && part !== "one");
  return all.find((store) => word && store.toLowerCase().includes(` ${word} `)) ?? said;
}

/**
 * The live model: the nickname as the manager typed it; an answer to the offer as the store they chose, by its name as
 * offered, when the rules book's line is there to follow (else word for word); its reply is the offer's ask_exactly, or a
 * refusal said as "isn't one of your stores".
 */
function standIn(person: DirectoryRow) {
  const full = `${person.firstName} ${person.lastName}`;
  let offer: Offer | null = null;
  return loopStandIn((view: LoopView): LoopDecision => {
    const managerSaid = view.turns.filter((turn) => turn.role === "user");
    const said = managerSaid.at(-1)?.text ?? "";
    const result = lastResult(view, "propose_form") as Proposed;
    if (result?.facts?.typed_store_not_found) offer = result.facts.typed_store_not_found;
    if (result) return { text: result.error ? `That store isn't one of your stores. (${result.reason_code})` : result.facts?.typed_store_not_found?.ask_exactly ?? `Here's the Corrective Action Form for **${person.firstName}**.` };
    const answer = !/bluffview/i.test(said);
    return {
      tool: "propose_form",
      input: {
        template_key: "dpoa",
        employee_name: full,
        person_evidence: evidenceFrom(view, full, managerSaid.length - 1),
        what_happened: `${full} was 20 minutes late on 11/20.`,
        incident_date: "2026-11-20",
        store: answer ? (offer && ANSWER_LINE.test(view.system) ? chosen(said, offer) : said) : "bluffview, sd",
      },
    };
  });
}

function start(t: ReplayContext, person: DirectoryRow) {
  vi.setSystemTime(new Date("2026-11-21T17:10:00Z"));
  t.directory([CORLISS, ANSELM]);
  t.as("location_manager", THREE_STORES);
  t.loopModel!(standIn(person));
  return t.thread();
}

const said = (person: DirectoryRow) => `do verbal for team member ${person.firstName} ${person.lastName} at bluffview, sd for being 20 minutes late on 11/20`;
const AGAIN = "store location is bluffview, sd. create corrective action";
const REFUSED = /isn't one of your stores|salon_unknown/;

async function createdAt(t: ReplayContext, thread: ReturnType<ReplayContext["thread"]>, first: string): Promise<unknown> {
  t.draftWrites({ observation: `Observed:\n${first} was 20 minutes late on November 20, 2026.` });
  const id = await thread.create();
  return t.forms().find((row) => String(row.id) === id)?.location_id;
}

export const NOV21_AGENT_LOOP_STORE_NICKNAME_CASES: ReplayCase[] = [
  {
    id: "nov21-agent-loop-store-nickname-offers-both-woven-stores",
    title: `"${said(CORLISS)}" then "${AGAIN}": never "isn't one of your stores"; both of Corliss's Woven stores are offered, primary first, then the manager's other store; "the first one" and Create works`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      const thread = start(t, CORLISS);
      const offer = `**Corliss** works at **${E_18TH}** and **${W_41ST}** in Woven — which one? Your other stores: ${DODGE}.`;
      const first = await thread.say(said(CORLISS));
      expect(first.content, "the typed store was refused").not.toMatch(REFUSED);
      expect(first.content, "Corliss's Woven stores were not offered, primary first, then the manager's other store").toContain(offer);
      const again = await thread.say(AGAIN);
      expect(again.content, "the repeated nickname was refused again").not.toMatch(REFUSED);
      expect(again.content).toContain(offer);
      const picked = await thread.say("the first one");
      const card = (picked.formProposal ?? thread.proposal) as ChatFormProposal | null;
      expect(card?.locationId, picked.content).toBe("loc-338");
      expect(card?.status, "the card cannot Create").toBe("ready");
      expect(await createdAt(t, thread, "Corliss"), "the form was not filed at the store picked").toBe("loc-338");
    },
  },
  {
    id: "nov21-agent-loop-store-nickname-answered-by-street",
    title: `"${said(CORLISS)}", then "the 41st st one": the street picks that Woven store and Create works`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      const thread = start(t, CORLISS);
      await thread.say(said(CORLISS));
      const picked = await thread.say("the 41st st one");
      const card = (picked.formProposal ?? thread.proposal) as ChatFormProposal | null;
      expect(card?.locationId, picked.content).toBe("loc-225");
      expect(await createdAt(t, thread, "Corliss")).toBe("loc-225");
    },
  },
  {
    id: "nov21-agent-loop-store-nickname-one-woven-store-yes",
    title: `"${said(ANSELM)}": his one Woven store is offered ("use that?"), the manager's other stores after it; "yes" and Create works`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      const thread = start(t, ANSELM);
      const first = await thread.say(said(ANSELM));
      expect(first.content, "the typed store was refused").not.toMatch(REFUSED);
      expect(first.content).toContain(`**Anselm** is at **${W_41ST}** in Woven — use that? Your other stores: ${E_18TH}, ${DODGE}.`);
      const yes = await thread.say("yes");
      const card = (yes.formProposal ?? thread.proposal) as ChatFormProposal | null;
      expect(card?.locationId, yes.content).toBe("loc-225");
      expect(card?.status).toBe("ready");
      expect(await createdAt(t, thread, "Anselm")).toBe("loc-225");
    },
  },
];
