import { expect, vi } from "vitest";

import { REVIEWS_SOURCE } from "@/lib/ai/agent-loop/data-tools";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { lastResult, loopStandIn, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * GOOGLE REVIEWS REACH THE LOOP'S MODEL (read_reviews; CLAUDE.md rule 5; the loop port, QA 21 Nov 2026)
 * ============================================================================
 *
 * "Anything new in the app is readable by the AI." The loop never looks at the Google Reviews page; it reads it through
 * read_reviews (`lib/ai/agent-loop/data-tools.ts`), the same block the chat reads. These cases ask in the managers' own
 * words from this app's reports (QA, 18 Nov 2026: "How many Google reviews did we get this week?"; the manager of 19 Nov
 * 2026: "per month pls last 3 mos last 6 mos and YTD") and assert the page's figures reach what the loop's model is
 * shown, through the real chat route with the signed-in manager's scope. The figures are the harness's fixed reads
 * (`replay-pack-e2e.test.ts`): 7 stores, 2 qualifying reviews each this week, 2 a month in each full month this year.
 * The stand-in only decides to call the tool; everything it is shown is the app's.
 */

const REPORT = "QA, 21 Nov 2026 (the loop port, CLAUDE.md rule 5): a Google review question reaches the page's figures through read_reviews";
const THIS_WEEK = "How many Google reviews did we get this week?";
const L3_L6_YTD = "How many Google reviews did we get per month, last 3 mos, last 6 mos and YTD?";

/** One read_reviews call with this input, then a reply; what the tool returned to the model, as the model saw it. */
function reviewsCall(t: ReplayContext, input: Record<string, unknown>) {
  const model = loopStandIn((view: LoopView) => (lastResult(view, "read_reviews") ? { text: "Here is what the Google Reviews page shows." } : { tool: "read_reviews", input }));
  t.loopModel!(model);
  return {
    model,
    /** The tool's result as the model was shown it (its last step's view), as text. */
    seen: () => JSON.stringify(model.views.flatMap((view) => view.results.filter((result) => result.tool === "read_reviews")).at(-1)?.output ?? {}),
  };
}

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-18T18:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV21_AGENT_LOOP_READ_REVIEWS_CASES: ReplayCase[] = [
  {
    id: "nov21-agent-loop-read-reviews-this-week",
    title: `"${THIS_WEEK}" through the loop: read_reviews returns this week's and last week's figures for every store, the manager's own marked, and they reach the model's view`,
    report: `${REPORT}; QA's words of 18 Nov 2026`,
    status: "fixed",
    async run(t) {
      const thread = start(t);
      const { model, seen } = reviewsCall(t, {});
      await thread.say(THIS_WEEK);
      const output = seen();
      expect(model.calls, "the loop's model was never asked").toBeGreaterThanOrEqual(2);
      expect(output, "read_reviews was not reached through the loop").toContain(REVIEWS_SOURCE);
      expect(output).toContain("GOOGLE REVIEWS — THIS WEEK AND LAST WEEK");
      expect(output).toContain("This week: Mon, Nov 16 – Sun, Nov 22");
      expect(output).toContain("All 7 stores together: this week 14 reviews (14 qualifying), average 5.0 stars; last week 28 reviews (21 qualifying), average 4.5 stars.");
      expect(output, "the manager's own store is not marked").toContain("Omaha Dodge, NE (store 264, this manager's store): this week 2 reviews");
      expect(output).toContain('"has_figures":true');
    },
  },
  {
    id: "nov21-agent-loop-read-reviews-l3-l6-ytd",
    title: `"${L3_L6_YTD}" through the loop: read_reviews with the period returns L3, L6 and YTD per store, and they reach the model's view`,
    report: `${REPORT}; the manager's request of 19 Nov 2026 ("per month pls last 3 mos last 6 mos and YTD")`,
    status: "fixed",
    async run(t) {
      const thread = start(t);
      const { seen } = reviewsCall(t, { period: "last 3 months, last 6 months and YTD" });
      await thread.say(L3_L6_YTD);
      const output = seen();
      expect(output).toContain("GOOGLE REVIEWS — L3, L6, YTD AND MONTH BY MONTH");
      expect(output).toContain("L3 = last 3 full months (Aug – Oct 2026)");
      expect(output).toContain("All 7 stores together (qualifying): L3 42, L6 84, YTD 147.");
      expect(output).toContain("Omaha Dodge, NE (store 264, this manager's store): L3 6, L6 12, YTD 21.");
    },
  },
];
