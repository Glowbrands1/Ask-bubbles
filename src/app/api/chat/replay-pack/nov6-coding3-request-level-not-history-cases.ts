import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayAnswer, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * CODING-3 ITEM 6 (QA, 6 Nov 2026): THE LEVEL ASKED FOR IS NOT AN EARLIER
 * WARNING
 * ============================================================================
 *
 * The manager wrote "I need to write up <name> with a written warning for
 * leaving the front desk unattended for 30 minutes on 10/22. There's no prior
 * coaching on file." The reply said "I've treated the earlier warning you
 * mentioned as previous corrective action history — it doesn't decide this
 * one. Is this new corrective action a Verbal Warning or a Written Warning?"
 *
 * Nothing was an earlier warning: the written warning is the level of THIS
 * form, asked for in the same clause as the request, and 10/22 is the
 * incident's date. `forms/warning-level.ts` read "with a written warning for
 * … on 10/22" through the date after it, and a date before today made it
 * history (`mentionsEarlierWarning`), so the level was asked again.
 * REQUEST_LEVEL_NOT_HISTORY_ENABLED reads the level in the request's own
 * clause as this form's level.
 *
 * The manager's turns are verbatim; every person is invented and on this
 * file's own fixture only. The manager is the actor.
 */

type T = ReplayContext;

const STORE = "loc-264";
const person = (id: string, firstName: string, lastName: string): DirectoryRow => ({
  id,
  firstName,
  lastName,
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: [STORE],
  positionName: "Team Member Part Time",
});

const MARISOL = person("e-marisol-quenneville", "Marisol", "Quenneville");
const TAMSIN = person("e-tamsin-okafor", "Tamsin", "Okafor");
const BRIELLE = person("e-brielle-hartsough", "Brielle", "Hartsough");
const PEOPLE: readonly DirectoryRow[] = [MARISOL, TAMSIN, BRIELLE];

/** The invented people of this file (a function: the registry reads exported arrays as cases). */
export function requestLevelNotHistoryPeople(): readonly DirectoryRow[] {
  return PEOPLE;
}

const REPORT = "QA, 6 Nov 2026 (coding-3 item 6)";
const FIX = ["REQUEST_LEVEL_NOT_HISTORY_ENABLED"];

/** The line that calls a warning in the turn earlier corrective action history. */
const EARLIER_WARNING = /earlier warning|previous corrective action history/i;
/** The question that asks the level. */
const ASKS_LEVEL = /verbal warning\W*\s+or\s+(?:an?\s+)?\W*written warning/i;

function start(t: T) {
  // 6 Nov 2026: the incident (10/22) is before today, as in the report.
  vi.setSystemTime(new Date("2026-11-06T15:00:00Z"));
  t.directory([...STAFF, ...PEOPLE]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

function warningLevel(card: ReplayAnswer["formProposal"] | null | undefined): string | null {
  return (card as { warningLevel?: string | null } | null | undefined)?.warningLevel ?? null;
}

export const NOV6_CODING3_REQUEST_LEVEL_NOT_HISTORY_CASES: ReplayCase[] = [
  {
    id: "nov6-coding3-request-level-not-history-write-up-with",
    title: "\"I need to write up <name> with a written warning for … on 10/22\": the card is a Written Warning; no \"earlier warning\" line, no level question",
    report: `${REPORT}: "I need to write up <name> with a written warning for leaving the front desk unattended for 30 minutes on 10/22. There's no prior coaching on file." → "I've treated the earlier warning you mentioned as previous corrective action history — it doesn't decide this one. Is this new corrective action a Verbal Warning or a Written Warning?"`,
    status: { open: "the written warning asked for is read as history (dated 10/22, before today): the reply says \"earlier warning … previous corrective action history\" and asks Verbal or Written" },
    fixFlags: FIX,
    async run(t: T) {
      const thread = start(t);
      const reply = await thread.say(
        "I need to write up Marisol Quenneville with a written warning for leaving the front desk unattended for 30 minutes on 10/22. There's no prior coaching on file.",
      );
      expect(thread.proposal, `no Corrective Action card for Marisol Quenneville:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Marisol Quenneville" });
      expect(reply.content, `calls the warning asked for an earlier warning:\n${reply.content}`).not.toMatch(EARLIER_WARNING);
      expect(reply.content, `asks the level although a written warning was asked for:\n${reply.content}`).not.toMatch(ASKS_LEVEL);
      expect(warningLevel(thread.proposal), `the card is not the Written Warning asked for:\n${reply.content}`).toBe("written");
    },
  },
  {
    id: "nov6-coding3-request-level-not-history-give-a",
    title: "\"give <name> a written warning for being late on 10/22\": the card is a Written Warning; no \"earlier warning\" line, no level question",
    report: `${REPORT}: a variant of item 6, "give <name> a written warning for being late on 10/22"`,
    status: { open: "the written warning asked for is read as history (dated 10/22, before today)" },
    fixFlags: FIX,
    async run(t: T) {
      const thread = start(t);
      const reply = await thread.say("give Tamsin Okafor a written warning for being late on 10/22");
      expect(thread.proposal, `no Corrective Action card for Tamsin Okafor:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Tamsin Okafor" });
      expect(reply.content, `calls the warning asked for an earlier warning:\n${reply.content}`).not.toMatch(EARLIER_WARNING);
      expect(reply.content, `asks the level although a written warning was asked for:\n${reply.content}`).not.toMatch(ASKS_LEVEL);
      expect(warningLevel(thread.proposal), `the card is not the Written Warning asked for:\n${reply.content}`).toBe("written");
    },
  },
  {
    id: "nov6-coding3-request-level-not-history-dated-warning-stays-history",
    title: "\"<name> got a written warning on 9/1 and now she was late again on 10/22, write her up\": the 9/1 warning stays history, with and without the fix",
    report: `${REPORT}: the guard beside item 6 — a warning in its own dated clause is history`,
    status: "fixed",
    fixFlags: FIX,
    async run(t: T) {
      const thread = start(t);
      const reply = await thread.say("Brielle Hartsough got a written warning on 9/1 and now she was late again on 10/22, write her up");
      expect(thread.proposal, `no Corrective Action card for Brielle Hartsough:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Brielle Hartsough" });
      expect(warningLevel(thread.proposal), `the 9/1 warning was read as this form's level:\n${reply.content}`).toBeNull();
      expect(reply.content, `the level is not asked although only an earlier warning was named:\n${reply.content}`).toMatch(ASKS_LEVEL);
    },
  },
];
