import { expect, vi } from "vitest";

import { WEST_DODGE, STAFF, type DirectoryRow, type ReplayAnswer, type ReplayCase } from "./cases";

/**
 * The sibling app's round-5 live check (QA, 8 Nov 2026; first seen there 6 Nov): a manager's first message,
 *   "I need a corrective action made for under performance. <A> was below on UPT, ATV, Average Ticket, Bundle Rate %
 *    and Gift in the month of October."
 * Here, with production's flags, the card's Issue is the whole request: "I need a corrective action made for under
 * performance. <A> was below on UPT …", and "… made for <A> for late opening the store on 11/2" keeps "I need a
 * corrective action made for <A> for …". REQUEST_PARTICIPLE_LEAD_ENABLED (`forms/incident-issue.ts`, the same flag as
 * the sibling's) reads "made / done / written up for" as part of the request, and a request whose reason is only a
 * sales reason leaves the Issue to the account. The manager's words (the sibling's metric names, kept as QA's case);
 * the people are invented.
 */
const FLAG = "REQUEST_PARTICIPLE_LEAD_ENABLED";
const REPORT = "The sibling app's round-5 live check (QA, 8 Nov 2026): the account began with the request; here the Issue is the whole request";
const ACCOUNT = "Remy Calder was below on UPT, ATV, Average Ticket, Bundle Rate % and Gift in the month of October";
/** QA's wording, the real name swapped for an invented one. */
const REPORTED =
  "I need a corrective action made for under performance. Wren Halloway was below on UPT, ATV, Average Ticket, Bundle Rate % and Gift in the month of October.";
const WREN: DirectoryRow = {
  id: "e-wren",
  firstName: "Wren",
  lastName: "Halloway",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

function observationLine(reply: ReplayAnswer): string {
  return reply.content.split("\n").find((line) => /\*\*(?:Observation of Offense|Issue):?\*\*/i.test(line)) ?? "";
}

async function observation(t: Parameters<ReplayCase["run"]>[0], said: string): Promise<string> {
  vi.setSystemTime(new Date("2026-11-07T18:56:00Z"));
  t.directory([...STAFF, WREN]);
  t.as("location_manager", WEST_DODGE);
  return observationLine(await t.thread().say(said));
}

export const NOV8_OBSERVATION_MADE_FOR_CASES: ReplayCase[] = [
  {
    id: "nov8-observation-made-for-under-performance",
    title: "\"I need a corrective action made for under performance. <A> was below on UPT, …\": the Observation starts at the account, never \"made for\"",
    report: REPORT,
    status: { open: "the card's Issue is the whole request (\"I need a corrective action made for …\")" },
    fixFlags: [FLAG],
    async run(t) {
      const line = await observation(t, REPORTED);
      expect(line, `the request's words lead the Observation:\n${line}`).not.toMatch(/(?:Offense|Issue):\*\*\s*(?:made|done)\s+for\b/i);
      expect(line, `the Observation does not start at the account:\n${line}`).toMatch(/(?:Offense|Issue):\*\*\s*Wren Halloway was below on UPT/);
    },
  },
  {
    id: "nov8-observation-done-for-under-performance",
    title: "the same with \"done for\"",
    report: REPORT,
    status: { open: "the card's Issue is the whole request (\"I need a corrective action made for …\")" },
    fixFlags: [FLAG],
    async run(t) {
      const line = await observation(t, `I need a corrective action done for under performance. ${ACCOUNT}`);
      expect(line, `the Observation does not start at the account:\n${line}`).toMatch(/(?:Offense|Issue):\*\*\s*Remy Calder was below on UPT/);
    },
  },
  {
    id: "nov8-observation-made-for-late-opening",
    title: "negative: \"… made for <A> for late opening the store on 11/2\": the account is kept, without \"made for <A>\"",
    report: REPORT,
    status: { open: "the card's Issue is the whole request (\"I need a corrective action made for …\")" },
    fixFlags: [FLAG],
    async run(t) {
      const line = await observation(t, "I need a corrective action made for Remy Calder for late opening the store on 11/2");
      expect(line, `the account is lost:\n${line}`).toMatch(/late opening the store on 11\/2/);
      expect(line, `the request's words are in the Observation:\n${line}`).not.toMatch(/\bmade for\b/i);
    },
  },
];
