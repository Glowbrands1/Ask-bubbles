import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * CARD_POLICY_OWN_REQUEST: AN APOSTROPHE OR HYPHEN NAME KEEPS THE POLICY (ported from the sibling app's round-4 gate)
 * ============================================================================
 *
 * The name pattern escaped "'" and "-" as "\'" and "\-", which the "u" flag rejects, so "create a ca form for <A>
 * O'<B>, …" threw and the policy step was skipped: with POLICY_CITATION on, the card lost its "Policy cited from the
 * JBA Policy Manual" block. Latent here (POLICY_CITATION is off in production), so the cases run with both flags.
 * The managers' words; the people invented (`ai/card-policy-request.ts`).
 */
const FIX = ["POLICY_CITATION_ENABLED", "CARD_POLICY_OWN_REQUEST_ENABLED"];
const REPORT = "The sibling app's round-4 add-on gate, 8 Nov 2026 (CARD_POLICY_OWN_REQUEST)";

function person(id: string, firstName: string, lastName: string): DirectoryRow {
  return { id, firstName, lastName, preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
}

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-04T15:30:00Z"));
  t.directory([...STAFF, person("e-caoimhe-odallagher-560", "Caoimhe", "O'Dallagher"), person("e-ines-varga-lund-560", "Ines", "Varga-Lund")]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV8_CARD_POLICY_OWN_REQUEST_NAMES_CASES: ReplayCase[] = [
  ...(
    [
      ["apostrophe", "create a ca form for Caoimhe O'Dallagher, they were late opening the store on 11/2"],
      ["hyphen", "create a ca form for Ines Varga-Lund, she was late opening the store on 11/2"],
    ] as const
  ).map(([key, said]): ReplayCase => ({
    id: `nov8-560-${key}-name-keeps-policy`,
    title: `"${said}": with POLICY_CITATION and CARD_POLICY_OWN_REQUEST the card still cites Late Opening`,
    report: REPORT,
    // POLICY_CITATION is off in production, so no section is cited there; the fix-flag run is the check.
    status: { open: "POLICY_CITATION is off in production, so the card cites no policy section" },
    fixFlags: FIX,
    async run(t) {
      /*
       * Changed on purpose (Gate-Bubbles-2's POLICY_CITATION gate, 12 Nov 2026): on a card the block now quotes the
       * policy the card cites itself, never a re-reading of the turns, so the old check (DESCRIBED_ATTENDANCE_CARD turned
       * off, a bare line from the turns) no longer applies. With the live card, the name must not break the policy step:
       * the card shows its Late Opening policy, and the block quotes it.
       */
      const reply = await start(t).say(said);
      expect(reply.content, `the card lost its policy:\n${reply.content}`).toMatch(/^\*\*Policy:\*\* Late Opening\b/m);
      expect(reply.content, `the policy step was skipped:\n${reply.content}`).toMatch(/Policy cited from the JBA Policy Manual\*\*\n\n(?:Late Opening Policy, JBA Policy Manual p\.15\n)?Late Opening\n/);
    },
  })),
];
