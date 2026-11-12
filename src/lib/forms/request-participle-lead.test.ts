import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";
import { incidentSplitFixEnabled } from "@/lib/config/chat-quality-flags";

import { correctiveActionIssue } from "./incident-issue";

/** REQUEST_PARTICIPLE_LEAD_ENABLED (the sibling app's round-5 live check, QA, 8 Nov 2026); invented people. */
const REPORTED =
  "I need a corrective action made for under performance. Wren Halloway was below on PPTA, LPSVA, Club Average, Club Close % and Spa in the month of October.";
/** Production's flags, as the replay pack reads them (the Issue reader's result depends on several). */
const production = JSON.parse(readFileSync("src/config/production-flags.json", "utf8")) as { on: string[]; assumedOn: string[] };
const PRODUCTION = [...production.on, ...production.assumedOn];

function flags(on: boolean) {
  for (const flag of PRODUCTION) vi.stubEnv(flag, "true");
  vi.stubEnv("REQUEST_PARTICIPLE_LEAD_ENABLED", on ? "true" : "false");
  // Changed on purpose (9 Nov 2026): the "off" half is the Issue as it was before the flag, in a world where round 5's
  // ISSUE_AFTER_REQUEST_REASON (live since 8 Nov) and the flag are both off. ISSUE_AFTER_REQUEST_REASON alone already
  // makes the account the Issue for this wording, so with production's flags read from the file the old pin failed.
  if (!on) vi.stubEnv("ISSUE_AFTER_REQUEST_REASON_ENABLED", "false");
}

afterEach(() => vi.unstubAllEnvs());

describe("REQUEST_PARTICIPLE_LEAD: the Issue", () => {
  it("off: the request leads the Issue (the report)", () => {
    flags(false);
    // Changed on purpose (QA's October triage, 10 Nov 2026): INCIDENT_SPLIT_FIX_ENABLED on (#189) reads the request's account in whole sentences, which already leaves out what this pin reproduces; flag off unchanged.
    expect(correctiveActionIssue(REPORTED, "Wren Halloway") ?? "").toMatch(
      incidentSplitFixEnabled() ? /^under performance\. Wren Halloway was below/ : /^I need a corrective action made for under performance/,
    );
  });

  it.each(["made", "done", "written up"])("on: \"… %s for under performance. <A> was below …\": the Issue is the account", (participle) => {
    flags(true);
    const issue = correctiveActionIssue(REPORTED.replace("made", participle), "Wren Halloway") ?? "";
    expect(issue).toMatch(/^Wren Halloway was below on PPTA/);
    expect(issue).not.toMatch(/corrective action|made for|done for/i);
  });

  it("on: \"… made for <A> for late opening the store on 11/2\": the account, without the request", () => {
    flags(true);
    const issue = correctiveActionIssue("I need a corrective action made for Remy Calder for late opening the store on 11/2", "Remy Calder") ?? "";
    expect(issue).toMatch(/late opening the store on 11\/2/);
    expect(issue).not.toMatch(/\bmade for\b/i);
  });

  it("on: a request with only its reason keeps the reason (nothing else says what happened)", () => {
    flags(true);
    expect(correctiveActionIssue("I need a corrective action made for under performance", "Wren Halloway") ?? "").toMatch(/under performance/i);
  });
});
