import { appendFileSync } from "node:fs";
import { vi } from "vitest";
import { WEST_DODGE, savedForm, type ReplayCase, type ReplayContext } from "./cases";
import { REFUSAL_ROSTER, patch } from "./nov7-step-b-refusals-scenarios";

const OUT = process.env.PROBE_OUT ?? "/tmp/probe871.jsonl";
const PHONE = "make it about her phone use instead, she was on her phone the whole shift";
const SANITATION = "change the issue to not doing the 10-minute sanitation";
const PHONE_ACCOUNT = "Observed:\nOttoline Ormsworth was on the phone for the entire shift.\n\nExpectation:\nPhone use is limited to breaks and is not allowed on the floor.";

function log(probe: string, t: ReplayContext, id: string, before: string, reply: { content: string }, calls0: Record<string, number>) {
  const calls1 = t.calls() as unknown as Record<string, number>;
  const delta = Object.fromEntries(Object.keys(calls1).map((k) => [k, calls1[k]! - (calls0[k] ?? 0)]));
  appendFileSync(OUT, JSON.stringify({ probe, arm: process.env.FLAG_CLASSIFY_ON ?? "", changed: savedForm(t, id) !== before, before, after: savedForm(t, id), obs: t.values(id).observation ?? "", reply: reply.content, calls: delta }) + "\n");
}

async function draft(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-13T18:00:00Z"));
  t.directory(REFUSAL_ROSTER);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  await thread.say("create a ca for Ottoline Ormsworth, she was late on 11/3/26");
  t.draftWrites({ observation: "Observed:\nOttoline Ormsworth arrived late for her shift on 11/3/26." }, { offense_type: ["attendance_policy"] });
  const id = await thread.create();
  t.patchReads!({ [SANITATION]: patch("this_form", [{ field: "observation", value: "Observed:\nOttoline Ormsworth did not do the 10-minute sanitation.", how: "replace", evidence: "not doing the 10-minute sanitation" }]) });
  await thread.say(SANITATION);
  return { thread, id };
}
async function toPhone(t: ReplayContext, probe: string | null) {
  const { thread, id } = await draft(t);
  t.revisionWrites({ observation: PHONE_ACCOUNT });
  const before = savedForm(t, id); const c0 = { ...(t.calls() as unknown as Record<string, number>) };
  const reply = await thread.say(PHONE);
  if (probe) log(probe, t, id, before, reply, c0);
  return { thread, id };
}
async function addProbe(t: ReplayContext, probe: string, ask: string, writes: Record<string, string>) {
  const { thread, id } = await toPhone(t, null);
  t.revisionWrites(writes);
  const before = savedForm(t, id); const c0 = { ...(t.calls() as unknown as Record<string, number>) };
  const reply = await thread.say(ask);
  log(probe, t, id, before, reply, c0);
}
const P = (id: string, run: (t: ReplayContext) => Promise<void>): ReplayCase => ({ id: `zz-probe871-${id}`, title: `probe871 ${id}`, report: "gate probe", status: "fixed", fixFlags: [], run } as unknown as ReplayCase);

export const ZZ_PROBE871_CASES: ReplayCase[] = [
  P("made-about", async (t) => { await toPhone(t, "made-about"); }),
  P("add-already", (t) => addProbe(t, "add-already", "add that she was on the phone for the entire shift", { observation: PHONE_ACCOUNT })),
  P("add-new", (t) => addProbe(t, "add-new", "add that she was warned about phone use last week", { observation: PHONE_ACCOUNT + "\nShe was warned about phone use last week." })),
  P("add-new-nochange", (t) => addProbe(t, "add-new-nochange", "add that she was warned about phone use last week", { observation: PHONE_ACCOUNT })),
  P("add-negated", (t) => addProbe(t, "add-negated", "add that she was not on the phone for the entire shift", { observation: PHONE_ACCOUNT })),
  P("add-reordered", (t) => addProbe(t, "add-reordered", "add that the entire shift she was on the phone", { observation: PHONE_ACCOUNT })),
  P("made-about-dated-refused", async (t) => {
    const { thread, id } = await draft(t);
    t.revisionWrites({ observation: "REWRITTEN" });
    const before = savedForm(t, id); const c0 = { ...(t.calls() as unknown as Record<string, number>) };
    const reply = await thread.say("make it about her phone use on 11/5/26 instead");
    log("made-about-dated-refused", t, id, before, reply, c0);
  }),
  P("made-about-undated-refused", async (t) => {
    const { thread, id } = await draft(t);
    t.revisionWrites({ observation: "REWRITTEN" });
    const before = savedForm(t, id); const c0 = { ...(t.calls() as unknown as Record<string, number>) };
    const reply = await thread.say(PHONE);
    log("made-about-undated-refused", t, id, before, reply, c0);
  }),
  P("made-about-dated-ok", async (t) => {
    const { thread, id } = await draft(t);
    t.revisionWrites({ observation: "Observed:\nOttoline Ormsworth was on her phone the whole shift on 11/5/26." });
    const before = savedForm(t, id); const c0 = { ...(t.calls() as unknown as Record<string, number>) };
    const reply = await thread.say("make it about her phone use on 11/5/26 instead, she was on her phone the whole shift");
    log("made-about-dated-ok", t, id, before, reply, c0);
  }),
];
