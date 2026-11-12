import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A REPLY WITH NO NAME ON THE CARD READS CLEANLY (NO_NAME_REPLY_WORDING_ENABLED)
 * ============================================================================
 *
 * Port from the sibling app (its round 22 live test, QA, 11 Nov 2026): "create a CA for ima employee" rightly made no card, but
 * the reply said "for the the employee" and "You can create it now" with no Create button.
 *
 * Bubbles 16c live (QA, main ffa571ea, 11 Nov 2026), the tester's words "create a CA for ima employee": no card, but the
 * reply still read "ima" as a name — "Action plan: … with Ima", "I couldn't verify a store for ima from Woven" — and the
 * empty-employee card still offered "Create draft" (`supportsInlineDraft`). The slot model reads the employee as "ima
 * employee", as live. With the flag, no name-derived words and no Create button while the card has no employee.
 */
const EVERY_STORE = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const IMA = "create a CA for ima employee";
const REPORT = "Bubbles 16c live test (QA, 11 Nov 2026, main ffa571ea); the sibling app's round 22 live test";

export const NOV11_LIVE_NO_NAME_CASES: ReplayCase[] = (
  [
    ["every-store", "admin", EVERY_STORE],
    ["store-manager", "location_manager", WEST_DODGE],
  ] as const
).map(
  ([id, role, scope]): ReplayCase => ({
    id: `nov11-live-ima-employee-no-name-words-${id}`,
    title: `"${IMA}" (${id}): no card, no "Ima" in the plan or a store note, no Create button, never "the the employee"`,
    report: REPORT,
    status: { open: "\"… with Ima\" in the Action plan, the store note for **ima** (every store), and a Create button on an empty card" },
    fixFlags: ["NO_NAME_REPLY_WORDING_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as(role as never, scope as never);
      t.slotsRead({ employee: "ima employee", formType: "Corrective Action Form", formTurn: true });
      const thread = t.thread();
      const reply = await thread.say(IMA);
      expect(thread.proposal?.employeeName ?? null, "no card for the words").toBeNull();
      expect(thread.proposal?.supportsInlineDraft ?? false, "no Create button on an empty card").toBe(false);
      expect(reply.content, reply.content).not.toMatch(/\bIma\b|\*\*ima\*\*/);
      expect(reply.content, reply.content).not.toMatch(/\bthe the\b/i);
      expect(reply.content, reply.content).not.toMatch(/You can create it now/);
      expect(reply.content, reply.content).toMatch(/Who is this form for\?/);
    },
  }),
);
