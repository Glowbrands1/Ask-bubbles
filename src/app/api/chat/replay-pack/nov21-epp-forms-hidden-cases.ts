import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * THE SIX EPP FORMS ARE HIDDEN IN THIS APP (Pau, via QA2, 21 Nov 2026)
 * ============================================================================
 *
 * The EPP forms (sdit-epp, tsd-epp, asd-sdit-epp, fttc-epp, dmit-epp-tsd, dmit-epp-dmit) are the reference platform's
 * plans for roles Buff City Soap does not have; none has ever been saved here. Hidden (`config/company/forms/hidden.ts`):
 * asking chat for "an EPP" or "SDIT EPP" never opens one of them. Invented names only (STAFF's people).
 */
const EPP_KEYS = ["sdit-epp", "tsd-epp", "asd-sdit-epp", "fttc-epp", "dmit-epp-tsd", "dmit-epp-dmit"];
const REPORT = "Pau via QA2 (21 Nov 2026): hide all 6 EPP forms in Ask Bubbles";
const ASKS = [
  ["an-epp", "I need an EPP for Remy Calder"],
  ["sdit-epp", "Create an SDIT EPP for Remy Calder"],
  ["tsd-epp", "start a TSD EPP for Juno Paxton"],
  ["fttc-epp", "can you make an FTTC EPP for Rowan Kestrel"],
  ["dmit-epp", "DMIT EPP for Juno Paxton please"],
] as const;

export const NOV21_EPP_FORMS_HIDDEN_CASES: ReplayCase[] = ASKS.map(([key, said]) => ({
  id: `nov21-epp-hidden-${key}`,
  title: `"${said}": no EPP card opens (the six EPP forms are hidden in this app)`,
  report: REPORT,
  status: "fixed",
  async run(t) {
    vi.setSystemTime(new Date("2026-11-21T16:00:00Z"));
    t.directory(STAFF);
    // A district manager holds create_epp (a location manager never could create an EPP).
    t.as("district_manager", WEST_DODGE);
    const reply = await t.thread().say(said);
    const opened = reply.formProposal?.templateKey ?? null;
    expect(EPP_KEYS, `an EPP card opened (${opened}):\n${reply.content}`).not.toContain(opened);
  },
}));
