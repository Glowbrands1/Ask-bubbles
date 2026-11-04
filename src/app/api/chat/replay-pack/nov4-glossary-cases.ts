import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * THE ABBREVIATION GLOSSARY (CHAT_GLOSSARY_ENABLED) — sf-s12
 * ============================================================================
 *
 * QA's overnight scan, 4 Nov 2026, sf-s12, the manager's exact words:
 *
 *   "I need to make a corrective action for msb"
 *
 * MSB is Must See Behaviors: the reason for the form, not a person. Live, the
 * word was looked up as an employee ("I couldn't find **msb** in the Woven
 * roster …") and the card waited for a name without asking for one.
 *
 * With CHAT_GLOSSARY_ENABLED on, "msb" is never the employee (the code guard
 * in `lib/ai/glossary.ts`, read where a name becomes the employee), and the
 * reply asks which employee the form is for, once, on the existing "who is
 * this form for" path. The stand-in reading model reads "msb" as the
 * employee, as the live model did; the guard is what drops it.
 *
 * Its own id: the overnight-scan regression set adds the same report as an
 * OPEN case, `nov4-scan-sf-s12-msb-not-a-person`. Production has the flag
 * off, so this one is open too, and `fixFlags` turns the glossary on.
 */

type T = ReplayContext;

const SAID = "I need to make a corrective action for msb";
const WHO = /who is this\b[^?\n]*\bfor\?|which (?:employee|team member)|who(?:'s| is) (?:it|this) for/i;

async function msbTurn(t: T) {
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  const reply = await thread.say(SAID, { employeeName: "msb" });
  return { thread, reply };
}

export const NOV4_GLOSSARY_CASES: readonly ReplayCase[] = [
  {
    id: "nov4-glossary-sf-s12-msb",
    title: `"${SAID}" — MSB is Must See Behaviors, not a person: it asks which employee, once, and never saves "Msb" as the employee`,
    report: `QA's overnight scan of production chats, 4 Nov 2026, sf-s12: "${SAID}"`,
    status: { open: "\"msb\" is read as a person and looked up on the roster; the card names no employee and the reply does not ask which one" },
    fixFlags: ["CHAT_GLOSSARY_ENABLED"],
    async run(t) {
      const { thread, reply } = await msbTurn(t);
      expect(thread.proposal?.employeeName ?? "", "the card names \"Msb\"").not.toMatch(/\bmsb\b/i);
      expect(reply.content, "\"msb\" is treated as a person").not.toMatch(/\bfor \**msb\b|\bmsb\** (?:is not|isn'?t|was not|wasn'?t) (?:on|in)|find[^.\n]*\bmsb\b/i);
      expect(reply.content, `the reply does not ask which employee:\n${reply.content}`).toMatch(WHO);
      expect(reply.content.match(WHO)?.length ?? 0, "asked more than once").toBe(1);
      // Nothing is saved with "Msb" as the employee, even if the manager presses Create.
      if (thread.proposal) {
        const id = await thread.create().catch(() => null);
        if (id) expect(t.values(id).employee_name ?? "", "\"Msb\" saved as the employee").not.toMatch(/\bmsb\b/i);
      }
    },
  },
];
