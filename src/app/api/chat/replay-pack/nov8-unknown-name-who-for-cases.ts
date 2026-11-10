import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * THE NAME NOT ON THE DIRECTORY: EVERY "I STILL NEED" ASKS WHO THE FORM IS FOR (QA's round-6 audit, 8 Nov 2026)
 * ============================================================================
 *
 * QA BF7 live (27 Oct 2026), the tester's chain word for word: "i need to issue a ca for someone being late" / "quinn
 * marlowe was late on 10/20 and the store was opened late" / "she was issued a verbal ca on 10.1 for this same
 * thing" / "yes payroll deduct" / "i dont know the amount" / "dodge". UNKNOWN_NAME_ASK (live) names the typed name
 * back, but its repeat "I still need a name that is on the directory — **quinn marlowe** isn't. What is the
 * employee's full name as the directory has it?" says "I still need" beside no "Who is this … for?", which the
 * pack's own `stillAsks` check refuses: no case covered this chain until QA's audit ran it. UNKNOWN_NAME_ASK_WHO_FOR
 * (`ai/unknown-name-ask.ts`) words every ask around "Who is this **<form>** for?", as the sibling app's port does.
 * The name is invented and on no directory.
 */
const CHAIN = [
  "i need to issue a ca for someone being late",
  "quinn marlowe was late on 10/20 and the store was opened late",
  "she was issued a verbal ca on 10.1 for this same thing",
  "yes payroll deduct",
  "i dont know the amount",
  "dodge",
];

export const NOV8_UNKNOWN_NAME_WHO_FOR_CASES: ReplayCase[] = [
  {
    id: "nov8-unknown-name-who-for-chain",
    title: "the BF7 chain: the typed name is named back, no reply repeats the one before, and every \"I still need\" asks who the form is for",
    report: "QA's round-6 audit (8 Nov 2026): the BF7 chain trips the pack's stillAsks check (\"I still need a name that is on the directory …\")",
    status: { open: "\"I still need a name that is on the directory — **quinn marlowe** isn't. What is …?\" has no \"Who is this … for?\" (the pack's stillAsks check)" },
    fixFlags: ["UNKNOWN_NAME_ASK_WHO_FOR_ENABLED"],
    async run(t: ReplayContext) {
      vi.setSystemTime(new Date("2026-11-06T15:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const out: string[] = [];
      for (const turn of CHAIN) out.push((await thread.say(turn)).content);
      expect(out.some((reply) => /\*\*quinn marlowe\*\*[^\n]*directory/i.test(reply)), `the typed name is never named back:\n${out.join("\n---\n")}`).toBe(true);
      for (let index = 1; index < out.length; index += 1) expect(out[index], `reply ${index} repeats the one before`).not.toBe(out[index - 1]);
      expect(thread.proposal?.employeeName ?? null, "a name not on the directory became the employee").toBeNull();
    },
  },
];
