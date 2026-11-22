import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * A TYPED NAME'S POSSESSIVE NEVER KEEPS THE PERSON OFF THE ROSTER (port of the sibling app's #1246, ae03c3a; its 266-chat
 * run's 053/116/117/138/237/239, 22 Nov 2026)
 * ============================================================================
 *
 * The sibling's manager typed "<First> <Last>'s, today, - <First> …" and the live model passed the name as typed: the card
 * said "<First> <Last>'s isn't on your store's Woven staff list", for a person on it. Same matching code here.
 * Mechanism (`possessiveRead`, `employee-match.ts`): a trailing 's / ’s on the typed name leaves only when the name
 * without it is the one the roster matches; a surname ending in s is never touched. Invented people (on no fixture):
 * Corwenna Trelawny, and Bertil Vosskamps for the control.
 */

const REPORT = "Sibling app's 266-chat run (22 Nov 2026), its #1246: \"<First> <Last>'s\" carded as off the roster for a person on it";
const CORWENNA: DirectoryRow = { id: "e-corwenna-trelawny", firstName: "Corwenna", lastName: "Trelawny", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const BERTIL: DirectoryRow = { id: "e-bertil-vosskamps", firstName: "Bertil", lastName: "Vosskamps", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const T1 = "I need a corrective action for  f";
const T2 = (name: string) => `${name}, today, - she set up the soap display, then went into the back room and stayed there until the first customer arrived at 9:57am.`;

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF, CORWENNA, BERTIL]);
  t.as("location_manager", WEST_DODGE);
}

/** The live model: the card with the name exactly as the manager typed it, possessive included. */
function model(typed: string) {
  return loopStandIn((view): LoopDecision => {
    if (lastResult(view, "propose_form")) return { text: "Here's the Corrective Action Form." };
    if (!view.turns.some((turn) => turn.role === "user" && turn.text.includes(typed))) return { text: "Who is this Corrective Action Form for?" };
    return {
      tool: "propose_form",
      input: {
        template_key: "dpoa", employee_name: typed, person_evidence: evidenceFrom(view, typed),
        what_happened: "She set up the soap display, then went into the back room and stayed there until the first customer arrived at 9:57am.",
        incident_date: "2026-11-22",
      },
    };
  });
}

/* employeeRole comes from the roster row only: an off-roster name has none. */
const cardOf = (thread: { proposal?: unknown }) => thread.proposal as { employeeName?: string; employeeRole?: string | null } | undefined;

export const NOV22_AGENT_LOOP_POSSESSIVE_TYPED_NAME_CASES: ReplayCase[] = [
  ...["Corwenna Trelawny's", "Corwenna Trelawny’s"].map((typed): ReplayCase => ({
    id: `nov22-possessive-typed-name${typed.includes("’") ? "-curly" : ""}`,
    title: `Ported (#1246): "${typed}, today, - …": the card is for the roster's Corwenna Trelawny, never "${typed}" off the roster`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      if (process.env.AGENT_LOOP_LIVE === "1") return;
      start(t);
      t.loopModel!(model(typed));
      const thread = t.thread();
      await thread.say(T1);
      const reply = await thread.say(T2(typed));
      expect(cardOf(thread)?.employeeName, `the card keeps the possessive:\n${reply.content}`).toBe("Corwenna Trelawny");
      expect(cardOf(thread)?.employeeRole ?? null, "the card is not the roster's Corwenna Trelawny (no roster title)").toBe("Team Member Part Time");
    },
  })),
  {
    id: "nov22-possessive-typed-name-control-surname-ends-in-s",
    title: "Ported (#1246) control: \"Bertil Vosskamps, today, - …\": a surname ending in s is the roster's Bertil Vosskamps, untouched",
    report: REPORT,
    status: "fixed",
    async run(t) {
      if (process.env.AGENT_LOOP_LIVE === "1") return;
      start(t);
      t.loopModel!(model("Bertil Vosskamps"));
      const thread = t.thread();
      await thread.say(T1);
      await thread.say(T2("Bertil Vosskamps"));
      expect(cardOf(thread)?.employeeName).toBe("Bertil Vosskamps");
      expect(cardOf(thread)?.employeeRole ?? null).toBe("Team Member Part Time");
    },
  },
];
