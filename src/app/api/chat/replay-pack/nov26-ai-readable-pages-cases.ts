import { expect, vi } from "vitest";

import { AI_READABLE_PAGES, readablePagesLine } from "@/config/ai-readable-pages";
import { REVIEWS_SOURCE } from "@/lib/ai/agent-loop/data-tools";

import { WEST_DODGE, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { lastResult, loopStandIn, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE PAGES THE AI CAN READ REACH THE MODEL (port of the sibling app's f039; CLAUDE.md §5)
 * ============================================================================
 *
 * Pau, 20 Nov 2026: "how can we program this AI to read new things added to the app? i need to always say it?" The
 * page list (`src/config/ai-readable-pages.ts`) writes the rules book's line naming every page the AI can read and the
 * tool for each. This case runs the real chat route and asserts that line is in what the model is given, and that a
 * manager asking about one of those pages, in a manager's words, reaches its tool with their scope.
 */

const REPORT = "Pau, 20 Nov 2026: \"how can we program this AI to read new things added to the app? i need to always say it?\" (port of the sibling app's f039)";
const ASK = "what does the google reviews page say for my store";

export const NOV26_AI_READABLE_PAGES_CASES: ReplayCase[] = [
  {
    id: "nov26-ai-readable-pages-reach-the-model",
    title: `"${ASK}": the rules the model is given name every page it can read (from the page list), and Google Reviews is read through read_reviews`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-18T18:00:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as("location_manager", WEST_DODGE);
      const model = loopStandIn((view: LoopView) =>
        lastResult(view, "read_reviews") ? { text: "Here is what the Google Reviews page shows." } : { tool: "read_reviews", input: {} });
      t.loopModel!(model);
      await t.thread().say(ASK);

      const line = readablePagesLine(AI_READABLE_PAGES)!;
      expect(model.views[0]?.system, "the readable-pages line is not in what the model is given").toContain(line);
      for (const page of AI_READABLE_PAGES.filter((entry) => entry.kind === "page" && entry.reader && !entry.route.includes("["))) {
        expect(line, `${page.title} is readable but not named to the model`).toContain(page.title);
      }
      const output = JSON.stringify(model.views.flatMap((view) => view.results.filter((result) => result.tool === "read_reviews")).at(-1)?.output ?? {});
      expect(output, "read_reviews was not reached for the Google Reviews page").toContain(REVIEWS_SOURCE);
      expect(output).toContain('"has_figures":true');
    },
  },
];
