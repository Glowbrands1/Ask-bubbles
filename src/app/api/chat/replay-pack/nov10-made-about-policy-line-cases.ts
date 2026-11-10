import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { REFUSAL_ROSTER, patch } from "./nov7-step-b-refusals-scenarios";

/**
 * ============================================================================
 * A MADE-ABOUT REWRITE NEVER KEEPS THE OLD ACCOUNT'S POLICY LINE (QA's live Bubbles report, 10 Nov 2026)
 * ============================================================================
 *
 * QA's live report (exact wording): on a saved Coaching draft whose Details already carried "Policy reference:
 * Attendance Policy, JBA Policy Manual p.14" (written by an earlier make-about turn that asked for the policy), a second
 * make-about "make it about not following the dress code" kept the stale "Policy reference: Attendance Policy, JBA
 * Policy Manual p.14" and wrote no dress-code reference line. Wanted: the rewritten account's old policy line(s) are
 * taken off wherever they sit and the reference is read again from the new account (or none if no section is found),
 * never the old account's line.
 *
 * Ported with it from the sibling app: its live round 11 (the line dropped by the rewrite, none written for the new
 * account), round 13 (the line kept by the revision as it was) and round 15 (two made-about turns in a row, the second
 * revision keeping the first turn's line with a trailing period, or mid-text). MADE_ABOUT_POLICY_LINE_ENABLED,
 * MADE_ABOUT_POLICY_LINE_REPLACES_ENABLED (`forms/made-about-policy-line.ts`) and, for QA's undated turn, the sibling
 * app's MADE_ABOUT_UNDATED_TOGETHER_ENABLED (ported in Glowbrands1/Ask-bubbles#647), which takes an undated made-about
 * to the patch path, where the policy line is read again.
 *
 * The person is invented. The first made-about turn is this app's live P9 sentence, which asks for the policy
 * (EDIT_POLICY_ASK_ENABLED). The pack's manual (wording invented) also has this app's Dress Code section, printed p.15.
 */
const ATTENDANCE_LINE = "Policy reference: Attendance Policy, JBA Policy Manual p.14";
const CONDUCT_LINE = "Policy reference: Standards of Conduct Policy, JBA Policy Manual p.13";
const DETAILS = "Observed:\nOttoline Ormsworth missed the monthly meeting on 10/10/26.\n\nExpectation:\nOttoline is expected to attend every scheduled meeting.";
const LATE = "Observed:\nOttoline Ormsworth showed up late on 10/14/26.\n\nExpectation:\nOttoline is expected to arrive on time for every shift.";
const LATE_SAID = "I need you to make it about showing up late and please list the policy make the date for 10/14/26";
const DESK_SAID = "make it about leaving the front desk unattended on 11/6/26";
const DRESS_SAID = "make it about not following the dress code";
// Undated: the form's Date (10/14/26) stays the incident's, and the revision keeps it.
const DRESS = "Observed:\nOttoline Ormsworth did not follow the dress code on 10/14/26.\n\nExpectation:\nOttoline is expected to follow the dress code on every shift.";
const DRESS_LINE = "Policy reference: Dress Code for The Company Policy, JBA Policy Manual p.15";
const DRESS_CODE = {
  chunkIndex: 35,
  chunkId: "jba-35",
  locator: "Page 15 — Dress Code for The Company",
  page: 15,
  content:
    "Dress Code for The Company\nThe Company Employees are to keep a neat, clean, professional appearance at all times. Anyone\nviolating their Brand's Dress code policy will be sent home to change into proper work attire and\nmay be subject to disciplinary action, up to and potentially including termination.",
  section: "Dress Code for The Company",
  printedPage: 15,
  sections: [{ heading: "Dress Code for The Company", page: 15 }],
};
/** Production's made-about switches the cases need (all on in production), and the fix. */
const POLICY_LINE_FIX = [
  "MADE_ABOUT_READER_ACCOUNT_ENABLED",
  "MADE_ABOUT_REWRITE_FINISHES_ENABLED",
  "EDIT_POLICY_ASK_ENABLED",
  "MADE_ABOUT_SAID_DATE_ENABLED",
  "MADE_ABOUT_POLICY_LINE_ENABLED",
];
const REPLACES_FIX = [...POLICY_LINE_FIX, "MADE_ABOUT_POLICY_LINE_REPLACES_ENABLED"];
const UNDATED_FIX = [...REPLACES_FIX, "MADE_ABOUT_UNDATED_TOGETHER_ENABLED"];

