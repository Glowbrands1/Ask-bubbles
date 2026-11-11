import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * SURNAME_PARTICLES (QA's audit item 17b, 10 Nov 2026): a typed surname that opens with a particle was cut at it —
 * "maria de la cruz" became "maria de". With production's flags, "create a ca for marisol de la vega, she was late on
 * 11/3" (someone not on the roster) put **Marisol De** on the card. SURNAME_PARTICLES_ENABLED (default off) reads the
 * whole surname; its reader lines are in the protected forms/proposal.ts (Pau, "ok surname particles", 10 Nov 2026).
 * Invented person.
 */
const FIX = ["SURNAME_PARTICLES_ENABLED"];

/** The invented person, on the roster with the surname as typed ("de la Vega", "van der Vega"). */
function marisol(said: string): DirectoryRow {
  return {
    id: "e-sp-marisol",
    firstName: "Marisol",
    lastName: said.includes("van der") ? "van der Vega" : "de la Vega",
    preferredFirstName: null,
    employmentStatus: "active",
    locationIds: ["loc-264"],
    positionName: "Team Member Part Time",
  };
}

export const NOV10_SURNAME_PARTICLES_CASES: ReplayCase[] = [
  ["de-la", "create a ca for marisol de la vega, she was late on 11/3", /^marisol de la vega$/i],
  ["van-der", "create a coaching form for marisol van der vega, she was late on 11/3", /^marisol van der vega$/i],
].map(
  ([id, said, name]): ReplayCase => ({
    id: `nov10-surname-particles-${id as string}`,
    title: `"${said as string}": the card's employee is the whole name, never cut at the particle`,
    report: "QA's audit item 17b (10 Nov 2026): \"maria de la cruz\" → \"maria de\"",
    status: { open: "the card's employee stops at the particle (\"Marisol De\", \"Marisol Van\")" },
    fixFlags: FIX,
    // Pau's forms/proposal.ts lines are in ("ok surname particles", 10 Nov 2026): it holds with the fix flag, so the
    // fixStatus goes.
    // Open with the flag too until Pau's forms/proposal.ts lines land (docs/patches/surname-particles.patch).
    async run(t) {
      vi.setSystemTime(new Date("2026-11-09T09:00:00Z"));
      // Changed on purpose (11 Nov 2026, merging main after 16c): with the roster-name set on, a name on no roster is
      // asked about before any card, so the person is on the roster here; the off-roster guard is below.
      t.directory([...STAFF, marisol(said as string)]);
      t.as("location_manager", WEST_DODGE);
      const reply = await t.thread().say(said as string);
      expect(reply.formProposal?.employeeName ?? null, reply.content).toMatch(name as RegExp);
    },
  }),
);

/* Off the roster (16c): the card never names a person cut at the particle; the name is asked for instead. */
export const NOV10_SURNAME_PARTICLES_OFF_ROSTER_CASES: ReplayCase[] = [
  {
    id: "nov10-surname-particles-off-roster-guard",
    title: "\"create a ca for marisol de la vega, she was late on 11/3\", nobody of that name on the roster: never \"Marisol De\" on a card",
    report: "QA's audit item 17b (10 Nov 2026), off the roster after 16c",
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      vi.setSystemTime(new Date("2026-11-09T09:00:00Z"));
      t.directory([...STAFF]);
      t.as("location_manager", WEST_DODGE);
      const reply = await t.thread().say("create a ca for marisol de la vega, she was late on 11/3");
      expect(reply.formProposal?.employeeName ?? "", reply.content).not.toMatch(/^marisol (?:de|van)$/i);
      expect(reply.content).not.toMatch(/\*\*Marisol De\*\*/i);
    },
  },
];
