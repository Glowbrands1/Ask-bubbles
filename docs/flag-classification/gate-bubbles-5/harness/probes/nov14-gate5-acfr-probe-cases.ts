import { appendFileSync } from "node:fs";

import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { patch } from "./nov7-step-b-refusals-scenarios";

/*
 * GATE-ONLY probes (v2-Gate-Bubbles-5, 14 Nov 2026; not in any PR) for claude/account-change-full-rederive + #876.
 * Invented people. Every probe checks the invariant: offense, Policy Violated, Direct policy and plan agree.
 * Typo and date fixes also check that nothing moved. Each probe writes one line to PROBE_OUT.
 */
const REDERIVE = "ACCOUNT_CHANGE_REDERIVES_POLICY_ENABLED";
const ODA: DirectoryRow = { id: "e-gate5-acfr-1", firstName: "Odalys", lastName: "Quenby", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const IVO: DirectoryRow = { id: "e-gate5-acfr-2", firstName: "Ivo", lastName: "Tarrant", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const DRAFT_PLAN = "Odalys will arrive on time for every scheduled shift.";

type Snap = { offense: string[]; violated: string; lang: string; plan: string; obs: string };
const snap = (t: ReplayContext, id: string): Snap => ({
  offense: t.checked(id).offense_type ?? [],
  violated: t.values(id).policy_violated ?? "",
  lang: t.values(id).policy_language ?? "",
  plan: t.values(id).action_plan ?? "",
  obs: t.values(id).observation ?? "",
});
const short = (s: Snap) => ({ offense: s.offense, violated: s.violated, lang: s.lang.slice(0, 70), plan: s.plan.slice(0, 90), obs: s.obs.slice(0, 120) });
function log(key: string, before: Snap, after: Snap) {
  const flags = `rederive=${process.env[REDERIVE] ?? "-"} close=${process.env.ACCOUNT_REPLACED_CLOSE_SENTENCE_KEPT_ENABLED ?? "-"}`;
  appendFileSync(process.env.PROBE_OUT ?? "/dev/null", `${key} | ${flags} | before=${JSON.stringify(short(before))} | after=${JSON.stringify(short(after))}\n`);
}

/** The four agree: an Attendance box goes with Attendance lines; a Standards of Conduct (phone) box goes with Cell Phone lines; no line names a policy the box does not. */
function agree(s: Snap) {
  const where = JSON.stringify(short(s));
  const attendanceBox = s.offense.includes("attendance_policy");
  const conductBox = s.offense.includes("standards_of_conduct");
  if (attendanceBox && !conductBox) {
    expect(s.violated, `Policy Violated disagrees with the Attendance box ${where}`).toMatch(/attendance/i);
    expect(s.violated, `Policy Violated names the phone policy ${where}`).not.toMatch(/cell phone/i);
    expect(s.lang, `Direct policy names the phone policy ${where}`).not.toMatch(/cell phone/i);
    expect(s.plan, `the plan names the phone policy ${where}`).not.toMatch(/cell phone/i);
  }
  if (conductBox && !attendanceBox) {
    expect(s.violated, `Policy Violated stayed Attendance under a conduct box ${where}`).not.toMatch(/attendance/i);
    expect(s.lang, `Direct policy stayed Attendance under a conduct box ${where}`).not.toMatch(/arrives on time|punctuality|attendance, p\. ?14/i);
    expect(s.plan, `the plan stayed Attendance under a conduct box ${where}`).not.toMatch(/attendance policy|arrive on time/i);
  }
}

async function draft(t: ReplayContext, person: DirectoryRow, ask: string, observation: string, plan?: string) {
  vi.setSystemTime(new Date("2026-11-13T18:00:00Z"));
  t.directory([...STAFF, ODA, IVO]);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  await thread.say(ask);
  t.draftWrites({ observation, ...(plan ? { action_plan: plan } : {}) }, { offense_type: ["attendance_policy"] });
  const id = await thread.create();
  void person;
  return { thread, id };
}

/** A fix the reader reads as a replace of the whole Observation: nothing may move. */
function fixProbe(key: string, person: DirectoryRow, ask: string, oldObs: string, said: string, fixes: readonly (readonly [string, string])[], evidence: string, plan?: string, followUp?: string): ReplayCase {
  return {
    id: `gate5-acfr-${key}`,
    title: `gate-only: "${said}" on an Attendance draft: nothing moves and the four agree`,
    report: "gate-only",
    status: "fixed",
    fixFlags: [REDERIVE],
    async run(t) {
      const { thread, id } = await draft(t, person, ask, oldObs, plan);
      const before = snap(t, id);
      // The saved account with only the fixed words changed (the app words the saved account its own way).
      let newObs = before.obs;
      for (const [from, to] of fixes) {
        expect(newObs, `probe setup: "${from}" is not in the saved account ${JSON.stringify(before.obs)}`).toContain(from);
        newObs = newObs.replace(from, to);
      }
      const edit = patch("this_form", [{ field: "observation", value: newObs, how: "replace", evidence }]);
      t.patchReads!(followUp ? { [said]: edit, [followUp]: edit } : { [said]: edit });
      await thread.say(said);
      if (followUp) await thread.say(followUp);
      const after = snap(t, id);
      log(key, before, after);
      expect(after.obs, `the fix did not land ${JSON.stringify(short(after))}`).toBe(newObs);
      expect(after.offense, `the offense moved on a ${key}`).toEqual(before.offense);
      expect(after.violated, `Policy Violated moved on a ${key}`).toBe(before.violated);
      expect(after.lang, `Direct policy moved on a ${key}`).toBe(before.lang);
      expect(after.plan, `the plan moved on a ${key}`).toBe(before.plan);
      agree(after);
    },
  };
}

const LATE_ODA = "create a ca for Odalys Quenby, she was late on 11/3/26";
const LATE_IVO = "create a ca for Ivo Tarrant, he was late on 11/3/26";
const EXACT = "make it about her phone use instead, she was on her phone the whole shift";
const PHONE_ACCOUNT = "Observed:\nOdalys Quenby was on her phone the whole shift on 11/3/26.";

export const GATE5_ACFR_PROBE_CASES: ReplayCase[] = [
  // The reported shape: an Attendance draft whose account mentions the phone, then a one-letter fix.
  fixProbe("typo-shfit", ODA, LATE_ODA, "Observed:\nOdalys Quenby arrived late and was on her phone the whole shfit on 11/3/26.", "fix the typo, it's shift not shfit", [["shfit", "shift"]], "shift not shfit"),
  fixProbe("typo-shfit-draft-plan", ODA, LATE_ODA, "Observed:\nOdalys Quenby arrived late and was on her phone the whole shfit on 11/3/26.", "fix the typo, it's shift not shfit", [["shfit", "shift"]], "shift not shfit", DRAFT_PLAN),
  fixProbe("typo-arived", ODA, LATE_ODA, "Observed:\nOdalys Quenby arived late for her shift on 11/3/26.", "fix arived to arrived", [["arived", "arrived"]], "arrived", DRAFT_PLAN),
  fixProbe("date-same-format", ODA, LATE_ODA, "Observed:\nOdalys Quenby arrived late for her shift on 11/3/26.", "the date should be 11/4/26 not 11/3/26", [["11/3/26", "11/4/26"]], "11/4/26", DRAFT_PLAN),
  fixProbe("date-month-word", ODA, LATE_ODA, "Observed:\nOdalys Quenby arrived late for her shift on November 3, 2026.", "it was November 4 not November 3", [["November 3", "November 4"]], "November 4", DRAFT_PLAN),
  // Edge: the date rewritten in another format (3 tokens differ, over the limit of 2).
  fixProbe("date-other-format", ODA, LATE_ODA, "Observed:\nOdalys Quenby arrived late for her shift on 11/3/26.", "the date was November 4, 2026", [["11/3/26", "November 4, 2026"]], "November 4, 2026", DRAFT_PLAN),
  // Edge: a typo in a short name (under 4 letters is never "misspelled").
  fixProbe("typo-short-name", IVO, LATE_IVO, "Observed:\nIva Tarrant arrived late for his shift on 11/3/26.", "it's Ivo not Iva", [["Iva", "Ivo"]], "Ivo", DRAFT_PLAN),
  // Edge: typo and date fixed in one turn (2 differing words).
  fixProbe("typo-and-date", ODA, LATE_ODA, "Observed:\nOdalys Quenby arived late for her shift on 11/3/26.", "it's arrived, and the date is 11/4/26", [["arived", "arrived"], ["11/3/26", "11/4/26"]], "arrived", DRAFT_PLAN),
  // Two turns, as live: the date fix is asked about, then answered "when it happened".
  fixProbe("date-two-turn", ODA, LATE_ODA, "Observed:\nOdalys Quenby arrived late for her shift on 11/3/26.", "the date should be 11/4/26 not 11/3/26", [["11/3/26", "11/4/26"]], "11/4/26", DRAFT_PLAN, "when it happened"),
  fixProbe("date-other-format-two-turn", ODA, LATE_ODA, "Observed:\nOdalys Quenby arrived late for her shift on 11/3/26.", "the date was November 4, 2026", [["11/3/26", "November 4, 2026"]], "November 4, 2026", DRAFT_PLAN, "when it happened"),
  fixProbe("typo-named-field", ODA, LATE_ODA, "Observed:\nOdalys Quenby arived late for her shift on 11/3/26.", "in the observation change arived to arrived", [["arived", "arrived"]], "change arived to arrived", DRAFT_PLAN),
  fixProbe("typo-short-name-named-field", IVO, LATE_IVO, "Observed:\nIva Tarrant arrived late for his shift on 11/3/26.", "in the observation change Iva to Ivo", [["Iva", "Ivo"]], "change Iva to Ivo", DRAFT_PLAN),
  fixProbe("date-named-field", ODA, LATE_ODA, "Observed:\nOdalys Quenby arrived late for her shift on 11/3/26.", "in the observation change 11/3/26 to 11/4/26", [["11/3/26", "11/4/26"]], "change 11/3/26 to 11/4/26", DRAFT_PLAN),
  // Coding-2's shape: an Attendance draft whose whole account reads as the phone use; a one-letter fix must not move it.
  fixProbe("phone-account-typo-named-field", ODA, LATE_ODA, "Observed:\nOdalys Quenby was texting on her cell phone the whole shfit on 11/3/26.", "in the observation change shfit to shift", [["shfit", "shift"]], "change shfit to shift", DRAFT_PLAN),
  fixProbe("phone-account-date-named-field", ODA, LATE_ODA, "Observed:\nOdalys Quenby was texting on her cell phone the whole shift on 11/3/26.", "in the observation change 11/3/26 to 11/4/26", [["11/3/26", "11/4/26"]], "change 11/3/26 to 11/4/26", DRAFT_PLAN),
  // Edge: a date rewritten in another format (3 words differ, past #876's limit of 2).
  fixProbe("phone-account-date-other-format-named-field", ODA, LATE_ODA, "Observed:\nOdalys Quenby was texting on her cell phone the whole shift on 11/3/26.", "in the observation change 11/3/26 to November 4, 2026", [["11/3/26", "November 4, 2026"]], "change 11/3/26 to November 4, 2026", DRAFT_PLAN),
  // More date shapes (v2-QA, 14 Nov): each is a date-only fix on the cell-phone account and must move nothing.
  ...([
    ["nov-4th", "Observed:\nOdalys Quenby was texting on her cell phone the whole shift on 11/3/26.", "11/3/26", "Nov 4th"],
    ["year-dropped", "Observed:\nOdalys Quenby was texting on her cell phone the whole shift on 11/3/26.", "11/3/26", "11/4"],
    ["weekday", "Observed:\nOdalys Quenby was texting on her cell phone the whole shift on Tuesday.", "Tuesday", "Wednesday"],
    ["the-3rd", "Observed:\nOdalys Quenby was texting on her cell phone the whole shift on the 3rd.", "3rd", "4th"],
    ["weekday-and-date", "Observed:\nOdalys Quenby was texting on her cell phone the whole shift on Tuesday, 11/3/26.", "Tuesday, 11/3/26", "Wednesday, November 4th"],
  ] as const).map(([key, account, from, to]) =>
    fixProbe(`phone-account-date-${key}-named-field`, ODA, LATE_ODA, account, `in the observation change ${from} to ${to}`, [[from, to]], `change ${from} to ${to}`, DRAFT_PLAN),
  ),
  // The exact made-about sentence: the revision rewrites the account (with and without ticking the box itself).
  ...([["made-about-exact", undefined], ["made-about-exact-revision-ticks", { offense_type: ["standards_of_conduct"] }]] as const).map(([key, checked]): ReplayCase => ({
    id: `gate5-acfr-${key}`,
    title: `gate-only: "${EXACT}" on an Attendance draft: the four agree on the phone account`,
    report: "gate-only",
    status: "fixed",
    fixFlags: [REDERIVE],
    async run(t) {
      const { thread, id } = await draft(t, ODA, LATE_ODA, "Observed:\nOdalys Quenby arrived late for her shift on 11/3/26.", DRAFT_PLAN);
      const before = snap(t, id);
      t.revisionWrites({ observation: PHONE_ACCOUNT }, checked ? { offense_type: [...checked.offense_type] } : undefined);
      await thread.say(EXACT);
      const after = snap(t, id);
      log(key, before, after);
      agree(after);
      if (process.env[REDERIVE] === "true") {
        expect(after.offense, `the offense did not follow the phone account ${JSON.stringify(short(after))}`).toEqual(["standards_of_conduct"]);
        expect(after.violated, `Policy Violated is not the phone policy ${JSON.stringify(short(after))}`).toMatch(/cell phone/i);
        expect(after.lang, `Direct policy is not the Cell Phone section ${JSON.stringify(short(after))}`).toMatch(/cell phone/i);
      }
    },
  })),
];
