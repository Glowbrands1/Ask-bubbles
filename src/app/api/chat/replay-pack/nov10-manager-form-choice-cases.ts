import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * THE FORM THE MANAGER NAMED IS THE FORM (October rebuild 8, #181, 10 Nov 2026)
 * ============================================================================
 *
 * conv_mvofmpei2c50lhp (25 Oct 2026): "an employee opened the store 15 min late and needs CA" and "write ca" were
 * answered as questions about the process (no card), and "Create a form from this conversation." asked "Which form do
 * you need?". QA's October triage (docs/parity-log/oct-pr-triage.md, 10 Nov 2026), with production's flags: the same.
 * MANAGER_FORM_CHOICE_ENABLED (default off) reads them as the Corrective Action request; its one line in
 * `server-ask.ts` (Coding-2's file) is requested through QA, so the fix-flag run is expected to fail until it lands.
 */
const FLAG = "MANAGER_FORM_CHOICE_ENABLED";
const REPORT = "conv_mvofmpei2c50lhp, 25 Oct 2026 (#181; the October triage, 10 Nov 2026)";
const WIRING = "MANAGER_FORM_CHOICE's line in server-ask.ts awaits Coding-2 (requested through QA, 10 Nov 2026)";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-10T15:00:00Z"));
  t.directory([...STAFF]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

const isCa = (key: string | undefined) => key === "dpoa";

const TURNS = [
  { key: "needs-ca", text: "an employee opened the store 15 min late and needs CA" },
  { key: "write-ca", text: "write ca" },
] as const;

export const NOV10_MANAGER_FORM_CHOICE_CASES: ReplayCase[] = TURNS.flatMap((turn) =>
  ([
    ["lower", turn.text],
    ["sentence", turn.text[0]!.toUpperCase() + turn.text.slice(1)],
  ] as const).map(([casing, text]) => ({
    id: `nov10-manager-form-choice-${turn.key}-${casing}`,
    title: `"${text}" gives the Corrective Action card; "Create a form from this conversation." keeps it`,
    report: `${REPORT}; ${turn.key}, ${casing}`,
    status: { open: "a process answer with no card, then \"Which form do you need?\"" },
    fixFlags: [FLAG],
    fixStatus: { open: WIRING },
    async run(t: ReplayContext) {
      const thread = start(t);
      const reply = await thread.say(text);
      expect(isCa(reply.formProposal?.templateKey), `no Corrective Action card:\n${reply.content}`).toBe(true);
      const again = await thread.say("Create a form from this conversation.");
      expect(again.content, `the form is asked for again:\n${again.content}`).not.toMatch(/Which form do you need\?/i);
      expect(isCa(again.formProposal?.templateKey), `no Corrective Action card:\n${again.content}`).toBe(true);
    },
  })),
);