/** The first made-about turn, asking for the policy: Details about showing up late, ending in the Attendance line. */
async function lateWithPolicy(t: ReplayContext, next: Readonly<Record<string, unknown>>) {
  t.directory(REFUSAL_ROSTER);
  t.as("location_manager", WEST_DODGE);
  t.manualAlsoHas?.([DRESS_CODE]);
  t.patchReads!({
    [LATE_SAID]: {
      ...patch("this_form", [
        { field: "other_topic", value: "Showing up late", how: "replace", evidence: "showing up late" },
        { field: "coaching_details", value: LATE, how: "replace", evidence: "showing up late" },
      ]),
      policy_asked: true,
    } as never,
    ...next,
  });
  const thread = t.thread();
  await thread.say("create a coaching form for Ottoline Ormsworth, she missed the monthly meeting on 10/10/26");
  t.draftWrites({ coaching_details: DETAILS, other_topic: "Missed monthly meeting" }, { coaching_topics: ["other"] });
  const id = await thread.create();
  t.revisionWrites({ coaching_details: LATE });
  await thread.say(LATE_SAID);
  expect(t.values(id).coaching_details ?? "", "the first turn's reference").toMatch(new RegExp(`${ATTENDANCE_LINE.replace(/[.]/g, "\\.")}$`));
  return { id, thread };
}

const policyLines = (details: string) => details.match(/Policy reference:[^\n]*/g) ?? [];

type Kept = "dropped" | "end" | "period" | "middle";

/**
 * After the first turn, a dated made-about ("make it about leaving the front desk unattended on 11/6/26") whose revision
 * writes the new account and does with the first turn's line as `kept` says: drops it (the sibling's round 11), keeps it
 * at the end (round 13), with a trailing period or mid-text (round 15). The new Details carries the Standards of Conduct
 * reference alone.
 */
function deskAfterLate(kept: Kept) {
  return async (t: ReplayContext) => {
    vi.setSystemTime(new Date("2026-11-10T03:04:00Z"));
    const { id, thread } = await lateWithPolicy(t, {
      [DESK_SAID]: patch("this_form", [{ field: "other_topic", value: "Leaving the front desk unattended", how: "replace", evidence: "leaving the front desk unattended" }]),
    });
    const observed = "Observed:\nOttoline Ormsworth left the front desk unattended on 11/6/26.";
    const expectation = "Expectation:\nOttoline is expected to ensure the front desk remains attended at all times during scheduled shifts.";
    const revised = {
      dropped: `${observed}\n\n${expectation}`,
      end: `${observed}\n\n${expectation}\n\n${ATTENDANCE_LINE}`,
      period: `${observed}\n\n${expectation}\n\n${ATTENDANCE_LINE}.`,
      middle: `${observed}\n\n${ATTENDANCE_LINE}\n\n${expectation}`,
    }[kept];
    t.revisionWrites({ coaching_details: revised });
    const reply = await thread.say(DESK_SAID);
    const details = t.values(id).coaching_details ?? "";
    expect(details, `Details:\n${reply.content}`).toMatch(/front desk unattended on 11\/6\/26/);
    expect(details, `the old account's reference is kept:\n${details}`).not.toMatch(/Attendance/);
    expect(policyLines(details), `the policy lines:\n${details}`).toEqual([CONDUCT_LINE]);
  };
}

