import { appendFileSync } from "node:fs";

import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { patch } from "./nov7-step-b-refusals-scenarios";

/*
 * GATE-ONLY probes (v2-Gate-Bubbles-5, 14 Nov 2026; not in any PR) for #892 (OTHER_POLICY_AGREES + OTHER_NOT_A_POLICY_NAME),
 * on 17y (ACCOUNT_CHANGE_REDERIVES_POLICY + ACCOUNT_REPLACED_CLOSE_SENTENCE_KEPT on in production). Invented person.
 * Invariant on every probe: the offense, Policy Violated, Direct policy and plan agree; Other is never named as a policy.
 */
const FLAGS = ["OTHER_POLICY_AGREES_ENABLED", "OTHER_NOT_A_POLICY_NAME_ENABLED"];
const PIA: DirectoryRow = { id: "e-gate5-892", firstName: "Pia", lastName: "Wexcombe", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };

type Snap = { offense: string[]; violated: string; lang: string; plan: string; obs: string };
const snap = (t: ReplayContext, id: string): Snap => ({
  offense: t.checked(id).offense_type ?? [],
  violated: t.values(id).policy_violated ?? "",
  lang: t.values(id).policy_language ?? "",
  plan: t.values(id).action_plan ?? "",
  obs: t.values(id).observation ?? "",
});
const short = (s: Snap) => ({ offense: s.offense, violated: s.violated, lang: s.lang.slice(0, 60), plan: s.plan.slice(0, 100), obs: s.obs.slice(0, 110) });
const on = () => FLAGS.every((flag) => process.env[flag] === "true");
function log(key: string, s: Snap, card = "") {
  const policyLine = /\*\*Policy:\*\*[^\n]*/.exec(card)?.[0] ?? "";
  appendFileSync(process.env.PROBE_OUT ?? "/dev/null", `${key} | flags=${on() ? "ON" : "off"} | ${JSON.stringify(short(s))}${policyLine ? ` | card=${policyLine.slice(0, 90)}` : ""}\n`);
}

/** The four agree, and Other is a box, never a policy. */
function agree(s: Snap) {
  const where = JSON.stringify(short(s));
  if (on()) expect(s.plan, `the plan names Other as a policy ${where}`).not.toMatch(/\bthe Other polic/i);
  const only = (key: string) => s.offense.length === 1 && s.offense[0] === key;
  if (only("other")) {
    expect(s.violated, `Other box, Policy Violated disagrees ${where}`).toMatch(/^Other$/);
    if (on()) expect(s.lang, `Other box, Direct policy quotes a section ${where}`).toBe("");
    expect(s.plan, `Other box, the plan names another policy ${where}`).not.toMatch(/attendance|cell phone/i);
  }
  if (only("attendance_policy")) {
    expect(s.violated, `Attendance box, Policy Violated disagrees ${where}`).toMatch(/attendance/i);
    expect(s.plan, `Attendance box, the plan names another policy ${where}`).not.toMatch(/cell phone|\bother polic/i);
  }
  // Two boxes (QA's ruling (b)): Other beside a described offense; the described offense leads every line.
  if (s.offense.length === 2 && s.offense.includes("other")) {
    const lead = s.offense.find((key) => key !== "other")!;
    if (lead === "standards_of_conduct" && /cell phone/i.test(s.violated + s.lang)) {
      expect(s.violated, `Other + phone, Policy Violated is not the phone policy ${where}`).toMatch(/cell phone/i);
      expect(s.lang, `Other + phone, Direct policy is not the Cell Phone section ${where}`).toMatch(/cell phone/i);
      expect(s.plan, `Other + phone, the plan is not the phone policy ${where}`).toMatch(/cell phone/i);
    }
    if (lead === "attendance_policy") {
      expect(s.violated, `Other + late, Policy Violated is not Attendance ${where}`).toMatch(/attendance/i);
      expect(s.lang, `Other + late, Direct policy is not Attendance ${where}`).toMatch(/attendance|arrives on time|punctual/i);
      expect(s.plan, `Other + late, the plan names another policy ${where}`).not.toMatch(/cell phone/i);
    }
  }
  if (only("standards_of_conduct") && /cell phone/i.test(s.violated)) {
    expect(s.lang, `phone box, Direct policy disagrees ${where}`).toMatch(/cell phone/i);
    expect(s.plan, `phone box, the plan disagrees ${where}`).not.toMatch(/attendance policy|\bother polic|applicable company policy/i);
  }
}

