import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * Pau's P14(a) (QA, 10 Nov 2026; the sibling app's #776 is the same report there): the manager describes the incident
 * over several turns, then "create a coaching form for <first name>", then "yes" to "Is this for <full name>?" — and the
 * draft saved "No specific incident … was described": the drafting model was not handed the account. Here an account
 * in plain statements reaches the draft already (guard); one whose first turn opens with a question ("can you help me
 * with rowan? she marked …") does not — the card's turns leave out turns that read as questions. The person invented
 * (on STAFF).
 */
const SAID = /marked an order as shipped but the customer hadn't picked up yet/i;
const REPORT = "Pau's P14(a), 10 Nov 2026: the draft saved \"No specific incident … was described\"";

async function drafted(t: ReplayContext, turns: readonly string[]): Promise<string> {
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  for (const turn of turns) await thread.say(turn);
  const asked = await thread.say("create a coaching form for rowan");
  if (!thread.proposal?.employeeName) await thread.say("yes");
  expect(thread.proposal, `no Coaching card for Rowan Kestrel:\n${asked.content}`).toMatchObject({ templateKey: "coaching", employeeName: "Rowan Kestrel" });
  t.draftWrites({});
  await thread.create();
  return t.draftPrompts().at(-1) ?? "";
}

export const NOV10_P14A_ACCOUNT_BEFORE_REQUEST_CASES: ReplayCase[] = [
  {
    id: "nov10-p14a-account-over-turns",
    title: "guard: an account over two turns, then \"create a coaching form for rowan\", then \"yes\": the draft is handed the account",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const prompt = await drafted(t, [
        "rowan marked an order as shipped but the customer hadn't picked up yet",
        "she also didn't tell anyone on the next shift about the order",
      ]);
      expect(prompt, "the drafting model was not handed the account").toMatch(SAID);
    },
  },
  {
    id: "nov10-p14a-account-opens-with-a-question",
    title: "the account's first turn opens with a question (\"can you help me with rowan? she marked …\"), then the request and \"yes\": the draft is handed the account",
    report: REPORT,
    status: { open: "the turn that opens with a question is left out of the card's turns, so the draft is written without the account" },
    fixFlags: ["ACCOUNT_BEFORE_REQUEST_ENABLED"],
    async run(t) {
      const prompt = await drafted(t, [
        "can you help me with rowan? she marked an order as shipped but the customer hadn't picked up yet",
        "she also didn't tell anyone on the next shift about the order",
      ]);
      expect(prompt, "the drafting model was not handed the account").toMatch(SAID);
    },
  },
];