/** The undated made-about this app hands to the old path, after the first turn; the revision keeps the old line, as live. */
function dressAfterLate(said: string, revised: string, wants: "not stale" | "dress code") {
  return async (t: ReplayContext) => {
    vi.setSystemTime(new Date("2026-11-10T05:10:00Z"));
    const topic = said.replace(/^make it about /, "");
    const { id, thread } = await lateWithPolicy(t, {
      [said]: patch("this_form", [{ field: "other_topic", value: topic.charAt(0).toUpperCase() + topic.slice(1), how: "replace", evidence: topic }]),
    });
    t.revisionWrites({ coaching_details: `${revised}\n\n${ATTENDANCE_LINE}` });
    const reply = await thread.say(said);
    const details = t.values(id).coaching_details ?? "";
    expect(details, `Details:\n${reply.content}`).toMatch(/dress code/);
    expect(details, `the stale reference is kept:\n${details}`).not.toMatch(/Attendance Policy/);
    const lines = policyLines(details);
    if (wants === "dress code") expect(lines, `the dress-code reference:\n${details}`).toEqual([DRESS_LINE]);
    else expect(lines.filter((line) => line !== DRESS_LINE), `another section's line:\n${details}`).toEqual([]);
  };
}

const DESK_REPORT = "Ported from the sibling app's live rounds 11, 13 and 15 (9–10 Nov 2026): the rewritten account's reference was missing, the old one's kept, or both";

const DESK_CASES: Readonly<Record<Kept, { readonly title: string; readonly open: string; readonly fixFlags: readonly string[] }>> = {
  dropped: {
    title: "the revision drops the first turn's Attendance line (the sibling's round 11): the new Details carries the Standards of Conduct reference",
    open: "the new Details carries no policy reference",
    fixFlags: POLICY_LINE_FIX,
  },
  end: {
    title: "the revision keeps the first turn's Attendance line as it was, at the end (the sibling's round 13): it is replaced by the Standards of Conduct reference",
    open: "the old account's Attendance line stays on the new account",
    fixFlags: POLICY_LINE_FIX,
  },
  period: {
    title: "the revision keeps the first turn's Attendance line with a trailing period (the sibling's round 15): the new Details carries the Standards of Conduct reference alone",
    open: "the first turn's line stays, and the new reference is read from it too: both sections",
    fixFlags: REPLACES_FIX,
  },
  middle: {
    title: "the revision keeps the first turn's Attendance line mid-text (the sibling's round 15): the new Details carries the Standards of Conduct reference alone",
    open: "the first turn's line stays mid-text and no reference is written for the new account",
    fixFlags: REPLACES_FIX,
  },
};

const REPORT = "QA's live Bubbles report (10 Nov 2026): \"make it about not following the dress code\" kept the stale \"Policy reference: Attendance Policy, JBA Policy Manual p.14\" and wrote no dress-code reference line";