async function create(t: ReplayContext, ask: string, observation: string, checked?: Record<string, string[]>) {
  vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
  t.directory([...STAFF, PIA]);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  const card = await thread.say(ask);
  t.draftWrites({ observation }, checked);
  const id = await thread.create();
  return { thread, card: card.content, id };
}

const base = { report: "gate-only", status: "fixed" as const, fixFlags: FLAGS };

/* A. Reading at create time. `expectOther`: true must be Other (flags on), false must not be Other, undefined: record only. */
const READS: [string, string, string, boolean | undefined][] = [
  ["typo-sanitaton", "make a ca for Pia Wexcombe, she skipped the sanitaton", "Observed:\nPia Wexcombe skipped the sanitation.", true],
  ["sanitation-not-completed", "make a ca for Pia Wexcombe because the sanitation was not completed on her shift", "Observed:\nThe sanitation was not completed on Pia Wexcombe's shift.", true],
  ["sanitation-done-negation", "make a ca for Pia Wexcombe, she was late on 11/3/26. she did do the 10 minute sanitation", "Observed:\nPia Wexcombe was late on 11/3/26.", false],
  ["sanitation-word-no-incident", "make a ca for Pia Wexcombe, she was late to the sanitation training on 11/3/26", "Observed:\nPia Wexcombe was late to the sanitation training on 11/3/26.", false],
  ["cleaning-policy-named", "make a ca for Pia Wexcombe for violating the cleaning policy, she did not do the sanitation", "Observed:\nPia Wexcombe did not do the sanitation.", false],
  ["phone-and-sanitation", "make a ca for Pia Wexcombe, she was on her phone and did not do the 10 minute sanitation", "Observed:\nPia Wexcombe was on the phone and did not do the 10 minute sanitation.", undefined],
  ["late-and-sanitation", "make a ca for Pia Wexcombe, she was late on 11/3/26 and did not do the sanitation", "Observed:\nPia Wexcombe was late on 11/3/26 and did not do the sanitation.", undefined],
  // Ruling (b) edges: order swapped, sanitation typo, three things, rude beside cleaning, a cleaning duty denied beside a phone account.
  ["sanitation-then-phone", "make a ca for Pia Wexcombe, she skipped the sanitaion and was texting on her phone", "Observed:\nPia Wexcombe skipped the sanitation and was texting on the cell phone.", undefined],
  ["late-phone-sanitation", "make a ca for Pia Wexcombe, she was late on 11/3/26, on her phone, and did not do the sanitation", "Observed:\nPia Wexcombe was late on 11/3/26, on the phone, and did not do the sanitation.", undefined],
  ["rude-and-sanitation", "make a ca for Pia Wexcombe, she was rude to a customer and did not do the 10 minute sanitation", "Observed:\nPia Wexcombe was rude to a customer and did not do the 10 minute sanitation.", undefined],
  ["phone-sanitation-denied", "make a ca for Pia Wexcombe, she was on her phone the whole shift but she did do the sanitation", "Observed:\nPia Wexcombe was on the phone the whole shift.", false],
];

