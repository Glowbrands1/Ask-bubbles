import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * "CREATE A CA FOR LEE'S SUMMIT PLAZA, …": NO EMPLOYEE FROM A POSSESSIVE PLACE NAME (QA, the Bubbles round-6 live test,
 * 9 Nov 2026; pre-existing: byte-identical with round 5)
 * ============================================================================
 *
 * "create a CA for Lee's Summit Plaza, she was late on 10-20-26" made a card for Employee "Lee". POSSESSIVE_PLACE_NOT_
 * PERSON_ENABLED (`forms/possessive-place.ts`): the card asks who the form is for. QA's wording; the pack's invented
 * people.
 */
const LEES_SUMMIT = { level: "location", primaryAreaId: "loc-219", alsoCoversAreaIds: [] };
const FIX = ["POSSESSIVE_PLACE_NOT_PERSON_ENABLED"];
const REPORT = "QA, the Bubbles round-6 live test (9 Nov 2026): \"create a CA for Lee's Summit Plaza, she was late on 10-20-26\" made a card for Employee \"Lee\"";
const REPORTED = "create a CA for Lee's Summit Plaza, she was late on 10-20-26";
const ASKS_WHO = /Who is this \*\*[^*]+\*\* for\?/;

function start(t: ReplayContext, scope: unknown) {
  vi.setSystemTime(new Date("2026-11-07T16:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", scope);
  return t.thread();
}

const reported = ([
  ["own-store", LEES_SUMMIT, "a Lee's Summit manager"],
  ["other-store", WEST_DODGE, "a manager of another store"],
] as const).map(([key, scope, who]): ReplayCase => ({
  id: `nov9-possessive-place-${key}`,
  title: `QA's "create a CA for Lee's Summit Plaza, she was late on 10-20-26" (${who}): no Employee "Lee"; it asks who the form is for`,
  report: REPORT,
  status: { open: "a Corrective Action card for **Lee**" },
  fixFlags: FIX,
  async run(t) {
    const thread = start(t, scope);
    const { content } = await thread.say(REPORTED);
    expect(thread.proposal?.employeeName ?? null, `the place's possessive is the card's person:\n${content}`).toBeNull();
    expect(content, `the reply does not ask who:\n${content}`).toMatch(ASKS_WHO);
    expect(content, `the reply names "Lee" as the person:\n${content}`).not.toMatch(/\bfor \*\*Lee\*\*/);
  },
}));

export const NOV9_POSSESSIVE_PLACE_CASES: ReplayCase[] = [
  ...reported,
  {
    id: "nov9-possessive-place-then-name",
    title: "after the question, \"Marnie Holloway\" makes the card for her",
    report: REPORT,
    status: { open: "the first card is for **Lee**" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t, LEES_SUMMIT);
      await thread.say(REPORTED);
      expect(thread.proposal?.employeeName ?? null).toBeNull();
      const { content } = await thread.say("Marnie Holloway");
      expect(thread.proposal?.employeeName ?? null, `the card is not for Marnie Holloway:\n${content}`).toBe("Marnie Holloway");
    },
  },
  {
    id: "nov9-possessive-place-person-keeps",
    title: "must not change: a person's own possessive (\"Marnie's shift at Lee's Summit\") keeps the card for her",
    report: REPORT,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t, LEES_SUMMIT);
      const { content } = await thread.say("create a CA for Marnie Holloway, she was late on 10-20-26 for her shift at Lee's Summit");
      expect(thread.proposal?.employeeName ?? null, `the card is not for Marnie Holloway:\n${content}`).toBe("Marnie Holloway");
    },
  },
  {
    id: "nov9-possessive-place-what-happened",
    title: "the ask-who card for QA's wording: \"What happened\" is \"she was late on 10-20-26\" or blank, never the place name",
    report: "QA, the Bubbles round-7 live test (9 Nov 2026): the ask-who card's What happened read only \"Lee's Summit Plaza\"",
    status: { open: "What happened: Lee's Summit Plaza" },
    fixFlags: ["POSSESSIVE_PLACE_ACCOUNT_ENABLED"],
    async run(t) {
      const thread = start(t, LEES_SUMMIT);
      const { content } = await thread.say(REPORTED);
      const issue = (thread.proposal as { issue?: string | null } | null)?.issue ?? null;
      expect(thread.proposal?.employeeName ?? null, `the place's possessive is the card's person:\n${content}`).toBeNull();
      expect(issue ?? "", `What happened is the place name: ${issue}`).not.toMatch(/Lee['’]s Summit/i);
      if (issue) expect(issue).toMatch(/she was late on 10-20-26/);
    },
  },
];
