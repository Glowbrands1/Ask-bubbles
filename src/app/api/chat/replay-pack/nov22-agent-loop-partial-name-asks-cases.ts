import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * A PARTIAL NAME NEVER SEATS SOMEONE ON A CARD WITHOUT ASKING (port of the sibling app's board f110, QA handoff 22 Nov 2026)
 * ============================================================================
 *
 * The sibling app's QA: "partial names still match staff". find_staff (and propose_form's own lookup) took any typed
 * word that STARTS a roster name as that person: "ca for Rowan Kes" seated Rowan Kestrel with no question; "ca for Row
 * Kes" got Rowan from find_staff, then "Who is this form for?". Same code in this app (`rosterMatches` reads prefixes).
 * #1017 here asks Did-you-mean for a close MISSPELLING; a prefix never reached that path. Rule (Pau's ruling A): a typed
 * word names a staff member only when it is a whole first, preferred or last name; a word that only starts one is a
 * Did-you-mean, unless the manager's own words hold the full name. Invented person: Avalind Haskett (on no fixture).
 */

const REPORT = "Sibling app's QA handoff 22 Nov 2026 (board f110): partial names still match staff";
const AVALIND: DirectoryRow = { id: "e-avalind-haskett", firstName: "Avalind", lastName: "Haskett", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };

type Found = { matches?: { employee_id?: string }[]; ask_exactly?: string; reason_code?: string };
type Proposed = { card?: unknown; employee_id?: string; ask_exactly?: string; reason_code?: string } | null;

/** The live model: find_staff with the typed name; one match → propose_form with its id; otherwise ask what find_staff says. */
async function ask(t: ReplayContext, said: string, typed: string, via: "find_staff" | "propose_form") {
  vi.setSystemTime(new Date("2026-11-22T15:00:00Z"));
  t.directory([...LOOP_STAFF, AVALIND]);
  t.as("location_manager", WEST_DODGE);
  const model = loopStandIn((view): LoopDecision => {
    const proposed = lastResult(view, "propose_form") as Proposed;
    if (proposed) return { text: proposed.ask_exactly ?? "Here's the card." };
    if (via === "propose_form") return { tool: "propose_form", input: { template_key: "dpoa", employee_name: typed, person_evidence: evidenceFrom(view, said), what_happened: "Avalind was late to open on 11/21.", incident_date: "2026-11-21" } };
    const found = lastResult(view, "find_staff") as Found | null;
    if (!found) return { tool: "find_staff", input: { name: typed, person_evidence: evidenceFrom(view, said) } };
    const only = found.matches?.length === 1 ? found.matches[0]!.employee_id : undefined;
    if (only) return { tool: "propose_form", input: { template_key: "dpoa", employee_id: only, what_happened: "Avalind was late to open on 11/21.", incident_date: "2026-11-21" } };
    return { text: found.ask_exactly ?? "Who is this form for?" };
  });
  t.loopModel!(model);
  const reply = await t.thread().say(said);
  const last = model.views.at(-1)!;
  return { found: lastResult(last, "find_staff") as Found | null, proposed: lastResult(last, "propose_form") as Proposed, reply };
}

const fixed = (id: string, title: string, run: (t: ReplayContext) => Promise<void>): ReplayCase => ({ id, title, report: REPORT, status: "fixed", run });

export const NOV22_AGENT_LOOP_PARTIAL_NAME_ASKS_CASES: ReplayCase[] = [
  fixed("nov22-partial-name-whole-first-partial-last-asks", "\"ca for Avalind Hask, late to open on 11/21\" (a whole first name, the start of a last name): find_staff asks \"Did you mean **Avalind Haskett**?\"; no card", async (t) => {
    const { found, proposed, reply } = await ask(t, "ca for Avalind Hask, late to open on 11/21", "Avalind Hask", "find_staff");
    expect(found?.matches ?? [], JSON.stringify(found)).toEqual([]);
    expect(found?.ask_exactly ?? "").toMatch(/Did you mean \*\*Avalind Haskett\*\*\?/);
    expect(proposed, `a card was made for a partial name:\n${reply.content}`).toBeNull();
    expect(reply.formProposal ?? null).toBeNull();
  }),
  fixed("nov22-partial-name-two-partial-words-asks", "\"ca for Ava Hask, late to open on 11/21\" (two partial words): find_staff gives no match and asks the Did-you-mean, never \"Who is this form for?\"", async (t) => {
    const { found, reply } = await ask(t, "ca for Ava Hask, late to open on 11/21", "Ava Hask", "find_staff");
    expect(found?.matches ?? [], JSON.stringify(found)).toEqual([]);
    expect(reply.content).toMatch(/Did you mean \*\*Avalind Haskett\*\*\?/);
    expect(reply.formProposal ?? null).toBeNull();
  }),
  fixed("nov22-partial-name-propose-form-asks", "propose_form with employee_name \"Avalind Hask\" (its own lookup): no card, the Did-you-mean is handed back", async (t) => {
    const { proposed, reply } = await ask(t, "ca for Avalind Hask, late to open on 11/21", "Avalind Hask", "propose_form");
    expect(proposed?.card ?? null, JSON.stringify(proposed)).toBeNull();
    expect(proposed?.ask_exactly ?? "").toMatch(/Did you mean \*\*Avalind Haskett\*\*\?/);
    expect(reply.formProposal ?? null).toBeNull();
  }),
  fixed("nov22-partial-name-whole-name-control", "Control: \"ca for Avalind, …\" and \"ca for Avalind Haskett, …\" (whole names) still make Avalind Haskett's card", async (t) => {
    for (const typed of ["Avalind", "Avalind Haskett"]) {
      const { found, reply } = await ask(t, `ca for ${typed}, late to open on 11/21`, typed, "find_staff");
      expect((found?.matches ?? []).map((row) => row.employee_id), typed).toEqual([AVALIND.id]);
      expect(reply.formProposal?.employeeName, reply.content).toBe("Avalind Haskett");
    }
  }),
  fixed("nov22-partial-name-model-shortened-control", "Control: the manager typed \"Avalind Haskett\" in full and the model looked up \"Avalind Hask\": that is Avalind (the manager's own words hold the full name), no question", async (t) => {
    const { found, reply } = await ask(t, "ca for avalind haskett, late to open on 11/21", "Avalind Hask", "find_staff");
    expect((found?.matches ?? []).map((row) => row.employee_id), JSON.stringify(found)).toEqual([AVALIND.id]);
    expect(reply.formProposal?.employeeName, reply.content).toBe("Avalind Haskett");
  }),
];
