import { expect, vi } from "vitest";

import { STAFF, TWO_STORES, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * OCTOBER TRIAGE #6 — "DODGE NE" NAMES THE WEST DODGE STORE (#186)
 * ============================================================================
 *
 * The triage table (two-store manager, the employee invented and off the roster): "create a ca for <employee> at
 * dodge ne, she was late today" got "I won't choose which store this belongs to. Which store is this about?".
 * STORE_ALIAS_ENABLED (`stores/resolver.ts`): a store's road with its state names that store.
 */

const TURNS = [
  "create a ca for marisol pennick at dodge ne, she was late today",
  "create a ca for marisol pennick at dodge, ne, she was late today",
];

export const STORE_ALIAS_FIX = "STORE_ALIAS_ENABLED";

export const NOV10_STORE_ALIAS_CASES: ReplayCase[] = TURNS.map((said, i) => ({
  id: `nov10-store-alias-dodge-ne-${i + 1}`,
  title: `#6: "${said}" (two-store manager) → the West Dodge store, no "Which store" question`,
  report: `October triage #6 (#186): "create a ca for <employee> at dodge ne, she was late today" → "I won't choose which store this belongs to. Which store is this about?"`,
  // "at dodge, ne," is already read with production's flags; kept as the guard that the flag changes nothing there.
  status: i === 0 ? { open: "Which store is this about?" } : ("fixed" as const),
  fixFlags: [STORE_ALIAS_FIX],
  async run(t) {
    vi.setSystemTime(new Date("2026-10-26T15:00:00Z"));
    t.directory([...STAFF]);
    t.as("location_manager", TWO_STORES);
    const thread = t.thread();
    const reply = await thread.say(said);
    expect(reply.content).not.toMatch(/Which store is this about\?/i);
    expect(thread.proposal?.locationId ?? null, reply.content).toBe("loc-264");
  },
}));
