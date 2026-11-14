import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * WHAT A LATER TURN ADDS TO THE CARD: ITS FACT, NEVER A HEDGE, LEVEL, TITLE, PLACE, HISTORY OR DENIAL
 * (CARD_ACCOUNT_DROPS_NON_FACTS_ENABLED, with production's CARD_CHECKED_AGAINST_WORDS)
 * ============================================================================
 *
 * v2-Gate-Sunny-3's 78 probes (14 Nov 2026; record: ask-sunny claude/gate-sunny-3-records,
 * docs/gate-records/sunny-3/card-added-fact-78-probes.txt), in the gate's wording with this app's words (customer, store,
 * Team Member). An open card "create a CA for Marnie Holloway, she was late on 11/3/26", then one turn. Each row: the
 * card's "Added" note and its Issue. "open": what production does today (the fix turns it). The person is the pack's
 * invented one.
 */

const OPEN_CARD = "create a CA for Marnie Holloway, she was late on 11/3/26";
const BEFORE = "she was late on 11/3/26";
const FLAG = "CARD_ACCOUNT_DROPS_NON_FACTS_ENABLED";
const REPORT = "v2-Gate-Sunny-3's card-added-fact probes (14 Nov 2026), via QA";

interface Row {
  readonly said: string;
  /** The Added note's text with the fix; null: no Added note. */
  readonly added: string | null;
  /** What production shows today, when it differs. */
  readonly open?: string;
}

const ROWS: readonly Row[] = [
  // 3b: the Added note kept a clause that is no fact.
  { said: "she yelled at a customer i guess", added: "she yelled at a customer", open: "Added keeps \"i guess\"" },
  { said: "she yelled at a customer, maybe twice", added: "she yelled at a customer", open: "Added keeps \", maybe twice\"" },
  { said: "she yelled at a customer as a TM", added: "she yelled at a customer", open: "Added keeps \"as a TM\"" },
  { said: "she works as a team member and yelled at a customer", added: "she yelled at a customer", open: "Added keeps \"she works as a team member\"" },
  { said: "she yelled at a customer at west dodge", added: "she yelled at a customer", open: "Added keeps the store" },
  { said: "she had a verbal last month", added: null, open: "history added as a fact" },
  { said: "she has been late 3 times this month", added: null, open: "history added as a fact" },
  { said: "she was previously warned about her phone", added: null, open: "history added as a fact" },
  { said: "she was late at the west dodge store", added: null, open: "Added repeats the lateness with the store" },
  // NEG: a denied fault is no fact.
  { said: "she was not late, she yelled at a customer", added: "she yelled at a customer", open: "Added keeps \"she was not late\"" },
  { said: "she didn't yell at a customer", added: null, open: "a denial added as a fact" },
  // 3a / 3d: a fact behind a lead was lost.
  { said: "also she didn't clean", added: "she didn't clean", open: "the fact is lost" },
  { said: "make it a written warning, she yelled at a customer", added: "she yelled at a customer", open: "the fact is lost" },
  { said: "this is a final warning she yelled at a customer", added: "she yelled at a customer", open: "the fact is lost" },
  // Guards: already right on production, and kept right.
  { said: "she yelled at a customer, written", added: "she yelled at a customer" },
  { said: "she yelled at a customer and was coached on 10/15 for attitude", added: "she yelled at a customer" },
  { said: "she maybe forgot", added: null },
  { said: "i think she yelled at a customer", added: null },
  { said: "she might have yelled at a customer", added: null },
  { said: "not sure but she yelled at a customer", added: null },
  { said: "apparently she yelled at a customer", added: null },
  { said: "last week she also yelled at a customer", added: null },
  { said: "it happened at west dodge", added: null },
  { said: "she owes $25 for the late opening", added: null },
  { said: "it was on 11/3", added: null },
  { said: "she yelled at a customer", added: "she yelled at a customer" },
  { said: "she did not clean the counter", added: "she did not clean the counter" },
  { said: "she didn't answer the phone", added: "she didn't answer the phone" },
  { said: "she was on her phone at the register", added: "she was on her phone at the register" },
];

export const NOV14_CARD_ADDED_FACTS_PROBES_CASES: ReplayCase[] = ROWS.map((row, index) => ({
  id: `nov14-card-added-facts-probe-${index + 1}`,
  title: `"${OPEN_CARD}" then "${row.said}": ${row.added === null ? "nothing is added" : `the card adds "${row.added}"`}`,
  report: REPORT,
  status: row.open ? { open: row.open } : "fixed",
  fixFlags: [FLAG],
  async run(t) {
    vi.setSystemTime(new Date("2026-11-13T16:00:00Z"));
    t.directory(STAFF);
    t.as("location_manager", WEST_DODGE);
    const thread = t.thread();
    await thread.say(OPEN_CARD);
    const reply = await thread.say(row.said);
    const issue = String((thread.proposal as Record<string, unknown> | null)?.issue ?? "");
    const added = (reply.content.match(/^\*\*Added to [^*]+:\*\*\s*(.*)$/m) ?? [])[1] ?? null;
    expect(added, `the Added note:\n${reply.content}`).toBe(row.added);
    expect(issue, `the card's Issue:\n${reply.content}`).toBe(row.added === null ? BEFORE : `${BEFORE}; ${row.added}`);
  },
}));
