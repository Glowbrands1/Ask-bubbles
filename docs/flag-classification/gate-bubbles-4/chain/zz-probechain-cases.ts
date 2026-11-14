import { appendFileSync } from "node:fs";
import { vi } from "vitest";
import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

const OUT = process.env.PROBE_OUT ?? "/tmp/probechain.jsonl";
const NELL: DirectoryRow = { id: "e-nell-orrin-pch", firstName: "Nell", lastName: "Orrin", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };

async function probe(t: ReplayContext, name: string, turns: string[], observation: string) {
  vi.setSystemTime(new Date("2026-11-10T15:00:00Z"));
  t.directory([...STAFF, NELL]);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  let card = { content: "" } as { content: string };
  for (const turn of turns) card = await thread.say(turn);
  t.draftWrites({ observation });
  const id = await thread.create();
  const v = t.values(id);
  appendFileSync(OUT, JSON.stringify({ probe: name, arm: process.env.FLAG_CLASSIFY_ON ?? "", offense: t.checked(id).offense_type ?? [], policy_violated: v.policy_violated ?? "", policy_language: (v.policy_language ?? "").slice(0, 20000), action_plan: v.action_plan ?? "", card: card.content.slice(0, 3000) }) + "\n");
}
const P = (id: string, turns: string[], observation: string): ReplayCase => ({ id: `zz-probechain-${id}`, title: `probechain ${id}`, report: "gate probe", status: "fixed", fixFlags: [], run: (t: ReplayContext) => probe(t, id, turns, observation) } as unknown as ReplayCase);
const LATE_YELL = "Observed:\nNell Orrin was late on November 3, 2026 and yelled at a customer.";
const YELL = "Observed:\nNell Orrin yelled at a customer on November 3, 2026.";
const LATE = "Observed:\nNell Orrin was late on November 3, 2026.";
const LATE_YELL_SAN = "Observed:\nNell Orrin was late on November 3, 2026, yelled at a customer, and did not do the sanitation.";
const LATE_PHONE_SAN = "Observed:\nNell Orrin was late on November 3, 2026, was on her phone, and did not do the sanitation.";
const LATE_SAN = "Observed:\nNell Orrin was late on November 3, 2026 and did not do the sanitation.";

export const ZZ_PROBECHAIN_CASES: ReplayCase[] = [
  // two offenses named, either order, joined differently
  P("named-both", ["create a ca for nell orrin for violating the attendance policy and standards of conduct, she was late on 11/3/26 and yelled at a customer. verbal. no payroll deduct."], LATE_YELL),
  P("named-reversed", ["create a ca for nell orrin for violating standards of conduct and the attendance policy, she yelled at a customer and was late on 11/3/26. verbal. no payroll deduct."], LATE_YELL),
  P("named-ampersand", ["create a ca for nell orrin for violating the attendance policy & standards of conduct, she was late on 11/3/26 and yelled at a customer. verbal. no payroll deduct."], LATE_YELL),
  // two offenses described only
  P("described-both", ["create a ca for nell orrin, she was late on 11/3/26 and yelled at a customer. verbal. no payroll deduct."], LATE_YELL),
  // QA's 17z three-way: two described offenses plus a cleaning duty
  P("described-both-sanitation", ["create a ca for Nell Orrin, she was late on 11/3/26 and yelled at a customer, and didn't do the sanitation. verbal. no payroll deduct."], LATE_YELL_SAN),
  // known follow-up (non-blocking): three described offenses
  P("three-described", ["create a ca for nell orrin, she was late on 11/3/26, on her phone, and did not do the sanitation. verbal. no payroll deduct."], LATE_PHONE_SAN),
  // single offense + cleaning (OTHER_POLICY_AGREES alone)
  P("late-sanitation", ["create a ca for nell orrin, she was late on 11/3/26 and didn't do the sanitation. verbal. no payroll deduct."], LATE_SAN),
  // single-policy controls
  P("attendance-only", ["create a ca for nell orrin for violating the attendance policy, she was late on 11/3/26. verbal. no payroll deduct."], LATE),
  P("soc-only", ["create a ca for nell orrin for violating standards of conduct, she yelled at a customer on 11/3/26. verbal. no payroll deduct."], YELL),
  P("described-late-only", ["create a ca for nell orrin, she was late on 11/3/26. verbal. no payroll deduct."], LATE),
  P("described-yell-only", ["create a ca for nell orrin, she yelled at a customer on 11/3/26. verbal. no payroll deduct."], YELL),
  P("correction", ["create a ca for nell orrin, not attendance, standards of conduct, she yelled at a customer on 11/3/26. verbal. no payroll deduct."], YELL),
  // (c): taking one policy off a two-policy card
  P("take-attendance-off", ["create a ca for nell orrin for violating the attendance policy and standards of conduct, she was late on 11/3/26 and yelled at a customer. verbal. no payroll deduct.", "take the attendance policy off the form"], YELL),
  P("take-soc-off", ["create a ca for nell orrin for violating the attendance policy and standards of conduct, she was late on 11/3/26 and yelled at a customer. verbal. no payroll deduct.", "take standards of conduct off the form"], LATE),
];
