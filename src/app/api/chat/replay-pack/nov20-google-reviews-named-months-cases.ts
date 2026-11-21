import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A MONTH OR PERIOD THE MANAGER NAMES READS THE MONTH-BY-MONTH FIGURES (ported from the sibling app: QA's code audit,
 * 20 Nov 2026)
 * ============================================================================
 *
 * "how many reviews did <store> get last month?", "in October" and "last 2 months" matched nothing in MONTHS_PERIOD, so
 * the chat block gave only this month to date and the model had no figure for the month asked. Any month or period the
 * manager names now reads the Google Reviews page's month-by-month figures. CLAUDE.md §5: anything a manager can ask
 * about must be readable by the AI.
 */
const FLAG = "GOOGLE_REVIEWS_IN_CHAT_ENABLED";
const REPORT = "QA's code audit (20 Nov 2026), ported: a named month or period (\"last month\", \"in October\", \"last 2 months\") gave only this month to date";
const QUESTIONS = [
  ["last-month", "how many reviews did we get last month?"],
  ["october", "how many Google reviews did we get in October?"],
  ["last-2-months", "how many Google reviews did we get the last 2 months?"],
] as const;

export const NOV20_GOOGLE_REVIEWS_NAMED_MONTHS_CASES: ReplayCase[] = QUESTIONS.map(([key, question]) => ({
  id: `nov20-google-reviews-named-month-${key}`,
  title: `"${question}": the chat block gives the month-by-month figures, so the month asked about is there`,
  report: REPORT,
  status: "fixed",
  fixFlags: [FLAG],
  async run(t) {
    vi.setSystemTime(new Date("2026-11-18T18:00:00Z"));
    t.directory(STAFF);
    t.as("location_manager", WEST_DODGE);
    await t.thread().say(question);
    const data = t.lastReportData?.() ?? "";
    expect(data, "the month asked about was not given, only this month to date").toContain("GOOGLE REVIEWS — L3, L6, YTD AND MONTH BY MONTH");
  },
}));
