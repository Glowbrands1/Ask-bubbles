import { expect, vi } from "vitest";

import { STAFF, TWO_STORES, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * A STORE NAMED THE MANAGERS' WAY ("dodge ne") IS READ AS ITS ROSTER NAME (October rebuild 5, #186, 10 Nov 2026)
 * ============================================================================
 *
 * QA, Bubbles production, 25–26 Oct 2026 (#186, never merged): "dodge ne", "dodge, ne" and "dodge ne location" left
 * the store Not set. QA's October triage (docs/parity-log/oct-pr-triage.md, 10 Nov 2026), a two-store manager and a
 * person not in the directory: "create a ca for <off-roster> at dodge ne, she was late today" gets "Which store is this
 * about?". On main f53c409a a bare "dodge" already sets the store; the cases below do not. People invented.
 */
const FLAG = "STORE_ALIAS_ENABLED";
const DODGE = "loc-264";
const REPORT = "QA, Bubbles production, 25-26 Oct 2026 (#186; the October triage, 10 Nov 2026), a two-store manager, a person not in the directory";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-10-25T15:00:00Z"));
  t.directory([...STAFF]);
  t.as("location_manager", TWO_STORES);
  return t.thread();
}

const WORDINGS: readonly { key: string; turns: readonly string[] }[] = [
  { key: "at-dodge-ne", turns: ["create a ca for kira dunmore at dodge ne, she was late today"] },
  { key: "dodge-ne-location", turns: ["create a ca for kira dunmore, dodge ne location, she was late today"] },
  { key: "bare-dodge-comma-ne", turns: ["create a ca for kira dunmore, she was late today", "dodge, ne"] },
  { key: "bare-Dodge-comma-NE", turns: ["create a ca for kira dunmore, she was late today", "Dodge, NE"] },
];

export const NOV10_STORE_ALIAS_CASES: ReplayCase[] = WORDINGS.map((wording) => ({
  id: `nov10-store-alias-${wording.key}`,
  title: `${wording.turns.map((turn) => `"${turn}"`).join(" → ")} — the card's store is Omaha NE (West Dodge Rd)`,
  report: `${REPORT}; ${wording.key}`,
  status: { open: "the store the manager named is not read: no store on the card" },
  fixFlags: [FLAG],
  // The read step is wired in server-ask.ts (coding 2): it holds with the fix flag, so the fixStatus goes.
  async run(t: ReplayContext) {
    const thread = start(t);
    let reply = "";
    for (const turn of wording.turns) reply = (await thread.say(turn)).content;
    expect((thread.proposal as { locationId?: string | null } | null)?.locationId ?? null, `the card's store:\n${reply}`).toBe(DODGE);
  },
}));

/*
 * Gate-Bubbles-3 (R735, 12 Nov 2026): turn 1 is the off-roster ask ("I can't find **Kira Dunmore** … reply **use Kira
 * Dunmore**"); "dodge, ne" made a card for "kira dunmore" in lowercase, skipping the confirmation. A store answer to that
 * ask is only the store: the name stays unconfirmed and the ask is made again; "use Kira Dunmore" then confirms it, with
 * the store kept.
 */
export const NOV12_STORE_ALIAS_OFF_ROSTER_CASES: ReplayCase[] = (["dodge, ne", "Dodge, NE"] as const).map((store) => ({
  id: `nov12-store-alias-off-roster-ask-${store === "dodge, ne" ? "lower" : "sentence"}`,
  title: `"create a ca for kira dunmore, she was late today" → "${store}" → "use Kira Dunmore": the store answer never confirms the name`,
  report: `Gate-Bubbles-3 R735 (12 Nov 2026), ${REPORT}`,
  status: "fixed",
  fixFlags: [FLAG],
  async run(t: ReplayContext) {
    const thread = start(t);
    const asked = await thread.say("create a ca for kira dunmore, she was late today");
    expect(asked.content, "no off-roster ask").toMatch(/reply \*\*use Kira Dunmore\*\*/);
    const answered = await thread.say(store);
    expect(answered.content, `the store answer skipped the "use <name>" confirmation:\n${answered.content}`).toMatch(/reply \*\*use Kira Dunmore\*\*/);
    expect(answered.content, `a card for the lowercase name:\n${answered.content}`).not.toMatch(/\*\*kira dunmore\*\*/);
    expect((thread.proposal as { employeeName?: string | null } | null)?.employeeName ?? null, "the name was confirmed by a store answer").toBeNull();
    const confirmed = await thread.say("use Kira Dunmore");
    expect((thread.proposal as { employeeName?: string | null } | null)?.employeeName ?? null, `"use Kira Dunmore" did not confirm:\n${confirmed.content}`).toBe("Kira Dunmore");
    expect((thread.proposal as { locationId?: string | null } | null)?.locationId ?? null, `the store was lost:\n${confirmed.content}`).toBe(DODGE);
  },
}));
