import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayAnswer, type ReplayCase, type ReplayContext } from "./cases";
import { pauFivePeople } from "./nov4-ca-sales-pau-five-cases";

/**
 * QA, live, 4 Nov 2026 (CA_SALES_POLICY_ENABLED on, as in production since
 * 5 Nov): "CA for <name> due to under performance in salon metrics" put the
 * whole request on the card's Issue, and the draft's Observation of Offense
 * was that same sentence: the model copied the request. The stand-in model
 * copies it the same way here. `nov4-pau5-3-under-performance-salon-metrics`
 * checks only the policy line; these check the Issue and the Observation.
 *
 * The same family (the #237 audit, live 26 Oct 2026): "create a ca for <name>
 * at <store>, she was late on 10-5 and 10-15 …" put the request words on the
 * card's Issue too.
 *
 * Rebuilds #454 behind CA_REASON_DUE_TO_ENABLED (default off). Every person
 * is invented.
 */

type T = ReplayContext;

const REPORT = "QA, live, 4 Nov 2026: the card's Issue and the draft's Observation of Offense were the manager's request";
const FLAG = ["CA_REASON_DUE_TO_ENABLED"];
const REQUEST_WORDS = /\b(?:due\s+to|because|create|ca\s+for|corrective\s+action\s+for)\b/i;

function start(t: T) {
  vi.setSystemTime(new Date("2026-11-04T15:30:00Z"));
  t.directory([...STAFF, ...pauFivePeople()]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

function issueLine(reply: ReplayAnswer): string {
  return reply.content.split("\n").find((line) => /\*\*Issue:?\*\*/i.test(line)) ?? "";
}

export const NOV6_CA_REASON_DUE_TO_CASES: ReplayCase[] = [
  {
    id: "nov6-ca-reason-due-to-card-issue",
    title: "\"CA for <name> due to under performance in salon metrics\": the card's Issue is the reason, not the request",
    report: `${REPORT} (#3, card)`,
    // Updated 10 Nov 2026 (QA, the B#501 rework on main): with SALES_OBSERVATION_ACCOUNT and SALES_SHORTFALL_OBJECT on,
    // the live card has no Issue at all; before them it was the whole request.
    status: { open: "with production's flags the card has no Issue (\"CA for <name> due to …\")" },
    fixFlags: FLAG,
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("CA for Briony Fellwater due to under performance in salon metrics");
      expect(thread.proposal, "no Corrective Action card").toMatchObject({ templateKey: "dpoa", employeeName: "Briony Fellwater" });
      const issue = issueLine(reply);
      expect(issue, `the card has no Issue:\n${reply.content}`).toMatch(/under performance in salon metrics/i);
      expect(issue, `the Issue is the request:\n${issue}`).not.toMatch(REQUEST_WORDS);
    },
  },
  {
    id: "nov6-ca-reason-due-to-draft-observation",
    title: "\"CA for <name> due to under performance in salon metrics\": the Issue and the drafted Observation are the reason, not the request",
    report: `${REPORT} (#3, draft)`,
    status: { open: "with production's flags the Observation is the request as the model copied it" },
    fixFlags: FLAG,
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("CA for Briony Fellwater due to under performance in salon metrics");
      expect(thread.proposal, "no Corrective Action card").toMatchObject({ templateKey: "dpoa", employeeName: "Briony Fellwater" });
      expect(issueLine(reply), "the Issue is the request").not.toMatch(REQUEST_WORDS);
      t.draftWrites({ observation: "Observed:\nCA for Briony Fellwater due to under performance in salon metrics" });
      const observation = t.values(await thread.create()).observation ?? "";
      expect(observation, `the Observation is the request:\n${observation}`).not.toMatch(REQUEST_WORDS);
      expect(observation, `the reason is gone:\n${observation}`).toMatch(/under performance in salon metrics/i);
    },
  },
  {
    id: "nov6-ca-reason-because-of-draft-observation",
    title: "\"CA for <name> because of …\": read the same way as \"due to\"",
    report: `${REPORT}, "because of" variant`,
    status: { open: "with production's flags the Issue and the Observation are the request" },
    fixFlags: FLAG,
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("CA for Briony Fellwater because of under performance in salon metrics");
      expect(thread.proposal, "no Corrective Action card").toMatchObject({ templateKey: "dpoa", employeeName: "Briony Fellwater" });
      expect(issueLine(reply), "the Issue is the request").not.toMatch(REQUEST_WORDS);
      t.draftWrites({ observation: "Observed:\nCA for Briony Fellwater because of under performance in salon metrics" });
      const observation = t.values(await thread.create()).observation ?? "";
      expect(observation, `the Observation is the request:\n${observation}`).not.toMatch(REQUEST_WORDS);
      expect(observation).toMatch(/under performance in salon metrics/i);
    },
  },
  {
    id: "nov6-ca-reason-at-store-then-account",
    title: "\"create a ca for <name> at <store>, she was late on 10-5 and 10-15 …\": the Issue and the Observation are the account, not the request",
    report: "audit of #237 (live, 26 Oct 2026): the card's Issue read \"create a ca for <name> at dodge, she was late on 10-5 and 10-15\"",
    status: { open: "with production's flags the card's Issue starts with the request (\"create a ca for <name> at dodge, …\")" },
    fixFlags: FLAG,
    async run(t) {
      vi.setSystemTime(new Date("2026-10-26T15:30:00Z"));
      t.directory([...STAFF]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("create a ca for remy calder at dodge, she was late on 10-5 and 10-15. i coached her on 10-16 about being late");
      expect(thread.proposal, "no Corrective Action card").toMatchObject({ templateKey: "dpoa", employeeName: "Remy Calder" });
      const issue = issueLine(reply);
      expect(issue, `the card has no Issue:\n${reply.content}`).toMatch(/late on 10-5 and 10-15/);
      expect(issue, `the Issue is the request:\n${issue}`).not.toMatch(REQUEST_WORDS);
      expect(issue, "the coaching is the offence").not.toMatch(/coach/i);
      t.draftWrites({ observation: "Observed:\ncreate a ca for Remy Calder at dodge, she was late on 10-5 and 10-15." });
      const observation = t.values(await thread.create()).observation ?? "";
      expect(observation, `the Observation is the request:\n${observation}`).not.toMatch(REQUEST_WORDS);
      expect(observation).toMatch(/late on 10-5 and 10-15/);
    },
  },
  {
    id: "nov6-ca-reason-negative-account",
    title: "negative control: an Observation that is the account is left as the model wrote it",
    report: `${REPORT}, negative control`,
    status: "fixed",
    fixFlags: FLAG,
    async run(t) {
      const thread = start(t);
      await thread.say("CA for Briony Fellwater due to under performance in salon metrics");
      t.draftWrites({ observation: "Observed:\nBriony Fellwater did not meet her salon metrics in October." });
      const observation = t.values(await thread.create()).observation ?? "";
      expect(observation, `the account was rewritten:\n${observation}`).toMatch(/Briony Fellwater did not meet (?:her|the) salon metrics/);
      expect(observation).not.toMatch(/under performance in salon metrics/i);
    },
  },
];