export const GATE5_892_PROBE_CASES: ReplayCase[] = [
  ...READS.map(([key, ask, observation, expectOther]): ReplayCase => ({
    ...base,
    id: `gate5-892-read-${key}`,
    title: `gate-only: "${ask}": the four agree${expectOther === true ? " on Other" : expectOther === false ? ", never Other" : ""}`,
    async run(t) {
      const { card, id } = await create(t, ask, observation);
      const s = snap(t, id);
      log(`read-${key}`, s, card);
      agree(s);
      if (on() && expectOther === true) expect(s.offense, `not Other ${JSON.stringify(short(s))}`).toEqual(["other"]);
      if (expectOther === false) expect(s.offense, `became Other ${JSON.stringify(short(s))}`).not.toContain("other");
    },
  })),

  /* B. The account-change paths (re-derive on in production). */
  {
    ...base,
    id: "gate5-892-change-late-to-sanitaion",
    title: "gate-only: a lateness draft, then \"change the issue to she did not do the 10 minute sanitaion\": Other agrees, never \"the Other policy\"",
    async run(t) {
      const { thread, id } = await create(t, "create a ca for Pia Wexcombe, she was late on 11/3/26", "Observed:\nPia Wexcombe arrived late for her shift on 11/3/26.", { offense_type: ["attendance_policy"] });
      const said = "change the issue to she did not do the 10 minute sanitaion";
      t.patchReads!({ [said]: patch("this_form", [{ field: "observation", value: "Observed:\nPia Wexcombe did not do the 10 minute sanitation.", how: "replace", evidence: "she did not do the 10 minute sanitaion" }]) });
      const reply = await thread.say(said);
      const s = snap(t, id);
      log("change-late-to-sanitaion", s, reply.content);
      agree(s);
      expect(reply.content, "the reply names Other as a policy").not.toMatch(/\bthe Other polic/i);
      if (on()) expect(s.offense, `not Other ${JSON.stringify(short(s))}`).toEqual(["other"]);
    },
  },
  {
    ...base,
    id: "gate5-892-sanitation-then-made-about-phone",
    title: "gate-only: a sanitation (Other) draft, then the exact made-about phone sentence: the four follow to Cell Phone, no Other left in the plan",
    async run(t) {
      const { thread, id } = await create(t, "please make a ca for Pia Wexcombe for not doing the 10 minute sanitation", "Observed:\nPia Wexcombe did not do the 10 minute sanitation.");
      t.revisionWrites({ observation: "Observed:\nPia Wexcombe was on her phone the whole shift." });
      const reply = await thread.say("make it about her phone use instead, she was on her phone the whole shift");
      const s = snap(t, id);
      log("sanitation-then-made-about-phone", s, reply.content);
      agree(s);
      expect(s.plan, "the plan still reviews Other / the applicable company policy").not.toMatch(/\bother polic|applicable company policy/i);
      expect(s.offense, `the offense stayed Other ${JSON.stringify(short(s))}`).not.toContain("other");
    },
  },
  {
    ...base,
    id: "gate5-892-phone-then-sanitation",
    title: "gate-only: a phone draft, then \"change the issue to not doing the 10-minute sanitation\": Other agrees",
    async run(t) {
      const { thread, id } = await create(t, "make a ca for Pia Wexcombe, she was on her cell phone the whole shift", "Observed:\nPia Wexcombe was texting on the cell phone the whole shift.");
      const said = "change the issue to not doing the 10-minute sanitation";
      t.patchReads!({ [said]: patch("this_form", [{ field: "observation", value: "Observed:\nPia Wexcombe did not do the 10-minute sanitation.", how: "replace", evidence: "not doing the 10-minute sanitation" }]) });
      const reply = await thread.say(said);
      const s = snap(t, id);
      log("phone-then-sanitation", s, reply.content);
      agree(s);
      if (on()) expect(s.offense, `not Other ${JSON.stringify(short(s))}`).toEqual(["other"]);
    },
  },
  ...([
    ["typo-fix", "in the observation change sanitaion to sanitation", "Observed:\nPia Wexcombe did not do the 10 minute sanitaion.", (o: string) => o.replace("sanitaion", "sanitation"), "replace", "change sanitaion to sanitation"],
    ["addition", "add that she was also on her phone", "Observed:\nPia Wexcombe did not do the 10 minute sanitation.", () => "She was also on her phone.", "add", "she was also on her phone"],
  ] as const).map(([key, said, observation, next, how, evidence]): ReplayCase => ({
    ...base,
    id: `gate5-892-sanitation-${key}-nothing-moves`,
    title: `gate-only: a sanitation (Other) draft, then "${said}": nothing moves`,
    async run(t) {
      const { thread, id } = await create(t, "please make a ca for Pia Wexcombe for not doing the 10 minute sanitation", observation);
      const before = snap(t, id);
      t.patchReads!({ [said]: patch("this_form", [{ field: "observation", value: next(before.obs), how, evidence }]) });
      await thread.say(said);
      const s = snap(t, id);
      log(`sanitation-${key}`, s);
      agree(s);
      expect(s.obs, `the ${key} did not land ${JSON.stringify(short(s))}`).not.toBe(before.obs);
      expect(s.offense, `the offense moved on a ${key}`).toEqual(before.offense);
      expect(s.violated, `Policy Violated moved on a ${key}`).toBe(before.violated);
      expect(s.lang, `Direct policy moved on a ${key}`).toBe(before.lang);
      expect(s.plan, `the plan moved on a ${key}`).toBe(before.plan);
    },
  })),
];
