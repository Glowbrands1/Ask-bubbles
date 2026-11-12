import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext, onStoryClock } from "./cases";

/**
 * ============================================================================
 * A CUSTOMER COMPLAINT IS THE ACCOUNT, NOT THE DATE LINE BEFORE IT (QA's audit, 7 Nov 2026; port of the sibling app's
 * COMPLAINT_ACCOUNT_ENABLED)
 * ============================================================================
 *
 * A real manager's chat in this app (3 Nov 2026), found by QA's audit: "create a ca form for <name>", then "verbal
 * warning The date she complained was Oct 31st . The customer said she was giving her an attitude … very rude to her
 * … no payroll deduct." The card's Issue was "verbal warning The date she complained was Oct 31st", and the level was
 * read as history: "I've treated the earlier warning you mentioned as previous corrective action history". The
 * sibling app already reads this turn's level as the form's ("Verbal Warning, as you said") and keeps the complaint
 * as the account; here COMPLAINT_ACCOUNT_ENABLED (`forms/warning-level.ts`, `forms/incident-issue.ts`). The manager's
 * words; the people are invented (STAFF's Marnie Holloway; the district manager "Ottoline Brackett", on neither
 * directory).
 */
const SAID =
  "verbal warning The date she complained was Oct 31st . The customer said she was giving her an attitude when she brought up that the register was charging for scent in her lotion refills and it has never done that before. When Marnie spoke with District manager Ottoline Brackett on the phone about how to fix this, Marnie told the customer that she was making her job really hard. The customer reached out to district manager Ottoline Brackett saying Marnie was very rude to her and Marnie told her she knows how to do her job she has worked here for two years. no payroll deduct.";
const FIX = ["COMPLAINT_ACCOUNT_ENABLED"];
const REPORT = "QA's audit (7 Nov 2026), a real manager's chat here (3 Nov 2026): \"Complaint mentioned in passing not used as the account\"";
const EARLIER = /treated the earlier warning you mentioned as previous corrective action history/i;

const line = (content: string, label: string) => new RegExp(String.raw`\*\*${label}:\*\*[^\n·]*`).exec(content)?.[0] ?? "";

function start(t: ReplayContext) {
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV8_COMPLAINT_ACCOUNT_CASES: ReplayCase[] = [
  {
    id: "nov8-complaint-account-issue",
    title: "\"create a ca form for <name>\", then \"verbal warning The date she complained was Oct 31st . The customer said …\": the card's Issue is what the customer said happened, not the date line",
    report: REPORT,
    status: { open: "the card's Issue is \"verbal warning The date she complained was Oct 31st\"" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say("create a ca form for Marnie Holloway");
      const reply = await thread.say(SAID);
      const account = line(reply.content, "Issue") || line(reply.content, "Observation of Offense");
      expect(account, `no account on the card:\n${reply.content}`).not.toBe("");
      expect(account, `the account is the date line, not the complaint:\n${reply.content}`).toMatch(/attitude|rude|making her job really hard/i);
      expect(account, `the account opens with the warning level:\n${reply.content}`).not.toMatch(/\*\*(?:Issue|Observation of Offense):\*\*\s*verbal warning/i);
    },
  },
  {
    id: "nov8-complaint-account-level",
    title: "…the same turn: \"verbal warning\" that opens it is this form's Type of Warning, never an earlier warning",
    report: REPORT,
    status: { open: "\"I've treated the earlier warning you mentioned as previous corrective action history\", and no Type of Warning" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say("create a ca form for Marnie Holloway");
      const reply = await thread.say(SAID);
      expect(reply.content, `the level is read as history:\n${reply.content}`).not.toMatch(EARLIER);
      expect(reply.content, `the level is not the form's:\n${reply.content}`).toMatch(/\*\*Type of warning:\*\* Verbal Warning, as you said/i);
    },
  },
  {
    id: "nov8-complaint-account-negative-dated-history",
    title: "negative: \"she was given a verbal warning on 10/1. The customer said she was rude today\" keeps the dated warning as history",
    report: `${REPORT} (the condition: the level must open the turn and run straight on)`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say("create a ca form for Marnie Holloway");
      const reply = await thread.say("she had a verbal warning on 10/1. The customer said she was rude to her at the register today");
      expect(reply.content, `a dated earlier warning became this form's level:\n${reply.content}`).not.toMatch(/\*\*Type of warning:\*\* Verbal Warning, as you said/i);
    },
  },
];

// Gate-Bubbles-5 (G5-743): these cases tell a story dated after the pack's 10/26/2026; they run on a day after it.
onStoryClock(NOV8_COMPLAINT_ACCOUNT_CASES);
