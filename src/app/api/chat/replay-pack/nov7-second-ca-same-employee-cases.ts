import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext, type ReplayThread, onStoryClock } from "./cases";

/**
 * ============================================================================
 * A SECOND CORRECTIVE ACTION FOR THE SAME EMPLOYEE IN ONE CHAT (port of the sibling app's audit, QA, 7 Nov 2026)
 * ============================================================================
 *
 * In the sibling app, DRAFT_DEDUPE's lookup read every turn of the chat as the incident and reopened the first draft,
 * and a second form carried the first request's policy. Here DRAFT_DEDUPE is off in production and replay shows no
 * carry-over (the second card cites its own policy); these cases keep it so. SECOND_REQUEST_OWN_ACCOUNT_ENABLED makes
 * the same lookup read only the request now being written (`forms/second-request-reopen.test.ts`). A realistic
 * two-request chat; the person is invented (STAFF's Remy Calder).
 */
const FIRST = "create a corrective action for Remy Calder, he was late opening the store on 11/2";
const SECONDS: Record<string, string> = {
  another: "I need another corrective action for Remy Calder, his cash drawer was short $20 on 11/3",
  separate: "now make a separate CA for Remy Calder for his cash drawer being short $20 on 11/3",
  create: "create a corrective action for Remy Calder, his cash drawer was short $20 on 11/3",
};

const FLAG = "SECOND_REQUEST_OWN_ACCOUNT_ENABLED";
const REPORT = "The sibling app's audit (QA, 7 Nov 2026): a second CA for the same employee in one chat may reopen the first";

async function firstRequest(t: ReplayContext): Promise<ReplayThread> {
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  await thread.say(FIRST);
  return thread;
}

const line = (content: string, label: string) => new RegExp(String.raw`\*\*${label}:\*\*[^\n]*`).exec(content)?.[0] ?? "";

export const NOV7_SECOND_CA_SAME_EMPLOYEE_CASES: ReplayCase[] = Object.entries(SECONDS).map(
  ([key, second]): ReplayCase => ({
    id: `nov7-second-ca-same-employee-${key}`,
    title: `a CA for <name> (late opening), created; then "${second.slice(0, 50)}…": a second form, the first never reopened or changed, and the second card's policy is not the first request's`,
    report: "The sibling app's audit (QA, 7 Nov 2026): a second CA for the same employee in one chat may reopen the first",
    status: "fixed",
    fixFlags: ["SECOND_REQUEST_OWN_ACCOUNT_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say(FIRST);
      const first = await thread.create();
      const firstBefore = { ...t.values(first) };
      const reply = await thread.say(second);
      expect(reply.formOpened?.instanceId ?? null, `the first form is reopened:\n${reply.content}`).not.toBe(first);
      expect(line(reply.content, "Policy"), `the Policy is the first request's:\n${reply.content}`).not.toMatch(/late opening/i);
      const secondForm = await thread.create();
      expect(secondForm, "no second form").not.toBe(first);
      expect(t.values(first), "the first form changed").toEqual(firstBefore);
    },
  }),
).concat(
  // The Observation of each second request (port of the sibling's cases, 7 Nov 2026). Here they already hold in
  // production: the card's Issue and the second form's Observation read only the cash-drawer account. They keep it so
  // with SECOND_REQUEST_OWN_ACCOUNT_ENABLED, which now also reads a form named mid-sentence as a later request.
  Object.entries(SECONDS).map(
    ([key, second]): ReplayCase => ({
      id: `nov7-second-ca-same-employee-${key}-observation`,
      title: `the same chat: the second card's Issue and the second form's Observation are only the cash-drawer account`,
      report: REPORT,
      status: "fixed",
      fixFlags: [FLAG],
      async run(t) {
        const thread = await firstRequest(t);
        await thread.create();
        const reply = await thread.say(second);
        const issue = line(reply.content, "Issue");
        expect(issue, `no Issue:\n${reply.content}`).toMatch(/cash drawer/i);
        expect(issue, `the Issue keeps the first request:\n${reply.content}`).not.toMatch(/late opening/i);
        const observation = t.values(await thread.create()).observation ?? "";
        expect(observation, "the second form's Observation has no cash-drawer account").toMatch(/cash drawer/i);
        expect(observation, "the second form's Observation keeps the first request").not.toMatch(/late opening/i);
      },
    }),
  ),
  // Negatives (from the sibling's review): history or an addition after a request is not a new request; the card
  // still reads the request's account.
  [
    "he already had a CA on 10/14 for being late",
    "add to the CA that he was also late on 11/3",
    "on the write up, also put that he left early on 11/3",
  ].map(
    (said, index): ReplayCase => ({
      id: `nov7-second-ca-same-employee-not-a-request-${index + 1}`,
      title: `negative: after a CA request, "${said}" is not a new request: the card's Issue keeps the request's account`,
      report: REPORT,
      status: "fixed",
      fixFlags: [FLAG],
      async run(t) {
        const thread = await firstRequest(t);
        const reply = await thread.say(said);
        expect(line(reply.content, "Issue"), `the request's account is lost:\n${reply.content}`).toMatch(/late opening the store/i);
      },
    }),
  ),  // QA's Sunny round-3 gate (7 Nov 2026; ported from the sibling app): with the flag on, ordinary single-request cards
  // lost their Policy line. One request keeps its whole account, wherever it is said: before the request, or with a
  // closing "create" after it.
  [
    { id: "account-first", turns: ["Remy Calder was rude to a guest at the register on 11/2 and raised his voice at her", "make a CA for Remy Calder"] },
    { id: "closing-create", turns: ["create a corrective action for Remy Calder, he was rude to a guest at the register on 11/2 and raised his voice", "store is west dodge. create the corrective action"] },
  ].map(
    ({ id, turns }): ReplayCase => ({
      id: `nov7-second-ca-single-request-keeps-policy-${id}`,
      title: `one request ("${turns[0]!.slice(0, 40)}…" → "${turns[1]!}"): the card cites Standards of Conduct with the flag on too`,
      report: "QA's Sunny round-3 gate (7 Nov 2026): SECOND_REQUEST_OWN_ACCOUNT made ordinary single-request cards lose their Policy line",
      status: "fixed",
      fixFlags: [FLAG],
      async run(t) {
        t.directory(STAFF);
        t.as("location_manager", WEST_DODGE);
        const thread = t.thread();
        let reply: Awaited<ReturnType<ReplayThread["say"]>> | null = null;
        for (const turn of turns) reply = await thread.say(turn);
        expect(line(reply!.content, "Policy"), `the card cites no Standards of Conduct:\n${reply!.content}`).toMatch(/standards of conduct/i);
      },
    }),
  ),
);

// Gate-Bubbles-5 (G5-743): these cases tell a story dated after the pack's 10/26/2026; they run on a day after it.
onStoryClock(NOV7_SECOND_CA_SAME_EMPLOYEE_CASES);
