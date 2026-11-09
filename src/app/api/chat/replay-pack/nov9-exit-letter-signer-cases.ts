import { expect, vi } from "vitest";

import { STAFF, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * A TERMINATION LETTER SIGNED "<NAME>, DISTRICT MANAGER": THE SIGNER IS NEVER THE SUBJECT (QA, the Bubbles round-6 live
 * test, 9 Nov 2026; pre-existing: byte-identical with round 5)
 * ============================================================================
 *
 * "create an exit form for <B>, team member at Grand Island. Here is the termination letter: '<B>, your employment …
 * <C>, District Manager'" was answered "Which of them is this Resignation/Exit Form for — <B>, <C> or District Manager'?",
 * the card's Position "District Manager". The people are invented (Corvin Ashdale, Maren Tollefsen).
 */
const GRAND_ISLAND = { level: "location", primaryAreaId: "loc-236", alsoCoversAreaIds: [] };
const CORVIN: DirectoryRow = {
  id: "e-corvin-ashdale",
  firstName: "Corvin",
  lastName: "Ashdale",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-236"],
  positionName: "Team Member Part Time",
};
export const SIGNED =
  "create an exit form for Corvin Ashdale, team member at Grand Island. Here is the termination letter: 'Corvin Ashdale, your employment with Buff City Soap is terminated effective 11-6-26 because you did not show up for your scheduled shifts on 10-30-26 and 11-1-26 and did not call. You are not eligible for rehire. Please return your store key. Maren Tollefsen, District Manager'";
const FIX = ["EXIT_LETTER_SIGNER_NOT_SUBJECT_ENABLED"];
/** Until coding 2's `ai/server-ask.ts` line lands, the proposal still reads the sign-off (the fix run is expected to fail). */
const ROUTE = { open: "the proposal reads withoutLetterSigner only once coding 2's ai/server-ask.ts line lands" };
const REPORT = "QA, the Bubbles round-6 live test (9 Nov 2026): the letter's signer offered as the exit form's subject, her title as the Position";

function start(t: ReplayContext, onRoster: boolean) {
  vi.setSystemTime(new Date("2026-11-07T16:00:00Z"));
  t.directory(onRoster ? [...STAFF, CORVIN] : STAFF);
  t.as("location_manager", GRAND_ISLAND);
  return t.thread();
}

const cases = ([
  ["off-roster", false, "the live chat: <B> is not on this store's roster"],
  ["on-roster", true, "<B> on the roster"],
] as const).map(([key, onRoster, where]): ReplayCase => ({
  id: `nov9-exit-letter-signer-${key}`,
  title: `"create an exit form for <B>, team member … '<B>, your employment … <C>, District Manager'" (${where}): the card is for <B>, Position Team Member; the signer is never offered, nor her title used`,
  report: REPORT,
  status: onRoster
    ? { open: "the card is for <B> but its read-back says \"Job Title: District Manager\"" }
    : { open: "\"Which of them is this Resignation/Exit Form for — <B>, <C> or District Manager'?\"; Position \"District Manager\"" },
  fixFlags: FIX,
  fixStatus: ROUTE,
  async run(t) {
    const thread = start(t, onRoster);
    const { content } = await thread.say(SIGNED);
    expect(content, `the signer is offered:\n${content}`).not.toMatch(/\*\*Maren Tollefsen\*\*|District Manager'/);
    expect(thread.proposal?.employeeName ?? null, `the card is not for the employee:\n${content}`).toBe("Corvin Ashdale");
    expect(thread.proposal?.employeeRole ?? null, `the card's Position:\n${content}`).toBe("Team Member");
    expect(content, `the signer's title is the Job Title:\n${content}`).not.toMatch(/\*\*Job Title:\*\*\s*District Manager/i);
  },
}));

export const NOV9_EXIT_LETTER_SIGNER_CASES: ReplayCase[] = [
  ...cases,
  {
    id: "nov9-exit-letter-signed-by-the-employee",
    title: "must not change: a resignation letter the employee signs (\"… Corvin Ashdale, Team Member\") keeps the card for them",
    report: REPORT,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t, true);
      const { content } = await thread.say(
        "create an exit form for Corvin Ashdale. Here is his resignation letter: 'I am resigning from my position effective 11-6-26 to pursue other career options. Corvin Ashdale, Team Member'",
      );
      expect(thread.proposal?.employeeName ?? null, `the card is not for the employee:\n${content}`).toBe("Corvin Ashdale");
    },
  },
];
