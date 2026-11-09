import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * AN ANSWER THAT TELLS ITS OWN ACCOUNT REPLACES THE REQUEST'S, NEVER ADDS TO IT (ported from the sibling app: QA's live test there, 9 Nov 2026)
 * ============================================================================
 *
 * QA's live test of round 7 in the sibling app (FIRST_NAME_ANSWER_KEEPS_ACCOUNT on; the name invented and on no directory): "make me CA
 * for Rhea failing to complete shifts" → "Is this for **Rhea Calloway**? Tell me if that should change." →
 *   - "Rhea Calloway failing to complete shifts 11/7 and 11/8" gave the Observation "Rhea Calloway failing to complete
 *     shifts failing to complete shifts 11/7 and 11/8";
 *   - "Rhea Calloway not showing up to her shifts on 11/7 and 11/8" gave "Rhea Calloway failing to complete shifts not
 *     showing up to her shifts on 11/7 and 11/8".
 * The answer's words were added after the request's account. When the answer tells its own account, it is the account;
 * the request's is kept only when the answer adds dates alone ("Rhea Calloway 11/7 and 11/8",
 * `nov8-ca-shift-dates-kept-cases.ts`). FIRST_NAME_ANSWER_KEEPS_ACCOUNT_ENABLED (`ai/first-name-suggest.ts`).
 */
const RHEA: DirectoryRow = {
  id: "e-rhea-calloway",
  firstName: "Rhea",
  lastName: "Calloway",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};
const T1 = "make me CA for Rhea failing to complete shifts";
const FIX = ["FIRST_NAME_ANSWER_KEEPS_ACCOUNT_ENABLED", "SHIFT_ACCOUNT_IS_INCIDENT_ENABLED"];
const REPORT = "Ported from the sibling app: QA's live test of round 7 there, 9 Nov 2026";
/** Both flags are off in this app's production: the card has no Issue at all there (`nov8-ca-shift-dates-kept-cases.ts`). */
const LOST = { open: "the card has no Issue: the account and the dates are lost" };

/** This app's card reply gives the account as its "**Issue:**" (`forms/incident-issue.ts`), before " · **Store:**". */
function observation(content: string): string {
  return /\*\*Issue:\*\*\s*([^\n·]*)/.exec(content)?.[1] ?? "";
}

async function answered(t: ReplayContext, answer: string, account: string, later?: string) {
  vi.setSystemTime(new Date("2026-11-09T15:00:00Z"));
  t.directory([...STAFF, RHEA]);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  await thread.say(T1);
  let reply = await thread.say(answer);
  if (later) reply = await thread.say(later);
  expect(thread.proposal, `no Corrective Action card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Rhea Calloway" });
  const told = observation(reply.content);
  expect(told, `the account is lost:\n${reply.content}`).toContain(account);
  expect(told, `the request's account is added to the answer's:\n${reply.content}`).not.toMatch(/failing to complete shifts.*(?:failing to complete|not showing)/);
}

export const NOV9_CA_SHIFT_ANSWER_OWN_ACCOUNT_CASES: ReplayCase[] = [
  {
    id: "nov9-ca-shift-answer-same-account",
    title: "→ \"Rhea Calloway failing to complete shifts 11/7 and 11/8\": the account once, not \"… shifts failing to complete shifts …\"",
    report: REPORT,
    status: LOST,
    fixFlags: FIX,
    run: (t) => answered(t, "Rhea Calloway failing to complete shifts 11/7 and 11/8", "failing to complete shifts 11/7 and 11/8"),
  },
  {
    id: "nov9-ca-shift-answer-other-account",
    title: "→ \"Rhea Calloway not showing up to her shifts on 11/7 and 11/8\": the answer's account, not the request's before it",
    report: REPORT,
    status: LOST,
    fixFlags: FIX,
    run: (t) => answered(t, "Rhea Calloway not showing up to her shifts on 11/7 and 11/8", "not showing up to her shifts on 11/7 and 11/8"),
  },
  {
    id: "nov9-ca-shift-answer-own-account-next-turn",
    title: "→ the same answer, then \"no payroll deduct\": the next turn's Observation is not doubled either",
    report: `${REPORT} (the condition)`,
    status: LOST,
    fixFlags: FIX,
    run: (t) => answered(t, "Rhea Calloway failing to complete shifts 11/7 and 11/8", "failing to complete shifts 11/7 and 11/8", "no payroll deduct"),
  },
];
