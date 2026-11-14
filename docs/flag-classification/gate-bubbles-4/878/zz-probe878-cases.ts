import { appendFileSync } from "node:fs";
import { vi } from "vitest";
import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

const OUT = process.env.PROBE_OUT ?? "/tmp/probe878.jsonl";
const NELL: DirectoryRow = { id: "e-nell-orrin-p878", firstName: "Nell", lastName: "Orrin", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };

async function probe(t: ReplayContext, name: string, request: string, observation: string) {
  vi.setSystemTime(new Date("2026-11-10T15:00:00Z"));
  t.directory([...STAFF, NELL]);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  const card = await thread.say(request);
  t.draftWrites({ observation });
  const id = await thread.create();
  const v = t.values(id);
  appendFileSync(OUT, JSON.stringify({ probe: name, arm: process.env.FLAG_CLASSIFY_ON ?? "", offense: t.checked(id).offense_type ?? [], policy_violated: v.policy_violated ?? "", policy_language: (v.policy_language ?? "").slice(0, 20000), action_plan: v.action_plan ?? "", card: card.content.slice(0, 1200) }) + "\n");
}
const P = (id: string, request: string, observation: string): ReplayCase => ({ id: `zz-probe878-${id}`, title: `probe878 ${id}`, report: "gate probe", status: "fixed", fixFlags: [], run: (t: ReplayContext) => probe(t, id, request, observation) } as unknown as ReplayCase);
const LATE_YELL = "Observed:\nNell Orrin was late on November 3, 2026 and yelled at a customer.";
const YELL = "Observed:\nNell Orrin yelled at a customer on November 3, 2026.";
const LATE = "Observed:\nNell Orrin was late on November 3, 2026.";

export const ZZ_PROBE878_CASES: ReplayCase[] = [
  P("qa-both", "create a ca for nell orrin for violating the attendance policy and standards of conduct, she was late on 11/3/26 and yelled at a customer", LATE_YELL),
  P("attendance-only", "create a ca for nell orrin for violating the attendance policy, she was late on 11/3/26", LATE),
  P("soc-only", "create a ca for nell orrin for violating standards of conduct, she yelled at a customer on 11/3/26", YELL),
  P("correction", "create a ca for nell orrin, not attendance, standards of conduct, she yelled at a customer on 11/3/26", YELL),
  P("correction-actually", "create a ca for nell orrin for the attendance policy, actually standards of conduct, she yelled at a customer on 11/3/26", YELL),
  P("both-reversed", "create a ca for nell orrin for violating standards of conduct and the attendance policy, she yelled at a customer and was late on 11/3/26", LATE_YELL),
  P("both-as-well-as", "create a ca for nell orrin for violating the attendance policy as well as standards of conduct, she was late on 11/3/26 and yelled at a customer", LATE_YELL),
  P("two-sentences", "create a ca for nell orrin for violating the attendance policy, she was late on 11/3/26. she also yelled at a customer, that is standards of conduct", LATE_YELL),
  P("both-not-soc", "create a ca for nell orrin for violating the attendance policy and not standards of conduct, she was late on 11/3/26", LATE),
];
