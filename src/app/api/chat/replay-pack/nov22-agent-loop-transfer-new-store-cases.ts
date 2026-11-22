import { expect, vi } from "vitest";

import type { DirectoryRow, ReplayCase, ReplayContext } from "./cases";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A TRANSFER'S NEW STORE IS ON THE FORM (QA's Bubbles round 2, 22 Nov 2026, U54)
 * ============================================================================
 *
 * The manager's turns, word for word (a global district manager, as in production; the person invented, on no
 * directory): "create transfer form for <P>", then "<P> is PT at 15/hr and wants to transfer to dawley effective
 * 11-2-26". The saved form had the pay, the status and the date, and no New Location: "dawley" is Woven's own name for the
 * E 18th St store ("SD Dawley Farms" in `woven_location_map`), which the form's reader does not read.
 *
 * Mechanism (`lib/forms/transfer-new-store.ts`): the model passes `new_store` with the manager's words for it; the tool
 * reads it through the Woven-aware store index, the card states the new store, and Create writes New Location after
 * checking the quote in the chat's manager turns and reading the words again.
 */

const REPORT = "QA's Bubbles round 2 (22 Nov 2026, U54): \"wants to transfer to dawley effective 11-2-26\" saved a Position Transfer Form with no New Location";
const GLOBAL = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const P: DirectoryRow = { id: "e-tamsin-ollerby", firstName: "Tamsin", lastName: "Ollerby", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-225"], positionName: "Team Member Part Time" };
const T2 = "create transfer form for Tamsin Ollerby";
const T3 = "Tamsin Ollerby is PT at 15/hr and wants to transfer to dawley effective 11-2-26";
const E_18TH = "Sioux Falls, SD (E 18th St)";

function start(t: ReplayContext, woven: boolean) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([P]);
  t.as("location_manager", GLOBAL);
  if (woven) t.wovenStoreNames!({ "loc-338": "SD Dawley Farms" });
}

const card = (view: LoopView) => (lastResult(view, "propose_form") as { card?: Record<string, unknown> } | null)?.card ?? null;

/** The live model's calls: the card on T2; on T3 the card again with where the person is moving (`newStore`). */
const live = (newStore: string | null, quote: string | null) =>
  loopStandIn((view): LoopDecision => {
    const asked = view.turns.filter((turn) => turn.role === "user").at(-1)?.text ?? "";
    if (!lastResult(view, "propose_form")) {
      const base = { template_key: "position-transfer", employee_id: P.id, person_evidence: evidenceFrom(view, "Tamsin Ollerby") };
      if (!asked.includes("transfer to")) return { tool: "propose_form", input: base };
      return { tool: "propose_form", input: { ...base, ...(newStore ? { new_store: newStore, new_store_evidence: evidenceFrom(view, quote ?? newStore) } : {}) } };
    }
    const shown = card(view);
    return { text: `Here's the Position Transfer Form for **Tamsin Ollerby**.${shown?.new_store ? ` New store: ${String(shown.new_store)}.` : ""}` };
  });

export const NOV22_AGENT_LOOP_TRANSFER_NEW_STORE_CASES: ReplayCase[] = [
  {
    id: "nov22-u54-transfer-to-woven-store-name-saved",
    title: "U54: \"… wants to transfer to dawley effective 11-2-26\" — the card states the new store (Woven's \"SD Dawley Farms\", the E 18th St store) and Create writes it on New Location",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t, true);
      const thread = t.thread();
      const model = live("dawley", "transfer to dawley");
      t.loopModel!(model);
      await thread.say(T2);
      await thread.say(T3);
      const shown = model.views.map(card).filter(Boolean).at(-1);
      expect(shown?.new_store, "the card does not state the new store").toBe(E_18TH);
      const id = await thread.create();
      expect(t.values(id).new_location, "New Location is blank on the saved form").toBe(E_18TH);
      expect(t.values(id).current_pay_rate ?? "", "the case lost the stated pay (proves nothing)").toMatch(/15/);
    },
  },
  {
    id: "nov22-u54-transfer-store-not-read-asks",
    title: "U54, a new store no store answers to (\"dawley\" with no Woven name mapped): never guessed — the card asks which store, and Create leaves New Location blank",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t, false);
      const thread = t.thread();
      const model = live("dawley", "transfer to dawley");
      t.loopModel!(model);
      await thread.say(T2);
      await thread.say(T3);
      const result = model.views.map((view) => lastResult(view, "propose_form")).filter(Boolean).at(-1) as { card?: Record<string, unknown>; facts?: Record<string, unknown> } | undefined;
      expect(result?.card?.new_store ?? null, "a store was guessed").toBeNull();
      expect(JSON.stringify(result?.facts ?? {}), "the card does not ask which store").toMatch(/new_store_not_found/);
      const id = await thread.create();
      expect(t.values(id).new_location ?? "", "a New Location nobody named was saved").toBe("");
    },
  },
  {
    id: "nov22-u54-transfer-store-quote-not-managers-kept-off",
    title: "U54, control: a new store whose quote is not the manager's words is not kept (nothing is written on New Location)",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t, true);
      const thread = t.thread();
      const model = live("dawley", "moving to SD Dawley Farms");
      t.loopModel!(model);
      await thread.say(T2);
      await thread.say(T3);
      const shown = model.views.map(card).filter(Boolean).at(-1);
      expect(shown?.new_store ?? null).toBeNull();
      const id = await thread.create();
      expect(t.values(id).new_location ?? "").toBe("");
    },
  },
];