export const NOV10_MADE_ABOUT_POLICY_LINE_CASES: ReplayCase[] = [
  {
    id: "nov10-made-about-policy-line-dress-code-live",
    title: "QA's live Bubbles report: Details ending \"Policy reference: Attendance Policy, JBA Policy Manual p.14\" (an earlier make-about that asked for the policy), then \"make it about not following the dress code\", the revision keeping the old line: the stale Attendance line is gone, and no other section's line is written",
    report: REPORT,
    status: { open: "the undated made-about goes to the old path, whose revision keeps the old account's Attendance line (MADE_ABOUT_UNDATED_TOGETHER is off in production)" },
    fixFlags: UNDATED_FIX,
    run: dressAfterLate(DRESS_SAID, DRESS, "not stale"),
  },
  {
    id: "nov10-made-about-policy-line-dress-code-reference",
    title: "QA's live Bubbles report, the reference wanted: \"make it about not following the dress code\" writes the Dress Code reference line (this app's manual has the section, p.15)",
    report: `${REPORT} (the dress-code reference line)`,
    status: { open: "the undated made-about goes to the old path, whose revision keeps the old account's Attendance line (MADE_ABOUT_UNDATED_TOGETHER is off in production)" },
    fixFlags: UNDATED_FIX,
    /*
     * Still open with the fix: the policy reader (`forms/ca-policy.ts`, `statedIn`: NEGATED_BEFORE skips a policy name
     * after "not … two words", so "not following the dress code" reads as no policy; and "dress code" without a policy
     * frame is not counted) finds no section in these words, so none is written, rather than the old one. ca-policy.ts
     * is not this change's to edit. "…breaking the dress code policy" (below) holds.
     */
    fixStatus: { open: "the policy reader reads \"not following the dress code\" as no policy named (ca-policy.ts NEGATED_BEFORE), so no section is found" },
    run: dressAfterLate(DRESS_SAID, DRESS, "dress code"),
  },
  {
    id: "nov10-made-about-policy-line-dress-code-named",
    title: "the same draft, \"make it about breaking the dress code policy\" (the policy named): the Attendance line is replaced by the Dress Code reference, p.15",
    report: `${REPORT} (the mechanism, where the reader finds the section)`,
    status: { open: "the undated made-about goes to the old path, whose revision keeps the old account's Attendance line (MADE_ABOUT_UNDATED_TOGETHER is off in production)" },
    fixFlags: UNDATED_FIX,
    run: dressAfterLate(
      "make it about breaking the dress code policy",
      "Observed:\nOttoline Ormsworth broke the dress code policy on 10/14/26.\n\nExpectation:\nOttoline is expected to follow the dress code on every shift.",
      "dress code",
    ),
  },
  ...(["dropped", "end", "period", "middle"] as const).map(
    (kept): ReplayCase => ({
      id: kept === "period" || kept === "middle" ? `nov10-made-about-policy-line-chained-${kept}` : `nov10-made-about-policy-line-${kept}`,
      title: `"${LATE_SAID}" wrote the Attendance line; then "${DESK_SAID}": ${DESK_CASES[kept].title}`,
      report: DESK_REPORT,
      status: { open: DESK_CASES[kept].open },
      fixFlags: [...DESK_CASES[kept].fixFlags],
      run: deskAfterLate(kept),
    }),
  ),
  {
    id: "nov10-made-about-policy-line-no-section",
    title: "negative: \"make it about wrapping the soap bars wrong on 11/6/26\" (no section of the manual): the old Attendance reference never comes back, and none is guessed",
    report: `${REPORT} (the condition: no section found, no reference rather than the old account's)`,
    status: { open: "the old account's Attendance line, kept by the revision, stays" },
    fixFlags: POLICY_LINE_FIX,
    async run(t) {
      vi.setSystemTime(new Date("2026-11-10T03:04:00Z"));
      const SOAP_SAID = "make it about wrapping the soap bars wrong on 11/6/26";
      const { id, thread } = await lateWithPolicy(t, {
        [SOAP_SAID]: patch("this_form", [{ field: "other_topic", value: "Wrapping the soap bars wrong", how: "replace", evidence: "wrapping the soap bars wrong" }]),
      });
      const soap = "Observed:\nOttoline Ormsworth wrapped the soap bars wrong on 11/6/26.\n\nExpectation:\nOttoline is expected to wrap the soap bars as shown.";
      t.revisionWrites({ coaching_details: `${soap}\n\n${ATTENDANCE_LINE}` });
      const reply = await thread.say(SOAP_SAID);
      const details = t.values(id).coaching_details ?? "";
      expect(details, `Details:\n${reply.content}`).toMatch(/soap bars wrong on 11\/6\/26/);
      expect(policyLines(details), `the old reference came back, or one was guessed:\n${details}`).toEqual([]);
    },
  },
];
